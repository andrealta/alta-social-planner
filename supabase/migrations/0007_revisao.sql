-- =============================================================
-- Alta Social Planner · 0007 · Editar pauta sem perder o rastro
--
-- O gatilho do 0003 exige que toda mudança de conteúdo incremente
-- `current_version`, e a regra do sistema é que a versão anterior
-- vá para `content_versions`. São dois comandos que precisam
-- acontecer juntos ou não acontecer.
--
-- O cliente JavaScript do Supabase não abre transação. Duas chamadas
-- soltas significam duas formas de corromper o histórico: gravar a
-- versão e falhar a alteração, ou alterar e perder a versão. Então a
-- operação inteira vira UMA função no banco.
--
-- SECURITY INVOKER de propósito: a função roda com a identidade de
-- quem chamou, e as políticas de isolamento continuam valendo. Uma
-- função que passasse por cima delas seria uma porta dos fundos.
-- =============================================================

-- -------------------------------------------------------------
-- Quem está chamando
--
-- As políticas do 0002 usam `auth.uid()` direto, o que funciona
-- porque o Supabase concede acesso ao schema `auth`. Mas isso é um
-- detalhe da plataforma, e uma função nossa não deveria depender
-- dele: se um dia esse acesso mudar, o histórico começa a nascer sem
-- autor e ninguém percebe. Aqui a dependência fica em um lugar só.
-- -------------------------------------------------------------

create or replace function public.quem_sou()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select auth.uid() $$;

revoke all on function public.quem_sou() from public;
grant execute on function public.quem_sou() to authenticated;

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
  p_motivo         text default null
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  atual public.content_ideas;
  mudou boolean;
begin
  -- O `for update` segura a linha até o fim. Duas pessoas editando a
  -- mesma pauta no mesmo segundo entram em fila em vez de uma
  -- sobrescrever a versão da outra.
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

  -- A versão que sai é guardada inteira, sob o número que ela tinha.
  insert into public.content_versions
    (brand_id, idea_id, version, snapshot, reason, trigger, author_id)
  values (
    atual.brand_id,
    atual.id,
    atual.current_version,
    to_jsonb(atual),
    nullif(btrim(coalesce(p_motivo, '')), ''),
    'internal',
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
  'Grava a pauta e arquiva a versão anterior, em uma transação só.';

revoke all on function public.salvar_pauta(
  uuid, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.salvar_pauta(
  uuid, text, text, text, text, text, text, text, text, text
) to authenticated;

-- -------------------------------------------------------------
-- Índice para o calendário
--
-- A tela do mês pede os canais de uma marca num intervalo de datas.
-- O índice de 0001 cobre (brand_id, scheduled_date) — este acrescenta
-- a pauta, para o join do calendário não voltar à tabela.
-- -------------------------------------------------------------

create index if not exists content_channels_mes_idx
  on public.content_channels (brand_id, scheduled_date, idea_id);
