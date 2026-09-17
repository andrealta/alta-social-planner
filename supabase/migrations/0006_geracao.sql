-- =============================================================
-- Alta Social Planner · 0006 · O que a geração precisa guardar
--
-- Migração ADITIVA. O MVP provou que a saída do planejamento tem
-- duas partes que o esquema original não tinha onde pôr:
--
--   1. o BRIEFING do mês — as obrigatoriedades que a equipe digita
--      antes de gerar (lançamento, campanha, data pedida pelo
--      cliente). Vira entrada da geração e precisa ficar gravado,
--      senão ninguém consegue explicar depois por que o mês saiu
--      daquele jeito;
--
--   2. a LEITURA do mês — a tensão identificada, os territórios com
--      seus pesos, a conferência de cota, o que a estratégia decidiu
--      NÃO fazer e os alertas de lacuna da base. É a parte que
--      distingue um planejamento de uma lista de posts, e hoje ela
--      se perderia.
--
-- E um campo por pauta: o TEMA. A regra de rotação de tema é
-- independente da de território, e sem uma coluna própria o mês
-- seguinte não teria como saber o que já foi assunto principal.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Briefing e leitura, no planejamento
-- -------------------------------------------------------------

alter table public.plans
  add column if not exists briefing text;

comment on column public.plans.briefing is
  'Obrigatoriedades do mês, como a equipe digitou antes de gerar.';

alter table public.plans
  add column if not exists analysis jsonb not null default '{}'::jsonb;

comment on column public.plans.analysis is
  'Saída não-pauta da geração: leitura, territorios, conferencia, nao_fazer, alertas.';

-- -------------------------------------------------------------
-- 2. Tema da pauta
-- -------------------------------------------------------------

alter table public.content_ideas
  add column if not exists theme text;

comment on column public.content_ideas.theme is
  'Assunto principal. Alimenta a regra de rotação: tema em dois meses seguidos não pode ser principal no terceiro.';

create index if not exists content_ideas_theme_idx
  on public.content_ideas (brand_id, theme);

-- -------------------------------------------------------------
-- 3. Mudar o tema é mudar conteúdo
--
-- A função que decide o que obriga nova versão foi escrita antes de
-- a coluna existir. Sem esta reescrita, alguém trocaria o assunto
-- principal de uma pauta já aprovada sem deixar rastro — que é
-- justamente o que o versionamento existe para impedir.
-- -------------------------------------------------------------

create or replace function public.idea_content_changed(
  o public.content_ideas, n public.content_ideas
) returns boolean language sql immutable as $$
  select o.title            is distinct from n.title
      or o.concept          is distinct from n.concept
      or o.description      is distinct from n.description
      or o.editorial_line   is distinct from n.editorial_line
      or o.objective        is distinct from n.objective
      or o.audience         is distinct from n.audience
      or o.theme            is distinct from n.theme
      or o.product_id       is distinct from n.product_id
      or o.rationale        is distinct from n.rationale
      or o.cta              is distinct from n.cta
      or o.required_resources is distinct from n.required_resources
$$;

-- -------------------------------------------------------------
-- 4. Permissões explícitas
--
-- 0001 confiou nas permissões implícitas do Supabase e 0005 mostrou
-- que isso não vale para tudo. Repetir o grant é barato; descobrir
-- em produção que uma tabela nega escrita não é.
-- -------------------------------------------------------------

grant select, insert, update, delete on public.plans            to authenticated;
grant select, insert, update, delete on public.plan_requirements to authenticated;
grant select, insert, update, delete on public.content_ideas    to authenticated;
grant select, insert, update, delete on public.content_channels to authenticated;
grant select, insert, update, delete on public.content_versions to authenticated;
grant select, insert, update, delete on public.ai_runs          to authenticated;
