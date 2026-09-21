-- =============================================================
-- Alta Social Planner · 0021 · Estratégia do mês e feedback do cliente
--
-- 1. A ESTRATÉGIA QUE O CLIENTE LÊ
--
-- O planejamento já guarda, em `plans.analysis`, a leitura do mês que
-- a IA escreveu. Ela NÃO vai direto para o cliente: desde a varredura
-- de concorrentes, a leitura cita o que o setor está repetindo e qual
-- brecha foi escolhida — raciocínio interno da agência. E o mesmo
-- campo guarda a avaliação do crítico.
--
-- Então a estratégia do cliente é um texto próprio, que a equipe
-- escreve (partindo da leitura, se quiser) e publica. Vazio: o cliente
-- não vê bloco nenhum.
--
-- 2. O FEEDBACK DO MÊS
--
-- O cliente escreve sobre o mês como um todo: o que funcionou, e o
-- que merece atenção nos próximos. Uma ficha por pessoa por mês, que
-- ela pode reabrir e corrigir. A equipe lê; ninguém da equipe escreve
-- em nome do cliente.
-- =============================================================

alter table public.plans add column if not exists estrategia_cliente text;
alter table public.plans add column if not exists estrategia_atualizada_em timestamptz;

comment on column public.plans.estrategia_cliente is
  'A estratégia do mês como o cliente lê. Escrita pela equipe. Nula: o portal não mostra o bloco.';

create table if not exists public.feedback_mes (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  plan_id     uuid not null references public.plans(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  destaques   text,
  atencao     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint feedback_mes_um_por_pessoa unique (plan_id, author_id),
  constraint feedback_mes_nao_vazio check (
    coalesce(btrim(destaques), '') <> '' or coalesce(btrim(atencao), '') <> ''
  )
);

create index if not exists feedback_mes_marca_idx on public.feedback_mes (brand_id, created_at desc);

-- A marca da ficha tem de ser a do mês. Sem isso, um pedido forjado
-- poderia gravar feedback de um mês "na" marca errada.
create or replace function public.feedback_mes_coerente()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.plans where id = new.plan_id and brand_id = new.brand_id) then
    raise exception 'O mês não pertence a esta marca.' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists feedback_mes_coerente_trg on public.feedback_mes;
create trigger feedback_mes_coerente_trg
  before insert or update on public.feedback_mes
  for each row execute function public.feedback_mes_coerente();

-- Proteção: ligada E forçada, como toda tabela deste sistema (0012).
alter table public.feedback_mes enable row level security;
alter table public.feedback_mes force row level security;

-- Quem escreve: o cliente da marca, sobre um mês que já recebeu, e só
-- em nome dele mesmo.
create or replace function public.pode_dar_feedback(p_brand uuid, p_plan uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.auth_role() = 'client'
     and p_brand = any(public.auth_brand_ids())
     and exists (
       select 1 from public.plans
       where id = p_plan and brand_id = p_brand and client_released_at is not null
     )
$$;
revoke execute on function public.pode_dar_feedback(uuid, uuid) from public;
grant execute on function public.pode_dar_feedback(uuid, uuid) to authenticated;

drop policy if exists feedback_cliente_le on public.feedback_mes;
create policy feedback_cliente_le on public.feedback_mes
  for select to authenticated
  using (public.auth_role() = 'client' and brand_id = any(public.auth_brand_ids()));

drop policy if exists feedback_cliente_escreve on public.feedback_mes;
create policy feedback_cliente_escreve on public.feedback_mes
  for insert to authenticated
  with check (author_id = auth.uid() and public.pode_dar_feedback(brand_id, plan_id));

drop policy if exists feedback_cliente_altera on public.feedback_mes;
create policy feedback_cliente_altera on public.feedback_mes
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and public.pode_dar_feedback(brand_id, plan_id));

drop policy if exists feedback_equipe_le on public.feedback_mes;
create policy feedback_equipe_le on public.feedback_mes
  for select to authenticated
  using (public.is_staff() and public.can_access_brand(brand_id));

grant select, insert, update on public.feedback_mes to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'feedback_mes'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'feedback_mes sem protecao FORCADA';
  end if;
  raise notice 'Estrategia do mes e feedback do cliente: prontos.';
end $$;
