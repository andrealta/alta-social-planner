-- 0038_plataformas.sql
--
-- O estado das plataformas: o que mudou no Meta, no TikTok e nos
-- outros, buscado nas fontes de primeira mao e lido pela geracao.
--
-- POR QUE ISTO NAO E UMA BUSCA DENTRO DA GERACAO
--
-- A pesquisa da 0035 roda a cada planejamento porque a pergunta dela
-- muda a cada marca e a cada mes: sazonalidade do setor, referencia
-- criativa. Esta aqui e o contrario. A plataforma muda algumas vezes
-- por ano, a resposta e a mesma para todas as marcas, e perguntar por
-- geracao significaria pagar cinco vezes para receber cinco respostas
-- ligeiramente diferentes sobre o mesmo fato.
--
-- Fora da geracao ela fica datada, fica uma so, e principalmente fica
-- REVISAVEL.
--
-- POR QUE EXISTE APROVACAO
--
-- Esta nota entra no prompt de todo planejamento de todas as marcas.
-- E o texto de maior alcance do sistema inteiro. Uma nota errada nao
-- estraga uma peca, estraga o mes de todo mundo.
--
-- Entao ela nasce PENDENTE e a geracao ignora nota pendente. Alguem
-- le, e so entao ela passa a valer. E o mesmo principio das duas
-- etapas para apagar marca: a barreira nao e tecnica, e uma decisao
-- consciente no meio do caminho.
--
-- O QUE ELA PODE E O QUE ELA NAO PODE DIZER
--
-- Pode: o que a plataforma anunciou, com data e link. Formato novo,
-- formato aposentado, objetivo novo, limite que mudou, especificacao.
-- Isso e fato, tem fonte primaria e muda COMO uma peca e feita.
--
-- Nao pode: o que performa melhor. Isso nao e fato sobre o mundo,
-- depende da oferta e da conta, e a internet sobre esse assunto e
-- quase toda blog de agencia reciclando blog de agencia. Quem responde
-- performance e o dado da propria conta, nunca esta tabela.

create table if not exists public.plataforma_nota (
  id             bigserial primary key,
  quando         timestamptz not null default now(),
  /** Quantos dias para tras a busca olhou. */
  periodo_dias   integer not null default 30,
  /** A nota em si, ja em portugues, pronta para entrar no prompt. */
  texto          text not null,
  /** O que a IA diz que usou: [{titulo, url}]. */
  fontes         jsonb not null default '[]'::jsonb,
  /**
   * O que a API diz que ela LEU de verdade. Duas listas de proposito:
   * quando divergem, da para ver. Uma lista so nao e conferivel.
   */
  lidas          jsonb not null default '[]'::jsonb,
  buscas         integer not null default 0,
  custo_usd      numeric(10, 4),
  modelo         text,
  /** Nula enquanto ninguem leu. A geracao so enxerga nota aprovada. */
  aprovada_em    timestamptz,
  aprovada_por   uuid references auth.users(id) on delete set null,
  aprovada_nome  text,
  /** Nota recusada fica, para a proxima nao repetir o erro dela. */
  descartada_em  timestamptz,
  descartada_por uuid references auth.users(id) on delete set null,
  motivo         text
);

comment on table public.plataforma_nota is
  'O que mudou nas plataformas, das fontes de primeira mao. So vale na geracao depois de aprovada (0038).';

-- O indice serve a unica consulta quente: a nota valendo agora.
create index if not exists plataforma_nota_valendo
  on public.plataforma_nota (aprovada_em desc)
  where aprovada_em is not null and descartada_em is null;

alter table public.plataforma_nota enable row level security;
alter table public.plataforma_nota force row level security;

-- A equipe le. E material de trabalho: quem revisa um planejamento
-- precisa poder ver por que a IA sugeriu o que sugeriu.
drop policy if exists plataforma_nota_le on public.plataforma_nota;
create policy plataforma_nota_le on public.plataforma_nota for select to authenticated
  using (public.is_staff());

-- Aprovar e recusar e da administracao.
drop policy if exists plataforma_nota_decide on public.plataforma_nota;
create policy plataforma_nota_decide on public.plataforma_nota for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Escrever nota e do script, que roda sem sessao de usuario.
drop policy if exists plataforma_nota_escreve on public.plataforma_nota;
create policy plataforma_nota_escreve on public.plataforma_nota for insert to authenticated
  with check (auth.uid() is null);

grant select, insert, update on public.plataforma_nota to authenticated;
grant usage on sequence public.plataforma_nota_id_seq to authenticated;

-- O cliente nunca. Nao e segredo, e ruido: ele nao tem o que fazer
-- com mudanca de especificacao do gerenciador de anuncios.
revoke delete on public.plataforma_nota from authenticated;

-- ------------------------------------------------------------------
-- O texto da nota nao se reescreve
-- ------------------------------------------------------------------
--
-- Aprovar muda a situacao dela, nunca o conteudo. Sem isto, "aprovada"
-- nao quer dizer nada: bastaria aprovar uma nota boa e trocar o texto
-- depois. O que se le e o que vale.
create or replace function public.plataforma_nota_guard()
returns trigger
language plpgsql
as $$
begin
  if new.texto is distinct from old.texto
     or new.fontes is distinct from old.fontes
     or new.lidas is distinct from old.lidas
     or new.quando is distinct from old.quando then
    raise exception 'A nota nao se reescreve. Gere outra e descarte esta.';
  end if;
  return new;
end $$;

drop trigger if exists plataforma_nota_imutavel on public.plataforma_nota;
create trigger plataforma_nota_imutavel
  before update on public.plataforma_nota
  for each row execute function public.plataforma_nota_guard();

-- ------------------------------------------------------------------
-- A nota que esta valendo
-- ------------------------------------------------------------------
--
-- Funcao, e nao consulta solta no codigo, porque tres lugares precisam
-- da MESMA definicao de "valendo": a geracao, a tela e o script. Tres
-- copias de uma regra de tres condicoes e tres chances de divergirem.
--
-- Ela e SECURITY DEFINER para enxergar a tabela inteira, e por isso
-- carrega a propria pergunta de "quem esta chamando". Funcao definer
-- sem essa pergunta e um buraco com cara de atalho: a politica da
-- tabela fecha para o cliente e a funcao reabre.
create or replace function public.plataforma_nota_valendo()
returns table (id bigint, quando timestamptz, texto text, fontes jsonb, dias integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select n.id, n.quando, n.texto, n.fontes,
         greatest(0, extract(day from (now() - n.quando))::int)
  from public.plataforma_nota n
  where (public.is_staff() or auth.uid() is null)
    and n.aprovada_em is not null and n.descartada_em is null
  order by n.aprovada_em desc
  limit 1
$$;

comment on function public.plataforma_nota_valendo is
  'A nota de plataformas em vigor, com a idade em dias. Vazio quando nenhuma foi aprovada.';

revoke execute on function public.plataforma_nota_valendo() from public;
grant execute on function public.plataforma_nota_valendo() to authenticated;

-- ------------------------------------------------------------------
-- Conferencia
-- ------------------------------------------------------------------
do $$
declare ruim text;
begin
  if not exists (
    select 1 from pg_class
    where relname = 'plataforma_nota' and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'plataforma_nota ficou sem RLS forcada';
  end if;

  -- Nenhuma politica pode devolver nota para cliente.
  select string_agg(p.polname, ', ') into ruim
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where c.relname = 'plataforma_nota'
    and pg_get_expr(p.polqual, p.polrelid) like '%client%';
  if ruim is not null then
    raise exception 'Nota de plataforma nao e do cliente: %', ruim;
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'plataforma_nota_imutavel') then
    raise exception 'Faltou o gatilho que impede reescrever a nota';
  end if;
end $$;
