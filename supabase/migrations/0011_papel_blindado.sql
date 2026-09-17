-- =============================================================
-- Alta Social Planner · 0011 · Ninguém se promove sozinho
--
-- CORREÇÃO DE FALHA DE SEGURANÇA. Existia desde a 0002.
--
-- A política `profiles_self_update` deixa cada pessoa editar o
-- próprio perfil — para trocar o nome, a foto. Mas `role` mora na
-- mesma linha, e RLS não distingue coluna. Resultado: qualquer conta,
-- inclusive um cliente, podia rodar
--
--     update profiles set role = 'admin' where id = auth.uid()
--
-- e virar administradora. E administrador alcança TODAS as marcas —
-- as políticas de isolamento entre clientes passam todas por
-- `is_admin()`. Uma linha de SQL derrubava a separação inteira.
--
-- Por que passou despercebido: todos os testes anteriores perguntavam
-- "fulano consegue ver o dado de outra marca?". Nenhum perguntava
-- "fulano consegue virar outra pessoa?". Isolamento testado, escalada
-- de privilégio não.
--
-- A correção é um gatilho, e não uma política, porque a decisão
-- depende de comparar o valor ANTIGO com o NOVO — e `with check` só
-- enxerga o novo. É exatamente o buraco que o gatilho fecha.
-- =============================================================

create or replace function public.profiles_guard()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Só a administração pode mudar o papel de alguém.'
      using errcode = 'insufficient_privilege';
  end if;

  -- O e-mail é a identidade de login, e mora em auth.users. Mudar só
  -- a cópia daqui deixa as duas versões brigando, e ninguém percebe
  -- até alguém não conseguir entrar.
  if new.email is distinct from old.email and not public.is_admin() then
    raise exception 'O e-mail não se muda por aqui.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.id is distinct from old.id then
    raise exception 'O identificador de uma pessoa não muda.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- -------------------------------------------------------------
-- A mesma pergunta para o vínculo com a marca
--
-- `brand_members` tem uma coluna `brand_id`, então o laço genérico da
-- 0002 deu à equipe acesso total a ela nas marcas que já alcança. Na
-- prática isso permite a um editor promover a si mesmo a
-- 'owner' — pequeno perto do anterior, mas é a mesma família de erro:
-- quem é alcançado por uma regra não deveria poder reescrever a regra.
-- Vínculo é assunto de administração.
-- -------------------------------------------------------------

drop policy if exists staff_all on public.brand_members;

create policy brand_members_staff_read_all on public.brand_members
  for select to authenticated
  using (public.is_staff() and public.can_access_brand(brand_id));

comment on table public.brand_members is
  'Quem alcança qual marca. Só a administração escreve aqui.';
