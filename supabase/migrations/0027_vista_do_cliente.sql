-- =============================================================
-- 0027: o cliente para de ler as tabelas e passa a ler vistas
-- =============================================================
--
-- O problema, em uma frase: RLS protege LINHAS, não COLUNAS.
--
-- Até aqui o portal do cliente lia `content_ideas` e `idea_content`
-- direto, e a política dizia QUAIS pautas ele podia ver. Só que uma
-- vez dentro da linha, todas as colunas vinham junto. A tela nunca
-- mostrou a justificativa da pauta, o prompt de imagem ou a direção de
-- arte, mas qualquer pessoa com a sessão do cliente aberta e o console
-- do navegador pedia essas colunas e recebia. Material de bastidor da
-- agência, entregue a pedido.
--
-- A correção não é esconder campo por campo, porque o mesmo buraco
-- voltaria no próximo campo interno que eu criasse. A correção é
-- trocar o que o cliente enxerga: ele deixa de ter acesso às tabelas e
-- passa a ter acesso a duas VISTAS que listam, nome por nome, as
-- colunas que são dele. Coluna nova em `content_ideas` nasce invisível
-- para o cliente; para aparecer, alguém precisa escrevê-la aqui de
-- propósito. O padrão passa a ser fechado.
--
-- As vistas rodam com o dono delas, que enxerga tudo, então a regra de
-- QUAIS linhas sai da política e vem para o `where` daqui. É a mesma
-- regra, palavra por palavra, que estava em `content_ideas_client_read`
-- e em `idea_content_client_read`.
--
-- Uma consequência a entender: `decidir_pauta` lia a pauta com a
-- permissão do próprio cliente. Sem a política de leitura, ela pararia
-- de achar a pauta. Por isso ela passa a rodar como dona (security
-- definer) e carrega, escritas dentro dela, as quatro conferências que
-- antes ficavam na política: quem está chamando é cliente, a marca é
-- dele, o mês foi liberado, e a pauta está mesmo aguardando resposta.

-- -------------------------------------------------------------
-- 1. As pautas, como o cliente as vê
-- -------------------------------------------------------------
--
-- Ficam DE FORA, e é o ponto da migração: rationale (a justificativa
-- interna que explica por que a pauta existe), meta_justificativa (por
-- que aquele objetivo de campanha e aquele valor), objective, theme,
-- audience, current_version, owner_id e o resto do maquinário.

drop view if exists public.pautas_do_cliente;
create view public.pautas_do_cliente
with (security_barrier = true)
as
  select
    ci.id,
    ci.brand_id,
    ci.plan_id,
    ci.title,
    ci.concept,
    ci.description,
    ci.editorial_line,
    ci.cta,
    ci.status,
    ci.position,
    ci.scope_id,
    ci.enviada_ao_cliente_em,
    ci.meta_objetivo,
    ci.meta_investimento
  from public.content_ideas ci
  where public.auth_role() = 'client'
    and ci.brand_id = any(public.auth_brand_ids())
    and ci.status in ('sent_to_client', 'client_changes_requested', 'client_approved')
    and exists (
      select 1 from public.plans p
      where p.id = ci.plan_id and p.client_released_at is not null
    );

comment on view public.pautas_do_cliente is
  'As pautas liberadas, só com as colunas que o cliente pode ver (0027).';

grant select on public.pautas_do_cliente to authenticated;

-- -------------------------------------------------------------
-- 2. O conteúdo escrito, como o cliente o vê
-- -------------------------------------------------------------
--
-- Ficam de fora art_direction e image_prompt (instruções de produção
-- que são da equipe e da IA), alt_text, caption_variants, layout,
-- generated_for_version e o resto.

drop view if exists public.conteudo_do_cliente;
create view public.conteudo_do_cliente
with (security_barrier = true)
as
  select
    k.idea_id,
    k.brand_id,
    k.caption,
    k.hashtags,
    k.art_concept,
    k.scenes
  from public.idea_content k
  where public.auth_role() = 'client'
    and k.brand_id = any(public.auth_brand_ids())
    and public.idea_is_client_visible(k.idea_id);

comment on view public.conteudo_do_cliente is
  'A legenda e as cenas das publicações liberadas, sem o material de produção (0027).';

grant select on public.conteudo_do_cliente to authenticated;

-- -------------------------------------------------------------
-- 3. Fechar a porta antiga
-- -------------------------------------------------------------
--
-- Sem estas duas políticas, o cliente não lê mais nenhuma linha das
-- duas tabelas. A equipe continua lendo pelas políticas de staff.

drop policy if exists content_ideas_client_read on public.content_ideas;
drop policy if exists idea_content_client_read on public.idea_content;

-- A escrita do cliente em `content_ideas` também sai: desde a 0010 a
-- única mudança que ele faz é o status, e ela acontece dentro de
-- `decidir_pauta`, que a partir de agora roda como dona. Política de
-- update aberta para o cliente, sem ninguém usando, é só superfície.
drop policy if exists content_ideas_client_update on public.content_ideas;

-- -------------------------------------------------------------
-- 4. decidir_pauta agora se defende sozinha
-- -------------------------------------------------------------
--
-- Mesma função da 0010, mesma transação única, mesmas mensagens. O que
-- muda: roda como dona, e por isso as conferências que a política
-- fazia por fora estão escritas aqui dentro, na ordem em que uma
-- pessoa pensaria nelas.
--
-- As mensagens de recusa continuam contendo "não está com você" porque
-- é por esse trecho que a tela do cliente reconhece o caso e escreve a
-- frase amigável.

create or replace function public.decidir_pauta(
  p_idea_id    uuid,
  p_decisao    text,
  p_comentario text default null
) returns uuid
language plpgsql
security definer
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

  -- Quem decide é o cliente. A equipe tem os botões dela.
  if public.auth_role() <> 'client' then
    raise exception 'Só o cliente decide por esta porta.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into pauta from public.content_ideas where id = p_idea_id for update;
  if not found then
    raise exception 'Pauta não encontrada, ou ela não está com você.'
      using errcode = 'insufficient_privilege';
  end if;

  -- A marca precisa ser uma das dele. Antes isto era a política.
  if not (pauta.brand_id = any(public.auth_brand_ids())) then
    raise exception 'Pauta não encontrada, ou ela não está com você.'
      using errcode = 'insufficient_privilege';
  end if;

  select p.client_released_at into liberado
  from public.plans p where p.id = pauta.plan_id;

  -- Mês que ainda não foi enviado não existe para o cliente.
  if liberado is null then
    raise exception 'Pauta não encontrada, ou ela não está com você.'
      using errcode = 'insufficient_privilege';
  end if;

  -- E a pauta precisa estar mesmo aguardando resposta. Decidir duas
  -- vezes a mesma coisa, ou decidir o que a equipe ainda está
  -- escrevendo, não é decisão.
  if pauta.status not in ('sent_to_client', 'client_changes_requested') then
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
  'Registra a decisão do cliente sobre uma pauta, com o comentário, em uma transação só. Confere sozinha quem chama, a marca, o mês liberado e o estado da pauta (0027).';

revoke all on function public.decidir_pauta(uuid, text, text) from public;
grant execute on function public.decidir_pauta(uuid, text, text) to authenticated;

-- -------------------------------------------------------------
-- 5. A política das imagens dependia de ler `idea_content`
-- -------------------------------------------------------------
--
-- `assets_client_read` perguntava "existe um idea_content com este
-- asset que o cliente já pode ver?" — e essa pergunta era feita com a
-- permissão do próprio cliente. Fechada a tabela, a pergunta passou a
-- responder sempre não, e a imagem da peça sumiria da tela dele.
--
-- A pergunta continua a mesma; quem responde é que muda. Vai para uma
-- função que enxerga tudo, do mesmo jeito que `idea_is_client_visible`
-- já fazia com as pautas. A política segue decidindo quem vê o quê.

create or replace function public.asset_is_client_visible(a uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.idea_content ic
    where ic.asset_id = a
      and public.idea_is_client_visible(ic.idea_id)
  )
$$;

comment on function public.asset_is_client_visible is
  'A imagem pertence a uma publicação que o cliente já pode ver? (0027)';

revoke execute on function public.asset_is_client_visible(uuid) from public;
grant execute on function public.asset_is_client_visible(uuid) to authenticated;

drop policy if exists assets_client_read on public.assets;
create policy assets_client_read on public.assets for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and public.asset_is_client_visible(id)
  );
