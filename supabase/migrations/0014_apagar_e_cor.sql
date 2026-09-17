-- =============================================================
-- Alta Social Planner · 0014 · Apagar um planejamento, e a cor da marca
--
-- 1. APAGAR UM PLANEJAMENTO
--
-- Faltava. A geração custa dinheiro e às vezes sai ruim; sem poder
-- apagar, o mês errado fica para sempre na lista, e alguém abre o
-- errado seis meses depois.
--
-- Quem pode: responsável pela marca e administração. Editor não —
-- apagar um mês inteiro não é edição, é desfazer o trabalho de todos.
--
-- Onde NÃO pode: se o cliente já decidiu alguma coisa naquele mês.
-- Uma aprovação registrada é a prova de que o cliente viu e disse sim.
-- Isso não se apaga para limpar a lista; se um dia precisar mesmo,
-- é conversa com quem cuida do banco, não um botão na tela.
--
-- 2. A COR DA MARCA
--
-- Para o portal do cliente abrir com a cara da marca dele e não com
-- a da Alta. Guardada como texto com formato conferido pelo banco:
-- campo de cor que aceita qualquer coisa vira "azul escuro" escrito
-- à mão em algum lugar.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Só o responsável apaga
-- -------------------------------------------------------------

-- A política do 0013 deixava qualquer editor apagar a linha de plans
-- direto pela API. Era um furo: o botão nem existia na tela, mas a
-- porta estava aberta. Leitura e escrita continuam como estavam;
-- apagar passa a exigir nível de responsável.
drop policy if exists staff_apaga on public.plans;

create policy staff_apaga on public.plans
  for delete to authenticated
  using (public.pode_enviar_ao_cliente(brand_id));

-- E o gatilho, para quem tentar por fora da política — a mesma
-- lógica do 0013: a regra vale no banco, não na tela.
create or replace function public.plans_apagar_guard()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  decisoes int;
begin
  -- Conexão direta ao banco (script de manutenção): passa. Quem tem
  -- a senha do banco já pode tudo; travar aqui só atrapalharia o
  -- conserto de dado.
  if auth.uid() is null then return old; end if;

  if not public.pode_enviar_ao_cliente(old.brand_id) then
    raise exception 'Só quem é responsável por esta marca pode apagar um planejamento.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into decisoes
  from public.approvals a
  join public.content_ideas ci on ci.id = a.idea_id
  where ci.plan_id = old.id
    and a.actor_kind = 'client';

  if decisoes > 0 then
    raise exception
      'Este mês já tem % decisão(ões) do cliente registradas. Um planejamento que o cliente avaliou não é apagado.', decisoes
      using errcode = 'check_violation';
  end if;

  return old;
end $$;

drop trigger if exists plans_apagar_guard_trg on public.plans;
create trigger plans_apagar_guard_trg
  before delete on public.plans
  for each row execute function public.plans_apagar_guard();

-- -------------------------------------------------------------
-- 2. A função que a tela chama
--
-- Existe para que a tela receba uma frase decente e um número: o
-- delete direto devolveria "0 linhas afetadas" quando a política
-- recusasse, e ninguém entenderia o motivo.
--
-- SECURITY INVOKER: roda com a identidade de quem chamou, e as
-- políticas continuam valendo. A função não é atalho para nada.
-- -------------------------------------------------------------

create or replace function public.apagar_plano(p_plan_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  marca   uuid;
  quantas int;
begin
  select brand_id into marca from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Planejamento não encontrado, ou você não tem acesso a ele.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.pode_enviar_ao_cliente(marca) then
    raise exception 'Só quem é responsável por esta marca pode apagar um planejamento. Peça a quem responde pela conta.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into quantas
  from public.content_ideas where plan_id = p_plan_id;

  -- As pautas, o conteúdo escrito, as versões e os comentários saem
  -- junto pelo `on delete cascade` do 0001. É de propósito: pauta sem
  -- planejamento não é dado, é entulho.
  delete from public.plans where id = p_plan_id;

  return quantas;
end $$;

comment on function public.apagar_plano is
  'Apaga um planejamento e tudo o que pende dele. Só responsável ou administração, e só se o cliente ainda não decidiu nada.';

revoke all on function public.apagar_plano(uuid) from public;
grant execute on function public.apagar_plano(uuid) to authenticated;
grant delete on public.plans to authenticated;

-- -------------------------------------------------------------
-- 3. A cor da marca
-- -------------------------------------------------------------

alter table public.brands
  add column if not exists color text;

alter table public.brands
  drop constraint if exists brands_color_hex;

alter table public.brands
  add constraint brands_color_hex
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.brands.color is
  'Cor da marca, em #RRGGBB. Usada no portal do cliente. Nula = usa a cor do sistema.';

-- -------------------------------------------------------------
-- 4. Verificação
-- -------------------------------------------------------------

do $$
declare
  faltando text[] := '{}';
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'plans_apagar_guard_trg' and not tgisinternal
  ) then faltando := faltando || 'gatilho plans_apagar_guard_trg'; end if;

  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'plans' and p.polname = 'staff_apaga' and p.polcmd = 'd'
  ) then faltando := faltando || 'politica staff_apaga em plans'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'color'
  ) then faltando := faltando || 'coluna brands.color'; end if;

  if array_length(faltando, 1) > 0 then
    raise exception 'A 0014 não ficou completa: %', faltando;
  end if;

  raise notice 'Apagar planejamento: restrito ao responsavel. Cor da marca: pronta.';
end $$;
