-- =============================================================
-- Alta Social Planner · Row Level Security
-- Rodar DEPOIS do 0001 gerado pelo drizzle-kit.
--
-- Regra que não pode falhar: nenhum cliente vê dado de outra marca.
-- Ela é aplicada aqui, no banco, e não na aplicação — uma rota
-- esquecida é questão de tempo; uma política vale para todo acesso.
-- =============================================================

-- -------------------------------------------------------------
-- Funções de apoio
-- SECURITY DEFINER para poder ler profiles e brand_members sem
-- recair nas políticas dessas mesmas tabelas (recursão infinita).
-- search_path fixo para não ser sequestrada por schema do usuário.
-- -------------------------------------------------------------

create or replace function public.auth_role()
returns public.user_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_brand_ids()
returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(brand_id), '{}')
  from public.brand_members
  where user_id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.auth_role() in ('admin', 'staff')
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.auth_role() = 'admin'
$$;

-- Admin alcança todas as marcas. Staff, só as marcas em que é membro.
create or replace function public.can_access_brand(b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or b = any(public.auth_brand_ids())
$$;

-- Uma pauta é visível ao cliente quando o planejamento foi liberado
-- E a pauta já saiu da área interna.
create or replace function public.idea_is_client_visible(i uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.content_ideas ci
    join public.plans p on p.id = ci.plan_id
    where ci.id = i
      and p.client_released_at is not null
      and ci.status in ('sent_to_client', 'client_changes_requested', 'client_approved')
  )
$$;

revoke execute on function public.auth_role()                from public;
revoke execute on function public.auth_brand_ids()           from public;
revoke execute on function public.is_staff()                 from public;
revoke execute on function public.is_admin()                 from public;
revoke execute on function public.can_access_brand(uuid)     from public;
revoke execute on function public.idea_is_client_visible(uuid) from public;
grant execute on function public.auth_role()                 to authenticated;
grant execute on function public.auth_brand_ids()            to authenticated;
grant execute on function public.is_staff()                  to authenticated;
grant execute on function public.is_admin()                  to authenticated;
grant execute on function public.can_access_brand(uuid)      to authenticated;
grant execute on function public.idea_is_client_visible(uuid) to authenticated;

-- -------------------------------------------------------------
-- 1. RLS ligada em TODA tabela do schema public, sem exceção.
--    O loop existe para que uma tabela nova nunca fique de fora
--    por esquecimento — esse é o risco maior, não a verbosidade.
-- -------------------------------------------------------------

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not like '\_\_drizzle%'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 2. Política padrão da equipe interna, para toda tabela que
--    tem brand_id. Acesso total às marcas que o usuário alcança.
-- -------------------------------------------------------------

do $$
declare t record;
begin
  for t in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attname = 'brand_id'
      and a.attnum > 0
      and not a.attisdropped
  loop
    execute format(
      'create policy staff_all on public.%I for all to authenticated
         using (public.is_staff() and public.can_access_brand(brand_id))
         with check (public.is_staff() and public.can_access_brand(brand_id))',
      t.tablename
    );
  end loop;
end $$;

-- -------------------------------------------------------------
-- 3. Tabelas sem brand_id
-- -------------------------------------------------------------

-- profiles: cada um lê e edita o próprio; staff lê os colegas; admin gerencia.
create policy profiles_self on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_staff_read on public.profiles for select to authenticated
  using (public.is_staff());
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- brands: staff vê as suas; admin gerencia todas; cliente vê a sua.
create policy brands_staff_read on public.brands for select to authenticated
  using (public.is_staff() and public.can_access_brand(id));
create policy brands_admin_all on public.brands for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy brands_client_read on public.brands for select to authenticated
  using (public.auth_role() = 'client' and id = any(public.auth_brand_ids()));

-- brand_members: staff lê as das suas marcas; admin gerencia; cliente vê só a própria linha.
create policy brand_members_staff_read on public.brand_members for select to authenticated
  using (public.is_staff() and public.can_access_brand(brand_id));
create policy brand_members_admin_all on public.brand_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy brand_members_self on public.brand_members for select to authenticated
  using (user_id = auth.uid());

-- notifications: só as próprias, sempre.
create policy notifications_own on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -------------------------------------------------------------
-- 4. O que o cliente enxerga.
--    Tudo o que NÃO tem política de cliente abaixo é invisível
--    para ele: base da marca, produtos, Drive, pesquisa, estratégia,
--    obrigatoriedades, versões, ai_runs e links de acesso.
-- -------------------------------------------------------------

-- Planejamentos liberados da sua marca.
create policy plans_client_read on public.plans for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and client_released_at is not null
  );

-- Pautas liberadas de planejamentos liberados.
create policy content_ideas_client_read on public.content_ideas for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and status in ('sent_to_client', 'client_changes_requested', 'client_approved')
    and exists (
      select 1 from public.plans p
      where p.id = plan_id and p.client_released_at is not null
    )
  );

-- Canais das pautas que ele já pode ver.
create policy content_channels_client_read on public.content_channels for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and public.idea_is_client_visible(idea_id)
  );

-- Apenas referências VISUAIS. Fontes da pesquisa são internas.
create policy content_references_client_read on public.content_references for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and kind = 'visual'
    and public.idea_is_client_visible(idea_id)
  );

-- Comentários compartilhados. A discussão interna nunca sai daqui.
create policy comments_client_read on public.comments for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and visibility = 'shared'
    and public.idea_is_client_visible(idea_id)
  );

-- O cliente escreve comentário — e só consegue escrever compartilhado,
-- assinado como cliente, nele mesmo. Nem por requisição forjada muda.
create policy comments_client_insert on public.comments for insert to authenticated
  with check (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and author_kind = 'client'
    and visibility = 'shared'
    and author_id = auth.uid()
    and public.idea_is_client_visible(idea_id)
  );

-- Decisões: lê as das suas pautas, escreve como cliente.
create policy approvals_client_read on public.approvals for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and public.idea_is_client_visible(idea_id)
  );

create policy approvals_client_insert on public.approvals for insert to authenticated
  with check (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and actor_kind = 'client'
    and actor_id = auth.uid()
    and public.idea_is_client_visible(idea_id)
  );

-- O cliente muda o status da pauta apenas pelas transições que lhe cabem,
-- e apenas a partir de estados em que a pauta está com ele.
create policy content_ideas_client_update on public.content_ideas for update to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and status in ('sent_to_client', 'client_changes_requested')
  )
  with check (
    public.auth_role() = 'client'
    and status in ('client_approved', 'client_changes_requested')
  );

-- -------------------------------------------------------------
-- 5. Verificação. Falha ruidosamente se alguma tabela ficou sem
--    RLS ou sem nenhuma política — inclusive uma criada amanhã.
-- -------------------------------------------------------------

do $$
declare
  sem_rls text[];
  sem_policy text[];
begin
  select coalesce(array_agg(c.relname), '{}') into sem_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not like '\_\_drizzle%'
    and not c.relrowsecurity;

  select coalesce(array_agg(c.relname), '{}') into sem_policy
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not like '\_\_drizzle%'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if array_length(sem_rls, 1) > 0 then
    raise exception 'Tabelas sem RLS: %', sem_rls;
  end if;
  if array_length(sem_policy, 1) > 0 then
    raise exception 'Tabelas sem nenhuma política: %', sem_policy;
  end if;

  raise notice 'RLS: todas as tabelas protegidas e com política.';
end $$;
