-- =============================================================
-- Alta Social Planner · Triggers, guardas e views
-- Rodar depois de 0002_rls.sql.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Espelho de auth.users em profiles
-- -------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'client')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------
-- 2. Máquina de estados da pauta
--
--    Validada aqui, e não só na aplicação: uma pauta não pode ir de
--    ai_generated direto para client_approved nem por erro de código
--    nem por requisição forjada.
-- -------------------------------------------------------------

create or replace function public.idea_transition_allowed(
  old_status public.idea_status,
  new_status public.idea_status
) returns boolean language sql immutable as $$
  select case old_status
    when 'ai_generated'             then new_status in ('internal_review', 'internal_changes')
    when 'internal_review'          then new_status in ('internal_changes', 'internally_approved')
    when 'internal_changes'         then new_status in ('internal_review', 'internally_approved')
    when 'internally_approved'      then new_status in ('sent_to_client', 'internal_changes')
    when 'sent_to_client'           then new_status in ('client_approved', 'client_changes_requested')
    when 'client_changes_requested' then new_status in ('internal_changes', 'internal_review')
    -- Terminal. Reabrir exige remover a aprovação primeiro, de propósito.
    when 'client_approved'          then false
    else false
  end
$$;

-- Campos cuja mudança é "conteúdo" e obriga nova versão.
-- Comentário, responsável, posição no calendário e status NÃO entram.
create or replace function public.idea_content_changed(
  o public.content_ideas, n public.content_ideas
) returns boolean language sql immutable as $$
  select o.title            is distinct from n.title
      or o.concept          is distinct from n.concept
      or o.description      is distinct from n.description
      or o.editorial_line   is distinct from n.editorial_line
      or o.objective        is distinct from n.objective
      or o.audience         is distinct from n.audience
      or o.product_id       is distinct from n.product_id
      or o.rationale        is distinct from n.rationale
      or o.cta              is distinct from n.cta
      or o.required_resources is distinct from n.required_resources
$$;

create or replace function public.content_ideas_guard()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and not public.idea_transition_allowed(old.status, new.status) then
    raise exception
      'Transição de status inválida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if public.idea_content_changed(old, new)
     and new.current_version <= old.current_version then
    raise exception
      'Mudança de conteúdo exige nova versão: incremente current_version e grave em content_versions'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists content_ideas_guard_trg on public.content_ideas;
create trigger content_ideas_guard_trg
  before update on public.content_ideas
  for each row execute function public.content_ideas_guard();

-- -------------------------------------------------------------
-- 3. content_versions é append-only
-- -------------------------------------------------------------

create or replace function public.versions_are_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'content_versions é append-only: versões não podem ser alteradas nem removidas'
    using errcode = 'check_violation';
end $$;

drop trigger if exists content_versions_immutable_trg on public.content_versions;
create trigger content_versions_immutable_trg
  before update or delete on public.content_versions
  for each row execute function public.versions_are_immutable();

drop trigger if exists approvals_immutable_trg on public.approvals;
create trigger approvals_immutable_trg
  before update or delete on public.approvals
  for each row execute function public.versions_are_immutable();

-- -------------------------------------------------------------
-- 4. Planejamento 100% aprovado marca a si mesmo
-- -------------------------------------------------------------

create or replace function public.sync_plan_approval()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pendentes int;
  total int;
begin
  select count(*) filter (where status <> 'client_approved'), count(*)
    into pendentes, total
  from public.content_ideas where plan_id = new.plan_id;

  if total > 0 and pendentes = 0 then
    update public.plans
      set status = 'approved', approved_at = coalesce(approved_at, now())
      where id = new.plan_id and approved_at is null;
  else
    update public.plans
      set approved_at = null
      where id = new.plan_id and approved_at is not null;
  end if;

  return new;
end $$;

drop trigger if exists sync_plan_approval_trg on public.content_ideas;
create trigger sync_plan_approval_trg
  after insert or update of status on public.content_ideas
  for each row execute function public.sync_plan_approval();

-- -------------------------------------------------------------
-- 5. Progresso do planejamento — calculado, nunca armazenado.
--    security_invoker: a view respeita a RLS de quem consulta.
-- -------------------------------------------------------------

create or replace view public.plan_progress
with (security_invoker = true) as
select
  p.id                as plan_id,
  p.brand_id,
  p.year,
  p.month,
  p.status,
  count(ci.id)                                                            as total,
  count(*) filter (where ci.status = 'client_approved')                   as aprovadas,
  count(*) filter (where ci.status = 'sent_to_client')                    as com_cliente,
  count(*) filter (where ci.status = 'client_changes_requested')          as alteracao_cliente,
  count(*) filter (where ci.status in ('ai_generated','internal_review',
                                       'internal_changes','internally_approved')) as internas,
  case when count(ci.id) = 0 then 0
       else round(100.0 * count(*) filter (where ci.status = 'client_approved')
                  / count(ci.id))
  end                                                                     as pct_aprovado
from public.plans p
left join public.content_ideas ci on ci.plan_id = p.id
group by p.id;

-- -------------------------------------------------------------
-- 6. Conferência do escopo contratado — usada pela validação do
--    Agente 4. Conta por plataforma E formato, nunca só o total.
-- -------------------------------------------------------------

create or replace view public.plan_quota_check
with (security_invoker = true) as
select
  p.id as plan_id,
  p.brand_id,
  cc.platform,
  cc.format,
  count(*) as geradas
from public.plans p
join public.content_ideas ci on ci.plan_id = p.id
join public.content_channels cc on cc.idea_id = ci.id
where cc.counts_toward_quota
group by p.id, p.brand_id, cc.platform, cc.format;
