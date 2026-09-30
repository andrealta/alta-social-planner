-- 0037_ultimas_colunas.sql
--
-- As tres ultimas tabelas que o cliente lia direto.
--
-- A 0027 resolveu isto para `content_ideas` e `idea_content` e deixou a
-- frase que vale aqui tambem: RLS protege LINHAS, nao COLUNAS. A
-- politica diz QUAIS linhas o cliente ve; uma vez dentro da linha,
-- todas as colunas vem junto, apareca ou nao na tela.
--
-- Sobraram tres, e cada uma esconde uma coisa diferente:
--
--   brands        `competitors`, a lista de concorrentes que a agencia
--                 monta e varre. Entregar ao cliente a lista de quem a
--                 agencia considera concorrente dele e material de
--                 bastidor, e em alguns casos e constrangedor.
--
--   brand_scope   `notes`, a anotacao interna de cada linha do escopo.
--                 Campo criado para a equipe combinar como uma linha e
--                 tratada.
--
--   approvals     as decisoes de quem NAO e o cliente. A politica exige
--                 que a pauta ja esteja visivel para ele, e uma vez
--                 visivel toda decisao daquela pauta vem junto, inclusive
--                 a da equipe.
--
-- A correcao e a mesma da 0027, e e de proposito que seja a mesma: o
-- cliente deixa de alcancar as tabelas e passa a alcancar VISTAS que
-- listam, nome por nome, o que e dele. Coluna nova nasce invisivel para
-- ele; para aparecer, alguem precisa escrever o nome dela aqui.
--
-- SOBRE `approvals`: HOJE NAO HA O QUE VAZAR
--
-- Vale registrar com honestidade. A unica coisa que grava nessa tabela
-- e a `decidir_pauta`, e ela grava sempre `actor_kind = 'client'`. A
-- aprovacao interna da equipe hoje muda o status da pauta e nao escreve
-- decisao nenhuma. Ou seja: a porta esta aberta, mas ninguem passou por
-- ela ainda.
--
-- Fechar agora e barato justamente por isso. `src/lib/medidas.ts` e a
-- tela do calendario ja leem `actor_kind` esperando os dois lados, o
-- que quer dizer que a primeira linha de equipe vai aparecer um dia, e
-- nesse dia ela apareceria no portal do cliente como "aprovada por
-- alguem da sua equipe", que alem de vazamento e informacao errada.

-- ------------------------------------------------------------------
-- 1. A marca, como o cliente a ve
-- ------------------------------------------------------------------
--
-- Fica de fora: `competitors`, `segment`, e o que vier depois. A regra
-- de arquivamento da 0036 desce da politica para o `where` daqui, que
-- e onde ela passa a morar.

drop view if exists public.marcas_do_cliente;
create view public.marcas_do_cliente
with (security_barrier = true)
as
  select b.id, b.name, b.slug, b.color
  from public.brands b
  where public.auth_role() = 'client'
    and b.id = any(public.auth_brand_ids())
    and b.arquivada_em is null;

comment on view public.marcas_do_cliente is
  'As marcas do cliente, so as colunas dele. A tabela brands esta fechada para ele (0037).';

grant select on public.marcas_do_cliente to authenticated;

-- ------------------------------------------------------------------
-- 2. O escopo, como o cliente o ve
-- ------------------------------------------------------------------
--
-- Fica de fora: `notes`. `monthly_quota` tambem, e nao por sigilo: o
-- cliente conhece a cota que contratou. E que o portal nao mostra esse
-- numero, e coluna que ninguem usa nao precisa estar aberta.

drop view if exists public.escopo_do_cliente;
create view public.escopo_do_cliente
with (security_barrier = true)
as
  select s.id, s.brand_id, s.label, s.position
  from public.brand_scope s
  where public.auth_role() = 'client'
    and s.brand_id = any(public.auth_brand_ids())
    and s.active;

comment on view public.escopo_do_cliente is
  'As linhas do escopo pelo nome, sem a anotacao interna (0037).';

grant select on public.escopo_do_cliente to authenticated;

-- ------------------------------------------------------------------
-- 3. As decisoes, como o cliente as ve
-- ------------------------------------------------------------------
--
-- Fica de fora: toda decisao que nao e do lado do cliente, e a coluna
-- `version`, que e o maquinario de versao da pauta.
--
-- `actor_kind` continua na vista mesmo valendo sempre 'client'. Sai de
-- graca, e as telas que ja leem essa coluna nao precisam mudar de forma
-- por causa desta migracao.

drop view if exists public.decisoes_do_cliente;
create view public.decisoes_do_cliente
with (security_barrier = true)
as
  select a.id, a.brand_id, a.idea_id, a.decision, a.actor_kind,
         a.actor_id, a.comment_id, a.seconds_to_decide, a.created_at
  from public.approvals a
  where public.auth_role() = 'client'
    and a.brand_id = any(public.auth_brand_ids())
    and a.actor_kind = 'client'
    and public.idea_is_client_visible(a.idea_id);

comment on view public.decisoes_do_cliente is
  'As decisoes do proprio cliente. A da equipe nao sai daqui (0037).';

grant select on public.decisoes_do_cliente to authenticated;

-- ------------------------------------------------------------------
-- 4. E as tabelas fecham
-- ------------------------------------------------------------------
--
-- Sem politica de leitura para o cliente, a consulta dele nessas tres
-- tabelas volta vazia, venha da tela ou do console do navegador.
--
-- `approvals_client_insert` FICA. E por ela que a decisao do cliente
-- entra, e escrever nunca foi o problema: o problema era ler o que os
-- outros escreveram.

drop policy if exists brands_client_read      on public.brands;
drop policy if exists brand_scope_client_read on public.brand_scope;
drop policy if exists approvals_client_read   on public.approvals;

-- ------------------------------------------------------------------
-- Conferencia
-- ------------------------------------------------------------------
do $$
declare
  sobrou text;
  colunas text;
begin
  -- 1. Nenhuma das tres pode ter voltado a ter leitura de cliente.
  select string_agg(c.relname || '.' || p.polname, ', ') into sobrou
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where c.relname in ('brands', 'brand_scope', 'approvals')
    and p.polcmd in ('r', '*')
    and pg_get_expr(p.polqual, p.polrelid) like '%client%';
  if sobrou is not null then
    raise exception 'Ainda ha leitura de cliente nas tabelas: %', sobrou;
  end if;

  -- 2. As tres vistas existem.
  foreach colunas in array array['marcas_do_cliente', 'escopo_do_cliente', 'decisoes_do_cliente'] loop
    if to_regclass('public.' || colunas) is null then
      raise exception 'Faltou a vista %', colunas;
    end if;
  end loop;

  -- 3. E nenhuma delas carrega a coluna que esta migracao existe para
  --    esconder. Esta e a conferencia que pega o erro de amanha, quando
  --    alguem acrescentar uma coluna a vista sem pensar duas vezes.
  select string_agg(table_name || '.' || column_name, ', ') into sobrou
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('marcas_do_cliente', 'escopo_do_cliente', 'decisoes_do_cliente')
    and column_name in ('competitors', 'notes', 'version');
  if sobrou is not null then
    raise exception 'Coluna interna dentro de vista do cliente: %', sobrou;
  end if;
end $$;
