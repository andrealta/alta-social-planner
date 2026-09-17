-- =============================================================
-- Alta Social Planner · 0010 · O ciclo com o cliente
--
-- Duas operações, cada uma com várias escritas que precisam acontecer
-- juntas ou não acontecer:
--
--   liberar_plano  — marca o mês como liberado E move as pautas para
--                    "com o cliente". Se a segunda metade falhasse, o
--                    mês apareceria vazio para o cliente.
--
--   decidir_pauta  — grava o comentário, registra a decisão e muda o
--                    estado da pauta. Meio caminho aqui significa uma
--                    aprovação sem registro, ou um registro de algo
--                    que não aconteceu.
--
-- As duas são SECURITY INVOKER: rodam com a identidade de quem
-- chamou, e as políticas do 0002 continuam decidindo quem pode o quê.
-- A função não é um atalho para contornar a segurança; é só um jeito
-- de não deixar escrita pela metade.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Liberar o mês para o cliente
-- -------------------------------------------------------------

create or replace function public.liberar_plano(p_plan_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  pendentes int;
  enviadas  int;
  existe    boolean;
begin
  select true into existe from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Planejamento não encontrado, ou você não tem acesso a ele.'
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

comment on function public.liberar_plano is
  'Libera o mês para o cliente e move as pautas aprovadas para "com o cliente".';

revoke all on function public.liberar_plano(uuid) from public;
grant execute on function public.liberar_plano(uuid) to authenticated;

-- -------------------------------------------------------------
-- 2. A decisão do cliente
--
-- Repare no que a função NÃO faz: não recebe quem está decidindo, não
-- recebe a marca, não recebe a versão. Tudo isso é lido do banco e da
-- sessão. Um cliente que forjasse a chamada só conseguiria mentir
-- sobre o texto do próprio comentário.
-- -------------------------------------------------------------

create or replace function public.decidir_pauta(
  p_idea_id    uuid,
  p_decisao    text,
  p_comentario text default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  pauta      public.content_ideas;
  liberado   timestamptz;
  id_coment  uuid;
  novo       public.idea_status;
  decisao    public.approval_decision;
begin
  if p_decisao not in ('approved', 'changes_requested') then
    raise exception 'Decisão inválida: %', p_decisao using errcode = 'check_violation';
  end if;
  decisao := p_decisao::public.approval_decision;
  novo := case when p_decisao = 'approved'
               then 'client_approved'::public.idea_status
               else 'client_changes_requested'::public.idea_status end;

  select * into pauta from public.content_ideas where id = p_idea_id for update;
  if not found then
    raise exception 'Pauta não encontrada, ou ela não está com você.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Pedir alteração sem dizer o que mudar devolve a pauta à equipe sem
  -- informação nenhuma. O sistema não deixa.
  if p_decisao = 'changes_requested'
     and coalesce(btrim(p_comentario), '') = '' then
    raise exception 'Para pedir alteração é preciso dizer o que mudar.'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_comentario), '') <> '' then
    insert into public.comments (brand_id, idea_id, author_id, author_kind, body, visibility)
    values (pauta.brand_id, pauta.id, public.quem_sou(), 'client', btrim(p_comentario), 'shared')
    returning id into id_coment;
  end if;

  select p.client_released_at into liberado
  from public.plans p where p.id = pauta.plan_id;

  insert into public.approvals
    (brand_id, idea_id, version, actor_id, actor_kind, decision, comment_id, seconds_to_decide)
  values (
    pauta.brand_id,
    pauta.id,
    pauta.current_version,
    public.quem_sou(),
    'client',
    decisao,
    id_coment,
    case when liberado is null then null
         else greatest(0, extract(epoch from (now() - liberado))::int) end
  );

  update public.content_ideas set status = novo where id = p_idea_id;

  return id_coment;
end $$;

comment on function public.decidir_pauta is
  'Registra a decisão do cliente sobre uma pauta, com o comentário, em uma transação só.';

revoke all on function public.decidir_pauta(uuid, text, text) from public;
grant execute on function public.decidir_pauta(uuid, text, text) to authenticated;

-- -------------------------------------------------------------
-- 3. Permissões explícitas nas tabelas do ciclo
--
-- Mesma lição do 0005: confiar nas permissões implícitas do Supabase
-- funcionou até não funcionar. Repetir o grant é barato.
-- -------------------------------------------------------------

grant select, insert on public.comments  to authenticated;
grant select, insert on public.approvals to authenticated;
grant select, update on public.content_ideas to authenticated;
grant select on public.idea_content to authenticated;
grant select on public.brands to authenticated;
grant select on public.plans  to authenticated;
