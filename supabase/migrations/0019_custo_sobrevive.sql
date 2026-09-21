-- =============================================================
-- Alta Social Planner · 0019 · O custo sobrevive à exclusão do mês
--
-- Pedido do André: "os custos devem contemplar inclusive os
-- planejamentos já excluídos, porque mesmo excluídos eles consumiram
-- recursos para serem gerados."
--
-- Ao abrir o esquema para fazer isso, o problema era maior que a
-- tela: `ai_runs.plan_id` foi criado na 0001 com `on delete cascade`.
-- Excluir um planejamento não escondia o custo dele — APAGAVA o
-- registro. A página de Precisão não tinha como mostrar o que já não
-- existia.
--
-- Daqui em diante, excluir um mês:
--   1. marca as chamadas de IA daquele mês como "de mês excluído",
--      guardando qual mês era (para a tela poder dizer "Novembro de
--      2026, excluído");
--   2. solta o vínculo (`plan_id` vira nulo) em vez de apagar.
--
-- O que já foi apagado antes desta migração não volta por aqui. Volta
-- pelo backup: `19-restaurar-custos.cmd` relê as pastas de backup e
-- devolve as chamadas que sumiram.
-- =============================================================

alter table public.ai_runs add column if not exists plano_excluido_em timestamptz;
alter table public.ai_runs add column if not exists plano_mes integer;
alter table public.ai_runs add column if not exists plano_ano integer;

comment on column public.ai_runs.plano_excluido_em is
  'Quando o planejamento desta chamada foi excluído. Nulo: o mês ainda existe (ou a chamada nunca teve mês).';

-- A chave estrangeira: de "apaga junto" para "solta".
alter table public.ai_runs drop constraint if exists ai_runs_plan_id_fkey;
alter table public.ai_runs
  add constraint ai_runs_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete set null;

-- Antes de o mês sair, carimba as chamadas dele.
--
-- SECURITY DEFINER porque quem exclui um mês antes do envio pode ser
-- alguém que edita a marca mas não tem por que ter permissão de
-- escrever no registro de custos. O carimbo não é decisão de ninguém:
-- é consequência da exclusão, que já passou pelas travas da 0018.
--
-- O nome do gatilho começa com "plans_c", depois de "plans_apagar":
-- o Postgres dispara gatilhos do mesmo momento em ordem alfabética, e
-- o carimbo só pode acontecer se a trava de permissão tiver deixado.
create or replace function public.plans_carimbar_custo()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  update public.ai_runs
     set plano_excluido_em = now(),
         plano_mes = old.month,
         plano_ano = old.year
   where plan_id = old.id;
  return old;
end $$;

drop trigger if exists plans_carimbar_custo_trg on public.plans;
create trigger plans_carimbar_custo_trg
  before delete on public.plans
  for each row execute function public.plans_carimbar_custo();

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'ai_runs_plan_id_fkey' and confdeltype <> 'n'
  ) then
    raise exception 'ai_runs.plan_id continua apagando em cascata';
  end if;
  raise notice 'Custo: excluir um mes agora preserva o registro das chamadas de IA.';
end $$;
