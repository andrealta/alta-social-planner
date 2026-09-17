-- =============================================================
-- Alta Social Planner · 0012 · Proteção forçada nas tabelas novas
--
-- A 0002 ligou `enable` E `force` row level security em toda tabela
-- que existia naquele momento, num laço. As tabelas criadas depois
-- — assets, brand_scope e idea_content, da 0005 — nasceram com
-- `enable` (o laço não rodou de novo) mas sem `force`.
--
-- A diferença importa: sem `force`, o DONO da tabela ignora as
-- políticas. Em uso normal ninguém se conecta como dono, então nada
-- vazou. Mas este sistema tem onze funções SECURITY DEFINER, que
-- rodam justamente com os poderes do dono. No dia em que uma delas
-- precisar ler `idea_content`, ela leria TUDO, de todos os clientes,
-- em silêncio — e o autor não teria como desconfiar, porque as outras
-- 26 tabelas se comportam do jeito certo.
--
-- Como isso passou: a verificação da 0002 pergunta se a proteção está
-- LIGADA, não se está FORÇADA. Corrigido junto, abaixo.
-- =============================================================

do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not like '\_\_drizzle%'
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('alter table public.%I force row level security', t.relname);
    raise notice 'protecao forcada em %', t.relname;
  end loop;
end $$;

-- -------------------------------------------------------------
-- A verificação, agora perguntando as duas coisas
-- -------------------------------------------------------------

do $$
declare
  frouxas text[];
  sem_policy text[];
begin
  select coalesce(array_agg(c.relname), '{}') into frouxas
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not like '\_\_drizzle%'
    and (not c.relrowsecurity or not c.relforcerowsecurity);

  select coalesce(array_agg(c.relname), '{}') into sem_policy
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not like '\_\_drizzle%'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if array_length(frouxas, 1) > 0 then
    raise exception 'Tabelas sem protecao FORCADA: %', frouxas;
  end if;
  if array_length(sem_policy, 1) > 0 then
    raise exception 'Tabelas sem nenhuma politica: %', sem_policy;
  end if;

  raise notice 'RLS: todas as tabelas com protecao FORCADA e com politica.';
end $$;
