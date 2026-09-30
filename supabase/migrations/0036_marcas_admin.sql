-- 0036_marcas_admin.sql
--
-- Administrar marcas: arquivar, apagar, mexer no escopo, e deixar
-- registro de quem fez.
--
-- ARQUIVAR E APAGAR SAO COISAS DIFERENTES
--
-- Apagar uma marca leva junto, em cascata, os planejamentos, as pautas,
-- os conteudos, as aprovacoes do cliente, os arquivos, a copia do
-- Operand e o historico de custo. O backup e diario, entao "desfazer"
-- pode custar um dia de trabalho de todo mundo.
--
-- Arquivar resolve o caso comum: contrato encerrado. A marca some das
-- listas, para de gerar planejamento, o cliente perde o acesso, e o
-- historico continua inteiro para consulta e para o calculo de custo.
--
-- Apagar continua existindo para o caso do engano: marca criada errada,
-- duplicada, de teste. Mas so depois de arquivada. Duas etapas
-- separadas por uma decisao consciente e o que impede o clique errado,
-- e custa pouco: quem quer mesmo apagar arquiva e apaga em seguida.
--
-- O REGISTRO
--
-- `registro_admin` nao tem chave estrangeira para `brands` de proposito.
-- O registro precisa sobreviver ao que ele registra: um log que some
-- junto com a marca apagada nao serve para a unica pergunta que
-- importa depois, que e quem apagou.

alter table public.brands
  add column if not exists arquivada_em  timestamptz,
  add column if not exists arquivada_por uuid references auth.users(id);

comment on column public.brands.arquivada_em is
  'Contrato encerrado. Some das listas e para de gerar; o historico fica.';

create index if not exists brands_ativas on public.brands (arquivada_em) where arquivada_em is null;

-- ------------------------------------------------------------------
-- O registro
-- ------------------------------------------------------------------
create table if not exists public.registro_admin (
  id         bigserial primary key,
  quando     timestamptz not null default now(),
  quem       uuid references auth.users(id) on delete set null,
  /** Copiado no momento do registro: a pessoa pode sair da agencia. */
  quem_nome  text,
  acao       text not null,
  /** Sem chave estrangeira: o registro sobrevive a marca apagada. */
  brand_id   uuid,
  marca_slug text,
  marca_nome text,
  /** O que mudou, de antes para depois. */
  detalhe    jsonb not null default '{}'::jsonb
);

comment on table public.registro_admin is
  'Quem criou, arquivou, apagou marca ou mexeu no escopo. Sobrevive ao que registra.';

create index if not exists registro_admin_quando on public.registro_admin (quando desc);

alter table public.registro_admin enable row level security;
alter table public.registro_admin force row level security;

drop policy if exists registro_admin_le on public.registro_admin;
create policy registro_admin_le on public.registro_admin for select to authenticated
  using (public.is_admin());

-- O `auth.uid() is null` e o mesmo alcapao das outras tabelas: script
-- rodado da maquina da agencia, com a senha do banco, nao tem sessao de
-- usuario. Sem isso, marca criada pelo 23-marca.cmd nao apareceria no
-- registro, que e justamente o caminho por onde uma marca poderia
-- aparecer sem ninguem responder por ela.
drop policy if exists registro_admin_escreve on public.registro_admin;
create policy registro_admin_escreve on public.registro_admin for insert to authenticated
  with check (public.is_admin() or auth.uid() is null);

grant select, insert on public.registro_admin to authenticated;
grant usage on sequence public.registro_admin_id_seq to authenticated;

-- Registro nao se corrige: linha errada fica, e a linha seguinte conta
-- o que aconteceu. Log que se edita nao e log.
revoke update, delete on public.registro_admin from authenticated;

-- ------------------------------------------------------------------
-- Marca arquivada nao gera mais nada
-- ------------------------------------------------------------------
create or replace function public.marca_arquivada_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  arquivada timestamptz;
begin
  select arquivada_em into arquivada from public.brands where id = new.brand_id;
  if arquivada is not null then
    raise exception 'Esta marca esta arquivada. Reabra antes de criar planejamento.';
  end if;
  return new;
end $$;

drop trigger if exists plans_marca_arquivada on public.plans;
create trigger plans_marca_arquivada
  before insert on public.plans
  for each row execute function public.marca_arquivada_guard();

-- ------------------------------------------------------------------
-- O cliente de marca arquivada perde o acesso
-- ------------------------------------------------------------------
drop policy if exists brands_client_read on public.brands;
create policy brands_client_read on public.brands for select to authenticated
  using (
    public.auth_role() = 'client'
    and id = any(public.auth_brand_ids())
    and arquivada_em is null
  );

-- ------------------------------------------------------------------
-- Apagar so o que ja foi arquivado
-- ------------------------------------------------------------------
create or replace function public.marca_apagavel_guard()
returns trigger
language plpgsql
as $$
begin
  if old.arquivada_em is null then
    raise exception 'Arquive a marca antes de apagar. Sao duas decisoes, de proposito.';
  end if;
  return old;
end $$;

drop trigger if exists brands_so_apaga_arquivada on public.brands;
create trigger brands_so_apaga_arquivada
  before delete on public.brands
  for each row execute function public.marca_apagavel_guard();

-- ------------------------------------------------------------------
-- Conferencia
-- ------------------------------------------------------------------
do $$
declare ruim text;
begin
  if not exists (
    select 1 from pg_class
    where relname = 'registro_admin' and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'registro_admin ficou sem RLS forcada';
  end if;

  select string_agg(polname, ', ') into ruim
  from pg_policy
  where polrelid = 'public.registro_admin'::regclass and polcmd in ('w', 'd', '*');
  if ruim is not null then
    raise exception 'O registro nao pode ser alterado nem apagado: %', ruim;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'plans_marca_arquivada'
  ) then
    raise exception 'Faltou o gatilho que impede planejamento em marca arquivada';
  end if;
end $$;
