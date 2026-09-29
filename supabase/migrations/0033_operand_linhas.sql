-- 0033_operand_linhas.sql
--
-- Um cliente do Operand, varias marcas do planner.
--
-- A conta 3535 e a Hero Brasil, a fabricante. Dentro dela convivem a
-- Queensberry, a Hero e o trabalho institucional da propria empresa.
-- Os titulos dizem de quem e cada job: comecam com o nome da linha
-- antes da primeira barra ("Queens | E-mail MKT 3 | Linha Diet").
--
-- Ate agora o banco proibia duas marcas apontarem para o mesmo cliente
-- do Operand. Essa regra estava errada, e nao por pouco: ela obrigava
-- a escolher entre alimentar a base da Queensberry com trabalho da
-- Hero, ou nao alimentar nenhuma das duas.
--
-- POR QUE ISSO IMPORTA MAIS AQUI DO QUE PARECE
--
-- Esses dados nao vao para tela nenhuma. Eles entram no raciocinio da
-- IA quando ela monta o planejamento. Uma marca que "aprende" que
-- produz video toda semana porque os videos eram da outra marca passa
-- a receber sugestao descolada da realidade, com cara de fundamentada.
-- Dado errado sem dono e melhor que dado errado com dono, porque o
-- primeiro levanta suspeita e o segundo nao.

drop index if exists public.brands_operand_client_idx;

alter table public.brands
  add column if not exists operand_linhas text[];

comment on column public.brands.operand_linhas is
  'Inicios de titulo que pertencem a esta marca dentro do cliente do Operand. '
  'Vazio ou nulo quer dizer "todos os jobs do cliente". '
  'Um termo comecando com ! exclui: {Hero,"!Hero Brasil"} pega a Hero e deixa a fabricante de fora.';

alter table public.operand_jobs
  add column if not exists linha text;

comment on column public.operand_jobs.linha is
  'O pedaco do titulo antes da primeira barra, que foi o que decidiu a marca dona.';

create index if not exists operand_jobs_linha on public.operand_jobs (brand_id, linha);

-- ------------------------------------------------------------------
-- Conferencia.
-- ------------------------------------------------------------------
do $$
declare
  n integer;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'operand_linhas'
  ) then
    raise exception 'Faltou criar brands.operand_linhas';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'operand_jobs' and column_name = 'linha'
  ) then
    raise exception 'Faltou criar operand_jobs.linha';
  end if;

  -- A regra antiga tem que ter saido mesmo, senao a segunda marca
  -- falharia na hora de ligar e ninguem entenderia por que.
  select count(*) into n from pg_indexes
  where schemaname = 'public' and indexname = 'brands_operand_client_idx';
  if n > 0 then
    raise exception 'O indice unico de operand_client_id ficou para tras';
  end if;
end $$;
