-- 0030_operand_campos.sql
--
-- A resposta real do Operand trouxe mais do que a documentação
-- prometia, e uma coisa em especial que muda o que dá para fazer aqui:
-- TEMPO. Cada job vem com `estimatedTime` e `workedTime`, em minutos.
-- Eu tinha dito que a API não tinha apontamento de horas. Tinha.
--
-- Isso é a diferença entre saber que uma peça está atrasada e saber
-- que ela foi orçada em uma hora e já consumiu quatro. A segunda
-- conversa é a que muda preço de contrato.
--
-- Também vieram o cliente (id e nome) dentro do próprio job, os
-- contadores de tarefa, a cor do status e a data de atualização. Tudo
-- isso estava sendo jogado fora em `bruto` e agora vira coluna, que é
-- o que permite consultar.
--
-- Nada aqui é escrito pelo site: a cópia continua sendo alimentada só
-- pelo script, e as políticas de 0029 continuam valendo sem mudança.

alter table public.operand_jobs
  add column if not exists cliente_id         integer,
  add column if not exists cliente_nome       text,
  add column if not exists status_cor         text,
  add column if not exists responsavel_id     integer,
  add column if not exists sequencia          integer,
  add column if not exists atualizado_em      timestamptz,
  add column if not exists tempo_estimado     integer,
  add column if not exists tempo_trabalhado   integer,
  add column if not exists tarefas_abertas    integer,
  add column if not exists tarefas_fechadas   integer,
  add column if not exists tarefas_canceladas integer;

comment on column public.operand_jobs.tempo_estimado is
  'Minutos orçados para o job no Operand (estimatedTime).';
comment on column public.operand_jobs.tempo_trabalhado is
  'Minutos já apontados no Operand (workedTime).';
comment on column public.operand_jobs.sequencia is
  'O número do job que a equipe vê na tela do Operand (sequenceId).';

-- Buscar por prazo é o que a agenda faz o tempo todo.
create index if not exists operand_jobs_prazo on public.operand_jobs (brand_id, prazo);

-- ------------------------------------------------------------------
-- Um resumo por marca, para a tela não precisar somar na mão.
--
-- SECURITY DEFINER com `is_staff()` dentro: quem não é da equipe não
-- recebe número nenhum, nem agregado. Cliente não vê produção.
-- ------------------------------------------------------------------
create or replace function public.operand_resumo(b uuid)
returns table (
  jobs             integer,
  atrasados        integer,
  minutos_orcados  integer,
  minutos_gastos   integer,
  visto_em         timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*)::integer,
    count(*) filter (where prazo is not null and prazo < current_date)::integer,
    coalesce(sum(tempo_estimado), 0)::integer,
    coalesce(sum(tempo_trabalhado), 0)::integer,
    max(visto_em)
  from public.operand_jobs
  where brand_id = b and public.is_staff()
$$;

revoke all on function public.operand_resumo(uuid) from public;
grant execute on function public.operand_resumo(uuid) to authenticated;

-- ------------------------------------------------------------------
-- Conferência: as colunas existem e ninguém ganhou permissão de
-- escrita por engano.
-- ------------------------------------------------------------------
do $$
declare
  faltando text;
  escrita  text;
begin
  select string_agg(c, ', ') into faltando
  from unnest(array[
    'cliente_id','cliente_nome','status_cor','responsavel_id','sequencia',
    'atualizado_em','tempo_estimado','tempo_trabalhado',
    'tarefas_abertas','tarefas_fechadas','tarefas_canceladas'
  ]) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'operand_jobs' and column_name = c
  );
  if faltando is not null then
    raise exception 'Faltou criar coluna em operand_jobs: %', faltando;
  end if;

  -- Escrita só é aceitável quando vem de fora do site, isto é, sem
  -- usuário logado. Qualquer outra regra de escrita aqui seria um
  -- caminho para o site alterar a cópia, e a cópia não é editável.
  select string_agg(polname, ', ') into escrita
  from pg_policy
  where polrelid = 'public.operand_jobs'::regclass
    and polcmd in ('*', 'w', 'a', 'd')
    and coalesce(pg_get_expr(polqual, polrelid), '') not like '%auth.uid() IS NULL%';
  if escrita is not null then
    raise exception 'Política de escrita inesperada em operand_jobs: %', escrita;
  end if;
end $$;
