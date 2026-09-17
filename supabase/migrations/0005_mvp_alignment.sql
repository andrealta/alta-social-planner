-- =============================================================
-- Alta Social Planner · 0005 · Alinhamento com o MVP validado
--
-- Migração ADITIVA sobre 0001–0004. Nada é reescrito: migração é
-- append-only, e os arquivos anteriores já foram aplicados.
--
-- O piloto com Queensberry, Habiarte e Canto de Minas provou quatro
-- coisas que o esquema original não previa:
--   1. a base de marca tem NOVE seções, não sete;
--   2. a cota contratada é por LINHA DE PRODUTO, não por formato;
--   3. a pauta gera conteúdo (legenda, arte, decupagem) como entidade;
--   4. a peça final precisa de um bitmap guardado.
-- =============================================================

-- -------------------------------------------------------------
-- 1. As nove seções da base
--
-- O enum nasceu com sete valores. Produtos, plataformas, recursos e
-- memória existiam só como tabelas normalizadas — e continuam
-- existindo, porque é nelas que o sistema CALCULA (cota, restrição
-- de recurso). As seções abaixo guardam o texto narrativo que
-- alimenta a geração. As duas coisas convivem: a tabela é a regra,
-- a seção é o briefing.
--
-- 'add value' fora de uso no mesmo arquivo é seguro em transação
-- (PostgreSQL 12+). Nenhuma linha abaixo usa os valores novos.
-- -------------------------------------------------------------

alter type knowledge_section add value if not exists 'products';
alter type knowledge_section add value if not exists 'platforms';
alter type knowledge_section add value if not exists 'resources';
alter type knowledge_section add value if not exists 'memory';

-- -------------------------------------------------------------
-- 2. Escopo contratado, por linha
--
-- A descoberta mais cara do piloto. O contrato da Queensberry diz
-- "7 Classic, 4 Gourmet, 2 Diet, 1 institucional" — quatorze peças
-- distribuídas por LINHA DE PRODUTO. brand_platforms.format_quotas
-- conta por formato e continua valendo para quem contrata assim;
-- esta tabela cobre o caso real da carteira.
--
-- O rótulo é livre de propósito: cada contrato conta do seu jeito, e
-- forçar um enum aqui seria repetir o erro que esta migração corrige.
-- -------------------------------------------------------------

create table brand_scope (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  label         text not null,
  monthly_quota integer not null default 0 check (monthly_quota >= 0),
  position      integer not null default 0,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (brand_id, label)
);

create index brand_scope_brand_idx on brand_scope (brand_id) where active;

-- A pauta precisa saber a que linha pertence para a conferência fechar.
alter table content_ideas
  add column scope_id uuid references brand_scope(id) on delete set null;

create index content_ideas_scope_idx on content_ideas (scope_id);

-- -------------------------------------------------------------
-- 3. Imagens
--
-- O bitmap mora no Supabase Storage; aqui fica o ponteiro, o dono e
-- a procedência. 'source' registra se veio de upload, de gerador ou
-- de banco de imagem — informação que a agência vai precisar no dia
-- em que um cliente perguntar de onde saiu aquela foto.
-- -------------------------------------------------------------

create table assets (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands(id) on delete cascade,
  storage_path text not null unique,
  mime_type    text not null,
  bytes        integer,
  width        integer,
  height       integer,
  source       text not null default 'upload'
                 check (source in ('upload','generated','stock','library')),
  source_meta  jsonb not null default '{}'::jsonb,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index assets_brand_idx on assets (brand_id);

-- -------------------------------------------------------------
-- 4. O conteúdo da peça
--
-- Uma linha por pauta. Separado de content_ideas porque a ideia é
-- aprovada antes de o conteúdo existir, e porque refinar a ideia não
-- deve invalidar silenciosamente a legenda já escrita —
-- generated_for_version é o que permite avisar quando isso acontece.
-- -------------------------------------------------------------

create table idea_content (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null unique references content_ideas(id) on delete cascade,
  -- desnormalizado de propósito: a política de RLS filtra por marca
  -- sem precisar de join, e join em política custa caro.
  brand_id   uuid not null references brands(id) on delete cascade,

  piece_kind   text not null default 'image'
                 check (piece_kind in ('image','carousel','video')),
  aspect_ratio text not null default '1:1'
                 check (aspect_ratio in ('1:1','4:5','9:16','16:9')),
  channel      text,

  -- legenda
  caption          text,
  cta              text,
  hashtags         text[] not null default '{}',
  alt_text         text,
  caption_variants jsonb  not null default '[]'::jsonb,

  -- direção de arte
  art_concept  text,
  art_direction text,
  image_prompt text,
  scenes       jsonb not null default '[]'::jsonb,

  -- composição da peça: o layout que a IA decidiu e o enquadramento
  -- que a equipe ajustou sobre a imagem
  layout   jsonb not null default '{}'::jsonb,
  frame    jsonb not null default '{}'::jsonb,
  asset_id uuid references assets(id) on delete set null,

  -- a versão da ideia para a qual este conteúdo foi escrito
  generated_for_version integer,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idea_content_brand_idx on idea_content (brand_id);
create index idea_content_asset_idx on idea_content (asset_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger idea_content_touch
  before update on idea_content
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------
-- 5. Isolamento
--
-- Mesma regra das tabelas anteriores: equipe alcança as marcas em
-- que é membro, admin alcança todas, cliente só enxerga o que já
-- saiu da área interna. Reaproveita as funções do 0002.
-- -------------------------------------------------------------

alter table brand_scope   enable row level security;
alter table assets        enable row level security;
alter table idea_content  enable row level security;

-- Permissão de tabela, explícita.
--
-- O Supabase configura privilégios padrão que dariam isso de graça,
-- e é por isso que as migrações anteriores não precisaram declarar.
-- Depender de configuração implícita do provedor é frágil: se um dia
-- o banco for restaurado em outro lugar, ou os padrões mudarem, as
-- tabelas ficam inacessíveis e o sintoma ("permission denied") não
-- aponta para a causa. Aqui fica dito.
--
-- Isto NÃO afrouxa o isolamento: o GRANT abre a porta da tabela, e a
-- política decide quais linhas passam. Sem política, nada passa.
grant select, insert, update, delete on public.brand_scope  to authenticated;
grant select, insert, update, delete on public.assets       to authenticated;
grant select, insert, update, delete on public.idea_content to authenticated;

-- escopo contratado: leitura e escrita da equipe
create policy brand_scope_staff_all on public.brand_scope for all to authenticated
  using      (public.is_staff() and public.can_access_brand(brand_id))
  with check (public.is_staff() and public.can_access_brand(brand_id));

-- o cliente vê o escopo do próprio contrato, sem poder alterá-lo
create policy brand_scope_client_read on public.brand_scope for select to authenticated
  using (public.auth_role() = 'client' and brand_id = any(public.auth_brand_ids()));

-- imagens: equipe escreve; cliente só vê a imagem de uma peça já liberada
create policy assets_staff_all on public.assets for all to authenticated
  using      (public.is_staff() and public.can_access_brand(brand_id))
  with check (public.is_staff() and public.can_access_brand(brand_id));

create policy assets_client_read on public.assets for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and exists (
      select 1 from public.idea_content ic
      where ic.asset_id = assets.id
        and public.idea_is_client_visible(ic.idea_id)
    )
  );

-- conteúdo: equipe escreve; cliente lê quando a pauta já foi liberada
create policy idea_content_staff_all on public.idea_content for all to authenticated
  using      (public.is_staff() and public.can_access_brand(brand_id))
  with check (public.is_staff() and public.can_access_brand(brand_id));

create policy idea_content_client_read on public.idea_content for select to authenticated
  using (
    public.auth_role() = 'client'
    and brand_id = any(public.auth_brand_ids())
    and public.idea_is_client_visible(idea_id)
  );

-- -------------------------------------------------------------
-- 6. Coerência entre marca da pauta e marca do conteúdo
--
-- brand_id desnormalizado acelera a política, mas abre espaço para
-- divergir de content_ideas.brand_id. Esta trava fecha isso — e é
-- exatamente o tipo de erro que só aparece em produção, num mês
-- movimentado, quando alguém vê a peça de um cliente no painel de
-- outro.
-- -------------------------------------------------------------

create or replace function public.idea_content_brand_matches()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  idea_brand uuid;
begin
  select brand_id into idea_brand from public.content_ideas where id = new.idea_id;
  if idea_brand is null then
    raise exception 'pauta % não existe', new.idea_id;
  end if;
  if idea_brand <> new.brand_id then
    raise exception 'marca do conteúdo (%) diverge da marca da pauta (%)',
      new.brand_id, idea_brand;
  end if;
  return new;
end;
$$;

create trigger idea_content_brand_guard
  before insert or update of brand_id, idea_id on idea_content
  for each row execute function public.idea_content_brand_matches();
