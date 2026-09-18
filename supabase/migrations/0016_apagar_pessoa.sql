-- =============================================================
-- Alta Social Planner · 0016 · Apagar pessoa
--
-- O pedido era "o administrador precisa poder excluir um cadastro".
-- Ao abrir o banco para escrever isto, o achado foi outro: a política
-- `profiles_admin_all` é `for all`, e `all` inclui `delete`. Ou seja,
-- **já dava** para apagar qualquer pessoa pela API — inclusive a si
-- mesmo, inclusive o único administrador que existe. Faltava a tela,
-- não a permissão. O sistema estava a uma chamada de distância de
-- ficar sem ninguém que pudesse administrá-lo.
--
-- Então esta migração não abre nada. Ela FECHA duas portas e, de
-- quebra, permite construir o botão com segurança:
--
--   1. ninguém apaga a própria conta — quem se apaga não tem como
--      desfazer, porque perdeu o acesso junto;
--   2. não se apaga o último administrador — o sistema ficaria sem
--      quem cria gente, e a saída seria mexer no banco na mão.
--
-- A trava é gatilho, não tela. Tela escondendo botão é conforto.
--
-- O QUE ACONTECE COM O HISTÓRICO
--
-- Nada é perdido. As colunas que apontam para `profiles` são todas
-- `on delete set null`: aprovação, versão de texto, comentário e
-- autoria de plano continuam existindo, só deixam de ter nome. Foi
-- decisão do esquema original e continua certa — apagar uma pessoa
-- não pode apagar a prova de que o cliente aprovou um conteúdo.
--
-- E AQUI O TESTE ACHOU UM IMPEDIMENTO REAL
--
-- `content_versions` e `approvals` são append-only desde a 0003: um
-- gatilho recusa qualquer update ou delete nelas. Só que "apagar a
-- pessoa" dispara, pela chave estrangeira, um UPDATE nessas tabelas
-- para zerar a autoria — e o gatilho recusava. Na prática, quem
-- tivesse escrito uma versão ou aprovado uma pauta era **impossível**
-- de apagar, com uma mensagem que não tinha nada a ver com pessoas.
--
-- A correção abaixo abre uma fresta do tamanho exato do problema: o
-- update passa se — e só se — a única coluna que mudou foi a autoria,
-- e ela virou nula. Qualquer outra alteração continua recusada, que é
-- o que "append-only" precisa significar para o histórico valer como
-- prova.
-- =============================================================

create or replace function public.versions_are_immutable()
returns trigger language plpgsql as $$
declare
  autoria text := case tg_table_name when 'approvals' then 'actor_id' else 'author_id' end;
begin
  -- A pessoa foi apagada e a chave estrangeira está zerando a autoria.
  -- Tudo o mais tem de estar idêntico: é a comparação do registro
  -- inteiro, menos essa coluna.
  if tg_op = 'UPDATE'
     and to_jsonb(new) -> autoria = 'null'::jsonb
     and to_jsonb(old) -> autoria <> 'null'::jsonb
     and (to_jsonb(new) - autoria) = (to_jsonb(old) - autoria)
  then
    return new;
  end if;

  raise exception '% e append-only: so a autoria pode ser removida, e apenas quando a pessoa e apagada', tg_table_name
    using errcode = 'check_violation';
end $$;

create or replace function public.profiles_apagar_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quantos_admins int;
begin
  -- Conexão direta ao banco (script de manutenção, migração): não há
  -- sessão, não há quem proteger de si mesmo. Mesma isenção
  -- administrativa dos outros gatilhos deste sistema.
  if auth.uid() is null then
    return old;
  end if;

  if old.id = auth.uid() then
    raise exception 'Você não pode apagar a própria conta. Peça a outro administrador.'
      using errcode = 'check_violation';
  end if;

  if old.role = 'admin' then
    select count(*) into quantos_admins from public.profiles where role = 'admin';
    if quantos_admins <= 1 then
      raise exception 'Esta é a única conta de administração. Promova outra pessoa antes de apagar esta.'
        using errcode = 'check_violation';
    end if;
  end if;

  return old;
end $$;

drop trigger if exists profiles_apagar_guard_trg on public.profiles;
create trigger profiles_apagar_guard_trg
  before delete on public.profiles
  for each row execute function public.profiles_apagar_guard();

-- -------------------------------------------------------------
-- O que esta pessoa deixa para trás
--
-- Serve para a confirmação na tela dizer o tamanho do que se perde
-- ANTES do clique, em vez de depois. "Apagar Marina" e "apagar Marina,
-- que aprovou 14 conteúdos" são decisões diferentes.
-- -------------------------------------------------------------

create or replace function public.historico_da_pessoa(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
begin
  if not public.is_admin() and auth.uid() is not null then
    raise exception 'Só quem administra pode consultar isto.'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'nome',        (select name from public.profiles where id = p_id),
    'papel',       (select role from public.profiles where id = p_id),
    'aprovacoes',  (select count(*) from public.approvals        where actor_id  = p_id),
    'versoes',     (select count(*) from public.content_versions where author_id = p_id),
    'comentarios', (select count(*) from public.comments         where author_id = p_id),
    'planos',      (select count(*) from public.plans            where created_by = p_id),
    'marcas',      (select count(*) from public.brand_members    where user_id   = p_id)
  ) into r;

  return r;
end $$;

grant execute on function public.historico_da_pessoa(uuid) to authenticated;

-- -------------------------------------------------------------
-- A verificação
-- -------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'profiles_apagar_guard_trg'
  ) then
    raise exception 'O gatilho de protecao nao ficou instalado';
  end if;

  raise notice 'Apagar pessoa: gatilho no lugar (nem a propria conta, nem o ultimo admin).';
end $$;
