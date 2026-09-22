-- =============================================================
-- 0022: o material interno do planejamento sai da tabela que o
-- cliente lê.
-- =============================================================
--
-- Até aqui `plans` guardava, na mesma linha, o que é do cliente (mês,
-- status, a estratégia escrita para ele) e o que é só da Alta: o
-- briefing que a equipe digitou para a IA e a análise (leitura do mês,
-- territórios, crítica de cada pauta, alertas).
--
-- A política do cliente em `plans` libera a LINHA, e política de linha
-- não escolhe coluna. As telas do portal nunca mostraram a análise,
-- mas o banco a entregaria a quem pedisse direto pela API com a
-- sessão do cliente.
--
-- Por que tabela nova e não permissão por coluna: equipe e cliente
-- entram no banco com o mesmo papel (`authenticated`). Permissão de
-- coluna é por papel, não por pessoa, então tirar a coluna do cliente
-- tiraria da equipe também. Tabela própria com política própria
-- resolve do jeito que o resto do sistema já funciona.
--
-- A tabela nova só tem política para a equipe. Para o cliente não
-- existe política nenhuma, e com RLS forçada isso quer dizer: nada.

create table public.plano_interno (
  plan_id     uuid primary key references public.plans(id) on delete cascade,
  brand_id    uuid not null references public.brands(id) on delete cascade,
  briefing    text,
  analysis    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

comment on table public.plano_interno is
  'Material só da Alta sobre cada planejamento: o briefing para a IA e a análise '
  '(leitura do mês, territórios, crítica, alertas). O cliente não tem política aqui.';

create index plano_interno_brand_idx on public.plano_interno(brand_id);

-- A marca vem sempre do planejamento. Quem grava não escolhe: assim
-- não existe análise de uma marca pendurada no plano de outra.
create or replace function public.plano_interno_marca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.brand_id into new.brand_id from public.plans p where p.id = new.plan_id;
  if new.brand_id is null then
    raise exception 'Planejamento não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger plano_interno_marca_trg
  before insert or update on public.plano_interno
  for each row execute function public.plano_interno_marca();

alter table public.plano_interno enable row level security;
alter table public.plano_interno force row level security;

-- Os mesmos critérios de `plans` para a equipe.
create policy staff_le on public.plano_interno
  for select using (public.is_staff() and public.can_access_brand(brand_id));
create policy staff_cria on public.plano_interno
  for insert with check (public.pode_editar_marca(brand_id));
create policy staff_altera on public.plano_interno
  for update using (public.pode_editar_marca(brand_id))
  with check (public.pode_editar_marca(brand_id));
-- Sem política de DELETE: a linha só sai junto com o planejamento
-- (on delete cascade), e ninguém apaga a análise deixando o mês.

grant select, insert, update on public.plano_interno to authenticated;
revoke all on public.plano_interno from anon;

-- Leva o que já existe. Planejamento sem briefing e sem análise não
-- precisa de linha: quem lê trata "não tem" como vazio.
insert into public.plano_interno (plan_id, brand_id, briefing, analysis)
select id, brand_id, briefing, coalesce(analysis, '{}'::jsonb)
from public.plans
where briefing is not null or coalesce(analysis, '{}'::jsonb) <> '{}'::jsonb;

-- E tira de `plans`. Sem isso, a cópia antiga continuaria lá, visível.
alter table public.plans drop column briefing;
alter table public.plans drop column analysis;
