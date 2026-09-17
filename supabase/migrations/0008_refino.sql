-- =============================================================
-- Alta Social Planner · 0008 · Quem foi que mudou: a equipe ou a IA
--
-- `content_versions.trigger` existe desde o 0001 com três valores:
-- 'ai', 'internal' e 'client_request'. A função de salvar do 0007
-- gravava sempre 'internal', porque só havia edição manual.
--
-- Agora a IA também reescreve pauta, a pedido da equipe. Se as duas
-- coisas entrarem no histórico com o mesmo carimbo, perde-se a
-- pergunta mais útil que esse histórico responde: o texto que está no
-- ar foi escrito por gente ou por máquina, e a pedido de quem.
--
-- O parâmetro entra com valor padrão, então a chamada antiga continua
-- valendo sem mudar nada do lado do site.
-- =============================================================

drop function if exists public.salvar_pauta(
  uuid, text, text, text, text, text, text, text, text, text
);

create or replace function public.salvar_pauta(
  p_id             uuid,
  p_title          text,
  p_theme          text,
  p_concept        text,
  p_description    text,
  p_editorial_line text,
  p_objective      text,
  p_rationale      text,
  p_cta            text,
  p_motivo         text default null,
  p_origem         text default 'internal'
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  atual  public.content_ideas;
  mudou  boolean;
  origem public.version_trigger;
begin
  -- O valor vem do site, então é conferido aqui em vez de ser
  -- convertido na confiança. Rótulo de origem errado é pior que
  -- nenhum: mente com cara de registro.
  if p_origem not in ('ai', 'internal', 'client_request') then
    raise exception 'Origem de versão inválida: %', p_origem
      using errcode = 'check_violation';
  end if;
  origem := p_origem::public.version_trigger;

  select * into atual from public.content_ideas where id = p_id for update;

  if not found then
    raise exception 'Pauta não encontrada, ou você não tem acesso a ela.'
      using errcode = 'insufficient_privilege';
  end if;

  mudou :=
       atual.title          is distinct from p_title
    or atual.theme          is distinct from p_theme
    or atual.concept        is distinct from p_concept
    or atual.description    is distinct from p_description
    or atual.editorial_line is distinct from p_editorial_line
    or atual.objective      is distinct from p_objective
    or atual.rationale      is distinct from p_rationale
    or atual.cta            is distinct from p_cta;

  if not mudou then
    return atual.current_version;
  end if;

  insert into public.content_versions
    (brand_id, idea_id, version, snapshot, reason, trigger, author_id)
  values (
    atual.brand_id,
    atual.id,
    atual.current_version,
    to_jsonb(atual),
    nullif(btrim(coalesce(p_motivo, '')), ''),
    origem,
    public.quem_sou()
  )
  on conflict (idea_id, version) do nothing;

  update public.content_ideas set
    title           = p_title,
    theme           = p_theme,
    concept         = p_concept,
    description     = p_description,
    editorial_line  = p_editorial_line,
    objective       = p_objective,
    rationale       = p_rationale,
    cta             = p_cta,
    current_version = atual.current_version + 1
  where id = p_id;

  return atual.current_version + 1;
end $$;

comment on function public.salvar_pauta is
  'Grava a pauta e arquiva a versão anterior, em uma transação só. p_origem diz se a mudança veio da equipe, da IA ou de um pedido do cliente.';

revoke all on function public.salvar_pauta(
  uuid, text, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.salvar_pauta(
  uuid, text, text, text, text, text, text, text, text, text, text
) to authenticated;
