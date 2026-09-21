-- =============================================================
-- Alta Social Planner · 0018 · Quem apaga um planejamento, e quando
--
-- A regra nova, pedida pelo André:
--
--   administração     apaga qualquer planejamento, em qualquer estado —
--                     inclusive depois que o cliente avaliou;
--   equipe da Alta    apaga enquanto o mês não foi enviado ao cliente.
--                     Depois do envio, não.
--
-- "Equipe" aqui é quem pode EDITAR a marca: responsável ou edita.
-- Quem só lê continua sem apagar nada — apagar é a alteração mais
-- forte que existe, e o combinado para "só lê" é não alterar.
--
-- "Enviado" é `client_released_at` preenchido: é o momento em que o
-- mês aparece no portal do cliente.
--
-- UM DEFEITO QUE ESTAVA ESCONDIDO
--
-- Ao testar esta regra com dado realista, apareceu um problema que já
-- existia desde a 0014: apagar um planejamento apaga, em cascata, as
-- versões de texto e as aprovações das pautas. Só que essas duas
-- tabelas são append-only (0003) — o gatilho recusa qualquer delete.
-- Resultado: **qualquer mês em que a equipe tivesse editado uma única
-- pauta era impossível de apagar**, até para a administração, com uma
-- mensagem sobre "append-only" que não explicava nada. Os testes da
-- 0014 passavam porque os meses de teste não tinham nenhuma versão.
--
-- A correção: o histórico continua imutável no dia a dia, mas cede
-- quando — e só quando — é a própria função `apagar_plano` que está
-- levando o mês inteiro embora. Ela acende uma marca na transação; o
-- gatilho só aceita apagar se a marca estiver acesa E o delete vier
-- de uma cascata (nunca de um DELETE escrito direto na tabela).
-- =============================================================

-- -------------------------------------------------------------
-- 1. A regra, num lugar só
-- -------------------------------------------------------------

create or replace function public.pode_apagar_plano(p_brand uuid, p_liberado timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.is_admin() then true
    when p_liberado is not null then false
    else public.pode_editar_marca(p_brand)
  end
$$;

revoke execute on function public.pode_apagar_plano(uuid, timestamptz) from public;
grant execute on function public.pode_apagar_plano(uuid, timestamptz) to authenticated;

-- -------------------------------------------------------------
-- 2. A política de delete em plans
-- -------------------------------------------------------------

drop policy if exists staff_apaga on public.plans;

create policy staff_apaga on public.plans
  for delete to authenticated
  using (public.pode_apagar_plano(brand_id, client_released_at));

-- -------------------------------------------------------------
-- 3. O gatilho, para quem tentar por fora da política
-- -------------------------------------------------------------

create or replace function public.plans_apagar_guard()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  -- Conexão direta ao banco (script de manutenção): passa.
  if auth.uid() is null then return old; end if;

  if public.pode_apagar_plano(old.brand_id, old.client_released_at) then
    return old;
  end if;

  if old.client_released_at is not null and public.pode_editar_marca(old.brand_id) then
    raise exception 'Este mês já foi enviado ao cliente. Depois do envio, só a administração pode excluir.'
      using errcode = 'insufficient_privilege';
  end if;

  raise exception 'Você não tem permissão para excluir planejamentos desta marca.'
    using errcode = 'insufficient_privilege';
end $$;

-- -------------------------------------------------------------
-- 4. A função que a tela chama
-- -------------------------------------------------------------

create or replace function public.apagar_plano(p_plan_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  marca    uuid;
  liberado timestamptz;
  quantas  int;
begin
  select brand_id, client_released_at into marca, liberado
  from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Planejamento não encontrado, ou você não tem acesso a ele.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.pode_apagar_plano(marca, liberado) then
    if liberado is not null and public.pode_editar_marca(marca) then
      raise exception 'Este mês já foi enviado ao cliente. Depois do envio, só a administração pode excluir.'
        using errcode = 'insufficient_privilege';
    end if;
    raise exception 'Você não tem permissão para excluir planejamentos desta marca.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into quantas from public.content_ideas where plan_id = p_plan_id;

  -- A marca na transação: "é o apagar_plano que está levando este mês".
  -- O terceiro argumento `true` faz ela valer só até o fim desta
  -- transação — não vaza para a próxima chamada da mesma conexão.
  perform set_config('alta.apagando_plano', p_plan_id::text, true);

  delete from public.plans where id = p_plan_id;

  perform set_config('alta.apagando_plano', '', true);

  return quantas;
end $$;

comment on function public.apagar_plano is
  'Apaga um planejamento e tudo o que pende dele. Administração: sempre. Equipe que edita a marca: só antes do envio ao cliente.';

-- -------------------------------------------------------------
-- 5. O histórico imutável cede à cascata do apagar_plano, e só a ela
-- -------------------------------------------------------------

create or replace function public.versions_are_immutable()
returns trigger language plpgsql as $$
declare
  autoria text := case tg_table_name when 'approvals' then 'actor_id' else 'author_id' end;
begin
  -- (a) O mês inteiro está sendo apagado pela função apagar_plano. Tudo
  --     que pende dele vai junto — inclusive o "set null" de colunas
  --     que apontam para comentários que também estão saindo.
  --     `pg_trigger_depth() > 1`: o delete veio de uma cascata, não de
  --     um DELETE escrito direto nesta tabela.
  if pg_trigger_depth() > 1
     and coalesce(current_setting('alta.apagando_plano', true), '') <> ''
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- (b) A pessoa foi apagada (0016) e a chave estrangeira está zerando
  --     a autoria. Tudo o mais tem de estar idêntico.
  if tg_op = 'UPDATE'
     and to_jsonb(new) -> autoria = 'null'::jsonb
     and to_jsonb(old) -> autoria <> 'null'::jsonb
     and (to_jsonb(new) - autoria) = (to_jsonb(old) - autoria)
  then
    return new;
  end if;

  raise exception '% e append-only: o historico nao pode ser alterado nem removido', tg_table_name
    using errcode = 'check_violation';
end $$;

-- -------------------------------------------------------------
-- 6. Verificação
-- -------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'plans' and p.polname = 'staff_apaga' and p.polcmd = 'd'
  ) then
    raise exception 'A politica staff_apaga em plans nao ficou instalada';
  end if;
  raise notice 'Apagar planejamento: admin sempre; equipe que edita, so antes do envio.';
end $$;
