-- =============================================================
-- Alta Social Planner · 0013 · Os níveis de acesso passam a valer
--
-- O QUE ESTAVA ERRADO
--
-- A tela de pessoas pedia um nível ao vincular alguém a uma marca —
-- responsável, edita, só lê — e gravava a escolha em
-- `brand_members.access`. Nenhuma regra lia esse campo. As políticas
-- do 0002 perguntavam apenas "esta pessoa alcança esta marca?", nunca
-- "em que nível?". Resultado: quem estava como "só lê" apagava uma
-- pauta igual ao responsável.
--
-- Isso é pior do que não ter níveis nenhum. Um controle que parece
-- existir e não existe faz alguém confiar nele.
--
-- O QUE PASSA A VALER
--
--   viewer   (só lê)      — enxerga tudo da marca, não escreve nada.
--   editor   (edita)      — cria, altera, refina, aprova internamente.
--   owner    (responsável)— tudo do editor, e é o único que envia o
--                           planejamento ao cliente.
--   admin                 — alcança todas as marcas, como owner.
--
-- Por que o envio ao cliente é do responsável: é a fronteira entre o
-- trabalho interno e o que o cliente vê. Depois que sai, saiu.
--
-- ONDE A TRAVA MORA
--
-- Nas políticas e em dois gatilhos — não na tela. A tela vai esconder
-- os botões, mas esconder botão não é segurança: qualquer pessoa com
-- a sessão aberta consegue montar a requisição na mão. Quem recusa é
-- o banco.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Quem é o quê, nesta marca
--
-- SECURITY DEFINER pelo mesmo motivo das funções do 0002: ler
-- brand_members de dentro de uma política de brand_members entraria
-- em recursão. search_path fixo para não ser sequestrada.
-- -------------------------------------------------------------

create or replace function public.nivel_na_marca(b uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.is_admin() then 'owner'
    else (
      select m.access::text
      from public.brand_members m
      where m.user_id = auth.uid() and m.brand_id = b
      limit 1
    )
  end
$$;

create or replace function public.pode_editar_marca(b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_staff() and public.nivel_na_marca(b) in ('owner', 'editor')
$$;

create or replace function public.pode_enviar_ao_cliente(b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_staff() and public.nivel_na_marca(b) = 'owner'
$$;

revoke execute on function public.nivel_na_marca(uuid)        from public;
revoke execute on function public.pode_editar_marca(uuid)     from public;
revoke execute on function public.pode_enviar_ao_cliente(uuid) from public;
grant execute on function public.nivel_na_marca(uuid)         to authenticated;
grant execute on function public.pode_editar_marca(uuid)      to authenticated;
grant execute on function public.pode_enviar_ao_cliente(uuid) to authenticated;

-- -------------------------------------------------------------
-- 2. A política única vira quatro
--
-- `staff_all` era um `for all`: ler e escrever na mesma regra. Para
-- separar quem lê de quem escreve, é preciso separar a política —
-- leitura para todos os membros, escrita só para quem edita.
--
-- O laço percorre as tabelas com brand_id, como o 0002 fez, para que
-- uma tabela nova amanhã não fique de fora por esquecimento.
--
-- brand_members fica de fora de propósito: desde a 0011 só a
-- administração escreve nela. Quem é alcançado por uma regra não
-- reescreve a regra.
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
      and c.relname <> 'brand_members'
  loop
    execute format('drop policy if exists staff_all on public.%I', t.tablename);
    execute format('drop policy if exists staff_le on public.%I', t.tablename);
    execute format('drop policy if exists staff_cria on public.%I', t.tablename);
    execute format('drop policy if exists staff_altera on public.%I', t.tablename);
    execute format('drop policy if exists staff_apaga on public.%I', t.tablename);

    -- Ler: qualquer nível, inclusive só lê.
    execute format(
      'create policy staff_le on public.%I for select to authenticated
         using (public.is_staff() and public.can_access_brand(brand_id))',
      t.tablename
    );

    -- Escrever: só quem edita.
    execute format(
      'create policy staff_cria on public.%I for insert to authenticated
         with check (public.pode_editar_marca(brand_id))',
      t.tablename
    );
    execute format(
      'create policy staff_altera on public.%I for update to authenticated
         using (public.pode_editar_marca(brand_id))
         with check (public.pode_editar_marca(brand_id))',
      t.tablename
    );
    execute format(
      'create policy staff_apaga on public.%I for delete to authenticated
         using (public.pode_editar_marca(brand_id))',
      t.tablename
    );
  end loop;
end $$;

-- -------------------------------------------------------------
-- 3. O envio ao cliente é do responsável
--
-- Duas travas, porque há dois caminhos até a mesma porta.
--
-- A função `liberar_plano` é o caminho da tela, e ganha uma recusa
-- com frase legível. O gatilho é o caminho de quem monta a requisição
-- na mão: mesmo trocando a coluna direto, não passa.
--
-- A coluna que importa é `client_released_at`. É ela, e só ela, que
-- as políticas do cliente consultam para decidir se aquele mês existe
-- para ele. Mudar o status sem ela não mostra nada a ninguém.
-- -------------------------------------------------------------

create or replace function public.plans_guard()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  -- Sem sessão de usuário não há nível a conferir: isto é uma conexão
  -- direta ao banco, feita pelos scripts de administração que rodam na
  -- máquina do André com a DATABASE_URL. Quem tem a senha do banco já
  -- passa por cima de tudo; travar aqui só quebraria a manutenção.
  if auth.uid() is null then return new; end if;

  if new.client_released_at is distinct from old.client_released_at
     and not public.pode_enviar_ao_cliente(new.brand_id) then
    raise exception 'Só quem é responsável por esta marca pode enviar o planejamento ao cliente.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists plans_guard_trg on public.plans;
create trigger plans_guard_trg
  before update on public.plans
  for each row execute function public.plans_guard();

create or replace function public.ideas_envio_guard()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  -- Sem sessão de usuário não há nível a conferir: isto é uma conexão
  -- direta ao banco, feita pelos scripts de administração que rodam na
  -- máquina do André com a DATABASE_URL. Quem tem a senha do banco já
  -- passa por cima de tudo; travar aqui só quebraria a manutenção.
  if auth.uid() is null then return new; end if;

  if new.status = 'sent_to_client'
     and old.status is distinct from new.status
     and not public.pode_enviar_ao_cliente(new.brand_id) then
    raise exception 'Só quem é responsável por esta marca pode mandar pauta ao cliente.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists ideas_envio_guard_trg on public.content_ideas;
create trigger ideas_envio_guard_trg
  before update on public.content_ideas
  for each row execute function public.ideas_envio_guard();

-- A recusa com frase legível, antes de a função escrever qualquer coisa.
create or replace function public.liberar_plano(p_plan_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  marca     uuid;
  pendentes int;
  enviadas  int;
begin
  select brand_id into marca from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Planejamento não encontrado, ou você não tem acesso a ele.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.pode_enviar_ao_cliente(marca) then
    raise exception 'Só quem é responsável por esta marca pode enviar o planejamento ao cliente. Peça a quem responde pela conta.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Mandar ao cliente o que a equipe ainda não aprovou é o erro que
  -- este sistema existe para não deixar acontecer.
  select count(*) into pendentes
  from public.content_ideas
  where plan_id = p_plan_id
    and status not in ('internally_approved', 'sent_to_client', 'client_approved');

  if pendentes > 0 then
    raise exception
      '% pauta(s) ainda não foram aprovadas internamente. Aprove ou remova antes de enviar.', pendentes
      using errcode = 'check_violation';
  end if;

  update public.plans
     set client_released_at = coalesce(client_released_at, now()),
         status = 'sent_to_client'
   where id = p_plan_id;

  with movidas as (
    update public.content_ideas
       set status = 'sent_to_client'
     where plan_id = p_plan_id
       and status = 'internally_approved'
    returning 1
  )
  select count(*) into enviadas from movidas;

  return enviadas;
end $$;

revoke all on function public.liberar_plano(uuid) from public;
grant execute on function public.liberar_plano(uuid) to authenticated;

-- -------------------------------------------------------------
-- 4. Verificação
--
-- A lição do 0012: a conferência precisa perguntar a coisa certa.
-- Aqui ela pergunta se sobrou alguma tabela com a política antiga, e
-- se toda tabela com brand_id ganhou as quatro novas.
-- -------------------------------------------------------------

do $$
declare
  sobrou    text[];
  faltando  text[];
begin
  select coalesce(array_agg(distinct c.relname), '{}') into sobrou
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and p.polname = 'staff_all';

  select coalesce(array_agg(c.relname), '{}') into faltando
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'public'
    and c.relkind = 'r'
    and a.attname = 'brand_id'
    and a.attnum > 0
    and not a.attisdropped
    and c.relname <> 'brand_members'
    and (
      select count(*) from pg_policy p
      where p.polrelid = c.oid
        and p.polname in ('staff_le', 'staff_cria', 'staff_altera', 'staff_apaga')
    ) <> 4;

  if array_length(sobrou, 1) > 0 then
    raise exception 'Ainda existe a política antiga staff_all em: %', sobrou;
  end if;
  if array_length(faltando, 1) > 0 then
    raise exception 'Tabelas sem as quatro políticas novas: %', faltando;
  end if;

  raise notice 'Niveis: leitura separada da escrita em todas as tabelas de marca.';
end $$;
