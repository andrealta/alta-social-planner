-- =============================================================
-- Alta Social Planner · 0009 · Aprovar sem escala
--
-- O gatilho do 0003 obrigava toda pauta a passar por 'internal_review'
-- antes de ser aprovada. Isso não veio do processo da Alta — veio de
-- mim, ao desenhar a máquina de estados. Na prática a equipe abre a
-- pauta, lê, e aprova; o clique intermediário só existia para
-- satisfazer o diagrama.
--
-- Estado que ninguém usa não é rigor, é atrito. 'internal_review' e
-- 'internal_changes' continuam existindo para quem quiser marcar uma
-- pauta como pendente — mas deixam de ser obrigatórios no caminho.
--
-- O que NÃO muda: 'client_approved' segue terminal, e nada pula para
-- 'sent_to_client' sem passar pela aprovação interna. As travas que
-- protegem o cliente continuam de pé.
-- =============================================================

create or replace function public.idea_transition_allowed(
  old_status public.idea_status,
  new_status public.idea_status
) returns boolean language sql immutable as $$
  select case old_status
    -- aprovar direto é o caminho normal; os outros dois seguem valendo
    when 'ai_generated'             then new_status in ('internal_review', 'internal_changes', 'internally_approved')
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
