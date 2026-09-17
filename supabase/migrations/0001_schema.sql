-- =============================================================
-- Alta Social Planner · Schema inicial
--
-- Este arquivo foi escrito à mão para espelhar src/db/schema/*.ts.
-- A partir daqui, use `npm run db:generate` (drizzle-kit) para as
-- próximas migrations. Rode o generate uma vez após clonar: se o
-- diff vier vazio, TypeScript e SQL estão de acordo.
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type user_role             as enum ('admin','staff','client');
create type brand_access          as enum ('owner','editor','viewer','client');
create type knowledge_section     as enum ('identity','positioning','audience','voice','objectives','guidelines','other');
create type product_priority      as enum ('high','medium','low');
create type platform              as enum ('instagram','linkedin','tiktok','youtube','facebook','pinterest');
create type resource_kind         as enum ('stock_images','own_photography','product_photography','video','people_recording','influencers','animation','motion','illustration','ai_images','interviews','specialists','stock_video');
create type drive_category        as enum ('branding','products','photos','videos','campaigns','past_plans','research','institutional','other');
create type extraction_status     as enum ('pending','processing','done','failed','skipped');
create type plan_status           as enum ('draft','generating','internal_review','sent_to_client','approved','archived');
create type requirement_priority  as enum ('high','medium','low','blocker');
create type relevance             as enum ('decisive','high','medium','low');
create type idea_status           as enum ('ai_generated','internal_review','internal_changes','internally_approved','sent_to_client','client_changes_requested','client_approved');
create type version_trigger       as enum ('ai','internal','client_request');
create type author_kind           as enum ('internal','client');
create type comment_visibility    as enum ('internal','shared');
create type approval_decision     as enum ('approved','changes_requested');
create type reference_kind        as enum ('visual','content','source');
create type ai_agent              as enum ('research','strategy','content','critique','refine','document_card','brand_memory');
create type ai_run_status         as enum ('running','ok','failed');
create type notification_kind     as enum ('client_changes_requested','client_approved','plan_fully_approved','mention','plan_sent_to_client');
create type feedback_kind         as enum ('approves','rejects');

-- ---------- identidade ----------
create table profiles (
  id          uuid primary key,
  name        text not null,
  email       text not null,
  role        user_role not null default 'staff',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  segment     text,
  site        text,
  socials     text[],
  competitors text[],
  markets     text[],
  regions     text[],
  logo_url    text,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint brands_slug_key unique (slug)
);

create table brand_members (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  access     brand_access not null default 'editor',
  created_at timestamptz not null default now(),
  constraint brand_members_brand_user_key unique (brand_id, user_id)
);
create index brand_members_user_idx on brand_members(user_id);

-- ---------- marca ----------
create table brand_knowledge (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands(id) on delete cascade,
  section    knowledge_section not null,
  content    jsonb not null default '{}',
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint brand_knowledge_brand_section_key unique (brand_id, section)
);

create table products (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  name          text not null,
  category      text,
  description   text,
  benefits      text,
  differentials text,
  audience      text,
  tech_info     text,
  priority      product_priority not null default 'medium',
  comms_notes   text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index products_brand_idx on products(brand_id);

create table brand_platforms (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  platform      platform not null,
  monthly_quota integer not null default 0,
  format_quotas jsonb not null default '{}',
  rules         text,
  active        boolean not null default true,
  constraint brand_platforms_brand_platform_key unique (brand_id, platform)
);

create table resources (
  id        uuid primary key default gen_random_uuid(),
  brand_id  uuid not null references brands(id) on delete cascade,
  kind      resource_kind not null,
  available boolean not null default false,
  notes     text,
  constraint resources_brand_kind_key unique (brand_id, kind)
);

create table brand_memory (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands(id) on delete cascade,
  digest          jsonb not null,
  source_plan_ids uuid[],
  generated_at    timestamptz not null default now(),
  constraint brand_memory_brand_key unique (brand_id)
);

create table feedback_patterns (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id) on delete cascade,
  kind           feedback_kind not null,
  pattern        text not null,
  evidence_count integer not null default 1,
  last_seen_at   timestamptz not null default now()
);
create index feedback_patterns_brand_idx on feedback_patterns(brand_id);

-- ---------- drive ----------
create table drive_folders (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references brands(id) on delete cascade,
  google_folder_id text not null,
  category         drive_category not null default 'other',
  path             text not null,
  last_synced_at   timestamptz,
  constraint drive_folders_brand_google_key unique (brand_id, google_folder_id)
);

create table drive_documents (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references brands(id) on delete cascade,
  folder_id         uuid not null references drive_folders(id) on delete cascade,
  google_file_id    text not null,
  name              text not null,
  mime_type         text not null,
  size              bigint,
  modified_at       timestamptz,
  checksum          text,
  extracted_text    text,
  extraction_status extraction_status not null default 'pending',
  extraction_error  text,
  constraint drive_documents_brand_google_key unique (brand_id, google_file_id)
);
create index drive_documents_folder_idx on drive_documents(folder_id);
create index drive_documents_status_idx on drive_documents(extraction_status);

create table drive_document_cards (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id) on delete cascade,
  document_id    uuid not null references drive_documents(id) on delete cascade,
  summary        text not null,
  topics         text[],
  useful_for     text[],
  token_estimate integer,
  generated_at   timestamptz not null default now(),
  constraint drive_document_cards_document_key unique (document_id)
);

-- ---------- planejamento ----------
create table plans (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references brands(id) on delete cascade,
  month              integer not null,
  year               integer not null,
  status             plan_status not null default 'draft',
  created_by         uuid references profiles(id) on delete set null,
  generation_run_id  text,
  client_released_at timestamptz,
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  constraint plans_brand_period_key unique (brand_id, year, month),
  constraint plans_month_check check (month between 1 and 12)
);
create index plans_brand_idx on plans(brand_id);

create table client_access_links (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands(id) on delete cascade,
  plan_id      uuid not null references plans(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  token_hash   text not null,
  expires_at   timestamptz not null default (now() + interval '30 days'),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint client_access_links_token_key unique (token_hash)
);
create index client_access_links_plan_idx on client_access_links(plan_id);

create table plan_requirements (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id) on delete cascade,
  plan_id        uuid not null references plans(id) on delete cascade,
  title          text not null,
  description    text,
  date_start     date,
  date_end       date,
  platform       platform,
  product_id     uuid references products(id) on delete set null,
  priority       requirement_priority not null default 'medium',
  attachment_url text,
  created_at     timestamptz not null default now()
);
create index plan_requirements_plan_idx on plan_requirements(plan_id);

create table research_runs (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands(id) on delete cascade,
  plan_id     uuid not null references plans(id) on delete cascade,
  status      text not null default 'running',
  summary     text,
  queries     jsonb not null default '[]',
  discarded   jsonb default '[]',
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index research_runs_plan_idx on research_runs(plan_id);

create table research_sources (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands(id) on delete cascade,
  research_run_id uuid not null references research_runs(id) on delete cascade,
  title           text not null,
  publisher       text,
  url             text,
  published_at    date,
  excerpt         text,
  summary         text,
  enables         text,
  relevance       relevance not null default 'medium'
);
create index research_sources_run_idx on research_sources(research_run_id);

create table editorial_strategies (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references brands(id) on delete cascade,
  plan_id              uuid not null references plans(id) on delete cascade,
  reading              text not null,
  territories          jsonb not null default '[]',
  mix                  jsonb not null default '{}',
  priority_product_ids uuid[],
  opportunities        jsonb default '[]',
  exclusions           jsonb default '[]',
  version              integer not null default 1,
  created_at           timestamptz not null default now()
);
create index editorial_strategies_plan_idx on editorial_strategies(plan_id);

create table content_ideas (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references brands(id) on delete cascade,
  plan_id            uuid not null references plans(id) on delete cascade,
  title              text not null,
  concept            text,
  description        text,
  editorial_line     text,
  objective          text,
  audience           text,
  product_id         uuid references products(id) on delete set null,
  rationale          text,
  cta                text,
  required_resources resource_kind[],
  requirement_id     uuid references plan_requirements(id) on delete set null,
  status             idea_status not null default 'ai_generated',
  current_version    integer not null default 1,
  owner_id           uuid references profiles(id) on delete set null,
  position           integer not null default 0,
  created_at         timestamptz not null default now()
);
create index content_ideas_plan_idx on content_ideas(plan_id);
create index content_ideas_brand_status_idx on content_ideas(brand_id, status);

create table content_channels (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references brands(id) on delete cascade,
  idea_id             uuid not null references content_ideas(id) on delete cascade,
  platform            platform not null,
  format              text not null,
  scheduled_date      date,
  treatment           text,
  counts_toward_quota boolean not null default true
);
create index content_channels_idea_idx on content_channels(idea_id);
create index content_channels_date_idx on content_channels(brand_id, scheduled_date);

-- ---------- colaboração ----------
create table comments (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands(id) on delete cascade,
  idea_id     uuid not null references content_ideas(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  author_kind author_kind not null,
  body        text not null,
  visibility  comment_visibility not null default 'internal',
  mentions    uuid[],
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index comments_idea_idx on comments(idea_id);
create index comments_visibility_idx on comments(brand_id, visibility);

create table content_references (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references brands(id) on delete cascade,
  idea_id           uuid not null references content_ideas(id) on delete cascade,
  kind              reference_kind not null default 'visual',
  title             text,
  url               text,
  drive_document_id uuid references drive_documents(id) on delete set null,
  source_id         uuid references research_sources(id) on delete set null
);
create index content_references_idea_idx on content_references(idea_id);

create table content_versions (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands(id) on delete cascade,
  idea_id    uuid not null references content_ideas(id) on delete cascade,
  version    integer not null,
  snapshot   jsonb not null,
  reason     text,
  trigger    version_trigger not null,
  author_id  uuid references profiles(id) on delete set null,
  comment_id uuid references comments(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint content_versions_idea_version_key unique (idea_id, version)
);

create table approvals (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references brands(id) on delete cascade,
  idea_id            uuid not null references content_ideas(id) on delete cascade,
  version            integer not null,
  actor_id           uuid references profiles(id) on delete set null,
  actor_kind         author_kind not null,
  decision           approval_decision not null,
  comment_id         uuid references comments(id) on delete set null,
  seconds_to_decide  integer,
  created_at         timestamptz not null default now()
);
create index approvals_idea_idx on approvals(idea_id);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  brand_id   uuid references brands(id) on delete cascade,
  kind       notification_kind not null,
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on notifications(user_id, read_at);

create table ai_runs (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references brands(id) on delete cascade,
  plan_id            uuid references plans(id) on delete cascade,
  idea_id            uuid references content_ideas(id) on delete set null,
  run_id             text,
  agent              ai_agent not null,
  model              text not null,
  prompt_version     text not null,
  input_tokens       integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens  integer not null default 0,
  output_tokens      integer not null default 0,
  web_searches       integer not null default 0,
  cost_usd           numeric(10,6) not null default 0,
  latency_ms         integer,
  status             ai_run_status not null default 'running',
  error              text,
  created_at         timestamptz not null default now()
);
create index ai_runs_plan_idx on ai_runs(plan_id);
create index ai_runs_brand_created_idx on ai_runs(brand_id, created_at);
