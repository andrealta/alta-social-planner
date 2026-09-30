-- 0035_operand_ligacao.sql
--
-- Uma marca aqui, varios clientes no Operand.
--
-- A Habiarte cadastra cada EMPREENDIMENTO como um cliente separado no
-- Operand, mas o planejamento de redes sociais dela e um so. Entao o
-- que era "a marca aponta para um cliente" precisa virar "a marca
-- reune varios cadastros".
--
-- Isso completa o outro lado, que a 0033 resolveu pela metade. Agora
-- os dois formatos reais convivem:
--
--   varias marcas em um cliente   Queensberry e Hero dentro da conta
--                                 da fabricante, separadas pela linha
--                                 do titulo;
--   uma marca em varios clientes  Habiarte, um cadastro por
--                                 empreendimento, tudo no mesmo
--                                 planejamento.
--
-- Uma coluna em `brands` nao consegue representar o segundo caso, e
-- remendar com lista de numeros dentro de um campo so adiaria o
-- problema ate a primeira vez que alguem precisasse saber de qual
-- empreendimento veio um trabalho. Entao vira tabela.
--
-- O PADRAO POR NOME
--
-- Empreendimento novo aparece o tempo todo, e uma ligacao feita a mao
-- envelhece no dia seguinte: o proximo lancamento entra no Operand e
-- fica invisivel aqui, sem ninguem perceber. Por isso a marca pode
-- guardar um PADRAO de nome. A sincronizacao procura os clientes cujo
-- nome contem aquele texto e liga sozinha os que faltam, gravando a
-- ligacao nesta mesma tabela, marcada como automatica.
--
-- Gravar em vez de resolver na hora e de proposito: assim da para
-- olhar a lista e ver o que entrou por decisao e o que entrou por
-- regra, e desfazer o que estiver errado.

create table if not exists public.operand_ligacao (
  brand_id    uuid    not null references public.brands(id) on delete cascade,
  cliente_id  integer not null,
  /** Filtro pelo inicio do titulo, quando o cliente abriga mais de uma marca. */
  linhas      text[],
  /** O nome do cliente no Operand, para a tela nao mostrar so um numero. */
  nome        text,
  /** Entrou por padrao de nome, e nao por decisao de alguem. */
  por_padrao  boolean not null default false,
  criado_em   timestamptz not null default now(),
  primary key (brand_id, cliente_id)
);

comment on table public.operand_ligacao is
  'Quais cadastros do Operand alimentam cada marca. Muitos para muitos, de verdade.';

create index if not exists operand_ligacao_cliente on public.operand_ligacao (cliente_id);

alter table public.brands
  add column if not exists operand_padrao text;

comment on column public.brands.operand_padrao is
  'Texto procurado no nome dos clientes do Operand. Cadastro novo que casar entra sozinho.';

-- ------------------------------------------------------------------
-- O que ja estava ligado continua ligado.
-- ------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'operand_client_id'
  ) then
    execute $mig$
      insert into public.operand_ligacao (brand_id, cliente_id, linhas)
      select id, operand_client_id, operand_linhas
      from public.brands
      where operand_client_id is not null
      on conflict (brand_id, cliente_id) do nothing
    $mig$;
  end if;
end $$;

-- As colunas velhas saem: duas verdades sobre a mesma coisa e como
-- uma delas fica desatualizada sem ninguem notar.
--
-- Efeito colateral bom: `brands` e lida pelo CLIENTE da agencia, e o
-- numero do cadastro interno deixa de estar ao alcance dele. A tabela
-- nova e so da equipe.
alter table public.brands drop column if exists operand_client_id;
alter table public.brands drop column if exists operand_linhas;

-- ------------------------------------------------------------------
-- Quem le e quem escreve: igual ao resto da copia do Operand.
-- ------------------------------------------------------------------
alter table public.operand_ligacao enable row level security;
alter table public.operand_ligacao force row level security;

drop policy if exists operand_ligacao_equipe_le on public.operand_ligacao;
create policy operand_ligacao_equipe_le on public.operand_ligacao for select to authenticated
  using (public.is_staff());

drop policy if exists operand_ligacao_script on public.operand_ligacao;
create policy operand_ligacao_script on public.operand_ligacao for all to authenticated
  using (auth.uid() is null) with check (auth.uid() is null);

grant select on public.operand_ligacao to authenticated;

-- ------------------------------------------------------------------
-- Conferencia.
-- ------------------------------------------------------------------
do $$
declare ruim text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'operand_client_id'
  ) then
    raise exception 'A coluna brands.operand_client_id ficou para tras';
  end if;

  if not exists (
    select 1 from pg_class
    where relname = 'operand_ligacao' and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'operand_ligacao ficou sem RLS forcada';
  end if;

  select string_agg(polname, ', ') into ruim
  from pg_policy
  where polrelid = 'public.operand_ligacao'::regclass
    and polcmd in ('*', 'w', 'a', 'd')
    and coalesce(pg_get_expr(polqual, polrelid), '') not like '%auth.uid() IS NULL%';
  if ruim is not null then
    raise exception 'Politica de escrita inesperada em operand_ligacao: %', ruim;
  end if;
end $$;
