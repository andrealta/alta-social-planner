-- 0043_cotacao_e_custo.sql
--
-- A cotacao do dolar, guardada por dia, e o custo fechado para quem
-- nao e da administracao.

-- ------------------------------------------------------------------
-- 1. A cotacao de cada dia
-- ------------------------------------------------------------------
--
-- Uma linha por dia, e e de proposito que a tabela guarde a cotacao
-- COMERCIAL pura. O IOF e o spread do cartao sao politica, nao fato do
-- dia: ficam em `lib/cambio.ts`, onde se trocam em um numero so, sem
-- reescrever historico nenhum.
--
-- Por que guardar em vez de converter tudo pelo dolar de hoje: um mes
-- fechado tem de mostrar sempre o mesmo valor. Converter pela cotacao
-- de hoje faria o passado andar sozinho, e numero de tela de metrica
-- que anda sozinho e pior do que numero nenhum.
create table if not exists public.cotacao_dolar (
  dia        date primary key,
  valor      numeric(12, 6) not null check (valor > 1 and valor < 50),
  fonte      text not null,
  obtida_em  timestamptz not null default now()
);

comment on table public.cotacao_dolar is
  'Dolar comercial por dia. O acrescimo do cartao nao entra aqui: e politica, nao fato do dia (0043).';

alter table public.cotacao_dolar enable row level security;
alter table public.cotacao_dolar force row level security;

-- Toda a equipe le. A cotacao nao e segredo de ninguem, e sem ela a
-- tela nao consegue nem dizer por que um valor esta faltando.
drop policy if exists cotacao_equipe_le on public.cotacao_dolar;
create policy cotacao_equipe_le on public.cotacao_dolar for select to authenticated
  using (public.is_staff());

-- Escrever e da administracao. Quem ve o custo e quem registra a
-- cotacao: sao a mesma pessoa, e a tela so busca a cotacao quando
-- alguem abre o bloco de custo.
drop policy if exists cotacao_admin on public.cotacao_dolar;
create policy cotacao_admin on public.cotacao_dolar for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.cotacao_dolar to authenticated;

/**
 * Grava a cotacao de um dia, sem sobrescrever a que ja existe.
 *
 * Nao sobrescreve de proposito: a primeira cotacao do dia e a que vale
 * para aquele dia. Reescrever na segunda vez que alguem abre a pagina
 * mudaria valores de chamadas ja convertidas, que e exatamente o que
 * esta migracao existe para impedir.
 */
create or replace function public.registrar_cotacao(
  p_dia date,
  p_valor numeric,
  p_fonte text
) returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ja numeric;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'So a administracao registra cotacao.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_valor is null or p_valor <= 1 or p_valor >= 50 then
    raise exception 'Cotacao fora do que e plausivel para dolar/real: %', p_valor
      using errcode = 'check_violation';
  end if;

  select valor into ja from public.cotacao_dolar where dia = p_dia;
  if ja is not null then
    return ja;
  end if;

  insert into public.cotacao_dolar (dia, valor, fonte)
  values (p_dia, p_valor, coalesce(nullif(btrim(p_fonte), ''), 'desconhecida'));

  return p_valor;
end $$;

comment on function public.registrar_cotacao is
  'Guarda a cotacao do dia. Ja existindo, devolve a que estava: a primeira e a que vale (0043).';

revoke all on function public.registrar_cotacao(date, numeric, text) from public;
grant execute on function public.registrar_cotacao(date, numeric, text) to authenticated;

-- ------------------------------------------------------------------
-- 2. O custo fecha para quem nao e da administracao
-- ------------------------------------------------------------------
--
-- Esconder o bloco na tela nao e fechar nada: quem tem sessao aberta
-- monta a consulta na mao. A trava e aqui.
--
-- E aqui mora uma armadilha que quase me pegou. As rotas de IA gravam
-- a chamada com `insert(...).select('id')`, que no Postgres e um
-- INSERT ... RETURNING — e RETURNING passa pela politica de LEITURA.
-- Fechar a leitura so para a administracao faria o `select('id')`
-- voltar vazio para a equipe, o codigo seguiria sem o id (ele ignora
-- esse erro) e NENHUMA chamada da equipe teria custo e status
-- gravados depois. A conta de custo iria a zero em silencio, que e o
-- pior jeito possivel de uma tela de dinheiro quebrar.
--
-- Dai a coluna `criado_por`: a pessoa continua enxergando as proprias
-- chamadas, o RETURNING funciona, e o total da agencia continua sendo
-- so da administracao.
alter table public.ai_runs
  add column if not exists criado_por uuid references public.profiles(id) on delete set null;

alter table public.ai_runs alter column criado_por set default auth.uid();

comment on column public.ai_runs.criado_por is
  'Quem disparou a chamada. Existe para o INSERT ... RETURNING continuar funcionando com a leitura fechada (0043).';

create index if not exists ai_runs_criado_por_idx on public.ai_runs (criado_por);

drop policy if exists staff_le on public.ai_runs;
drop policy if exists ai_runs_le on public.ai_runs;
create policy ai_runs_le on public.ai_runs for select to authenticated
  using (public.is_admin() or criado_por = auth.uid());

-- ------------------------------------------------------------------
-- Conferencia
-- ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_tables where tablename = 'cotacao_dolar') then
    raise exception 'Faltou a tabela cotacao_dolar';
  end if;
  if not exists (select 1 from pg_proc where proname = 'registrar_cotacao') then
    raise exception 'Faltou a funcao registrar_cotacao';
  end if;
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'ai_runs' and p.polname = 'staff_le'
  ) then
    raise exception 'A politica antiga de leitura de ai_runs continua de pe';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.ai_runs'::regclass and attname = 'criado_por' and not attisdropped
  ) then
    raise exception 'Faltou a coluna criado_por em ai_runs';
  end if;
end $$;
