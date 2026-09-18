-- =============================================================
-- Alta Social Planner · 0015 · A varredura dos concorrentes
--
-- As tabelas `research_runs` e `research_sources` existem desde a
-- 0001, vazias. Elas foram desenhadas para pesquisa ligada a um mês:
-- `plan_id` é obrigatório. Só que a varredura de concorrentes que o
-- André pediu nasce na BIBLIOTECA da marca, por um botão, sem mês
-- nenhum em vista — e o resultado serve a todos os meses seguintes,
-- não a um.
--
-- Duas saídas possíveis: criar uma tabela nova quase igual, ou
-- afrouxar o `not null`. A tabela nova pagaria o preço de duplicar
-- políticas de segurança, que é exatamente onde erro caro acontece
-- neste sistema. Então afrouxa-se a coluna, e a coluna `kind` passa a
-- dizer de que tipo é cada varredura.
--
-- Nada aqui mexe em isolamento: as duas tabelas têm `brand_id`, então
-- já foram varridas pelo laço da 0013 e carregam as quatro políticas
-- de equipe. A verificação no fim desta migração confirma isso em vez
-- de supor — supor foi como os níveis de acesso ficaram dois meses
-- sendo só um rótulo.
-- =============================================================

alter table public.research_runs alter column plan_id drop not null;

alter table public.research_runs
  add column if not exists kind text not null default 'web';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'research_runs_kind_ck'
  ) then
    alter table public.research_runs
      add constraint research_runs_kind_ck check (kind in ('web', 'competitors'));
  end if;
end $$;

-- O @ consultado e os números daquela publicação. Ficam em colunas
-- próprias porque a pergunta "o que este concorrente postou de mais
-- engajado" tem de ser uma consulta, não uma leitura de texto.
alter table public.research_sources
  add column if not exists handle text;

alter table public.research_sources
  add column if not exists metrics jsonb not null default '{}';

create index if not exists research_runs_marca_tipo_idx
  on public.research_runs (brand_id, kind, started_at desc);

create index if not exists research_sources_corrida_idx
  on public.research_sources (research_run_id);

-- -------------------------------------------------------------
-- A verificação
-- -------------------------------------------------------------

do $$
declare
  faltando text[];
  t text;
begin
  foreach t in array array['research_runs', 'research_sources'] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'Tabela % sem protecao FORCADA', t;
    end if;

    select coalesce(array_agg(p), '{}') into faltando
    from unnest(array['staff_le', 'staff_cria', 'staff_altera', 'staff_apaga']) p
    where not exists (
      select 1 from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and pol.polname = p
    );

    if array_length(faltando, 1) > 0 then
      raise exception 'Tabela % sem as politicas: %', t, faltando;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_runs'
      and column_name = 'plan_id' and is_nullable = 'NO'
  ) then
    raise exception 'research_runs.plan_id continua obrigatorio';
  end if;

  raise notice 'Varredura: tabelas prontas, protegidas e com as quatro politicas.';
end $$;
