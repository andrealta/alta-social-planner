-- =============================================================
-- 0025: o cliente recebe a publicação pronta, não só a ideia
-- =============================================================
--
-- Decisão da Alta: a partir de agora o cliente avalia a peça com a
-- legenda final escrita, e não mais a ideia solta. Vale para todas as
-- marcas e para todos os conteúdos.
--
-- Então "enviar ao cliente" passa a exigir conteúdo escrito. Duas
-- travas, pelo mesmo motivo de sempre: a tela evita o clique, e o
-- banco recusa a escrita.
--
--   1. no gatilho de status: nenhuma pauta vai para 'sent_to_client'
--      sem legenda gravada, venha o pedido de onde vier;
--   2. na função `liberar_plano`: a mensagem diz quantas faltam, antes
--      de qualquer coisa ser alterada.
--
-- O que NÃO muda: a pauta continua sendo aprovada internamente antes,
-- e o layout continua opcional. Quem só tem ideia aprovada e nenhuma
-- legenda simplesmente ainda não terminou o trabalho.

-- -------------------------------------------------------------
-- 1. O gatilho da pauta
-- -------------------------------------------------------------

create or replace function public.tem_legenda(i uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.idea_content ic
    where ic.idea_id = i and coalesce(btrim(ic.caption), '') <> ''
  )
$$;

comment on function public.tem_legenda is
  'A pauta já tem legenda escrita? É o que o cliente precisa receber junto com a ideia (0025).';

create or replace function public.content_ideas_guard()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and not public.idea_transition_allowed(old.status, new.status) then
    raise exception
      'Transição de status inválida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- O cliente avalia a peça pronta: sem legenda, nada sai daqui.
  if new.status = 'sent_to_client'
     and old.status is distinct from new.status
     and not public.tem_legenda(new.id) then
    raise exception
      'Esta publicação ainda não tem conteúdo escrito. O cliente recebe a peça com a legenda final.'
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

-- -------------------------------------------------------------
-- 2. A função que a tela chama
-- -------------------------------------------------------------

create or replace function public.liberar_plano(p_plan_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  marca      uuid;
  pendentes  int;
  sem_texto  int;
  enviadas   int;
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

  -- E mandar pauta sem legenda deixou de ser possível (0025).
  select count(*) into sem_texto
  from public.content_ideas ci
  where ci.plan_id = p_plan_id
    and ci.status = 'internally_approved'
    and not public.tem_legenda(ci.id);

  if sem_texto > 0 then
    raise exception
      '% publicação(ões) ainda estão sem conteúdo escrito. O cliente recebe a peça com a legenda final: escreva o conteúdo antes de enviar.', sem_texto
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
  'Libera o mês para o cliente e move as pautas aprovadas E com conteúdo escrito para "com o cliente".';

revoke all on function public.liberar_plano(uuid) from public;
grant execute on function public.liberar_plano(uuid) to authenticated;
