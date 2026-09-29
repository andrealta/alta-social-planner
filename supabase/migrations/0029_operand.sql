-- =============================================================
-- 0029: o Operand visto de dentro do planner (só leitura)
-- =============================================================
--
-- O planner sabe o que foi PLANEJADO e o que o cliente APROVOU. O
-- Operand sabe o que está sendo PRODUZIDO. Hoje são duas verdades em
-- dois sistemas, e quem quer saber se a peça de quinta já está com o
-- designer precisa abrir o outro.
--
-- Esta migração traz a segunda verdade para dentro da primeira, e só
-- isso: o planner LÊ o Operand e não escreve nada lá. Criar job
-- automaticamente quando o cliente aprova é a metade seguinte, e ela
-- só faz sentido depois que esta estiver rodando sem susto por umas
-- semanas. Escrever no sistema que a agência usa todo dia é o tipo de
-- coisa que se faz com o caminho de volta já conhecido.
--
-- Duas decisões que valem explicar:
--
-- A cópia é uma CÓPIA, e assume isso. A documentação do Operand não
-- traz webhook: não há como ele avisar que algo mudou. Então uma
-- rotina pergunta de tempos em tempos e guarda o que veio, com a hora
-- em que veio. A tela mostra "visto às 14h20", e não finge que é agora.
--
-- O corpo inteiro da resposta fica guardado em `bruto`. A API está em
-- /beta e pode mudar; quando mudar, eu quero poder olhar o que ela
-- devolvia antes sem ter que pedir de novo. Custa alguns kilobytes por
-- job e paga na primeira vez que algo não bater.

-- -------------------------------------------------------------
-- 1. A ligação entre marca e cliente do Operand
-- -------------------------------------------------------------
--
-- Sem isto nada mais funciona: é o que diz que a Queensberry daqui é
-- o cliente 486 de lá. Fica em `brands` porque é um dado da marca, e
-- é preenchido na tela da base, com a permissão de base (0028).

alter table public.brands
  add column if not exists operand_client_id integer;

comment on column public.brands.operand_client_id is
  'O id desta marca como CLIENTE no Operand. Nulo: marca não ligada (0029).';

create unique index if not exists brands_operand_client_idx
  on public.brands (operand_client_id)
  where operand_client_id is not null;

-- -------------------------------------------------------------
-- 2. Os jobs, como o Operand os devolveu
-- -------------------------------------------------------------
--
-- A chave primária é o id do Operand, e não um id nosso: a linha é um
-- espelho, e duas sincronizações do mesmo job têm que colidir em vez
-- de virar duas linhas.

create table if not exists public.operand_jobs (
  job_id        integer primary key,
  brand_id      uuid not null references public.brands(id) on delete cascade,
  titulo        text,
  descricao     text,
  situacao      text,
  status_id     integer,
  status_nome   text,
  responsavel   text,
  projeto_id    integer,
  projeto_nome  text,
  inicio        date,
  prazo         date,
  criado_em     timestamptz,
  /** A resposta inteira, para quando algum campo mudar de nome. */
  bruto         jsonb not null default '{}'::jsonb,
  /** Quando esta linha foi vista pela última vez na origem. */
  visto_em      timestamptz not null default now()
);

create index if not exists operand_jobs_marca_idx on public.operand_jobs (brand_id, prazo);
create index if not exists operand_jobs_situacao_idx on public.operand_jobs (brand_id, situacao);

comment on table public.operand_jobs is
  'Cópia local dos jobs do Operand. Só leitura: nada daqui volta para lá (0029).';

-- -------------------------------------------------------------
-- 3. O registro de cada sincronização
-- -------------------------------------------------------------
--
-- Existe para responder "por que a tela está mostrando dado de ontem".
-- Sem isto, uma rotina que parou de funcionar fica invisível: a tela
-- continua mostrando o que tinha, e ninguém percebe que congelou.

create table if not exists public.operand_sync (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references public.brands(id) on delete cascade,
  comecou_em  timestamptz not null default now(),
  terminou_em timestamptz,
  jobs        integer not null default 0,
  ok          boolean not null default false,
  erro        text
);

create index if not exists operand_sync_quando_idx on public.operand_sync (comecou_em desc);

-- -------------------------------------------------------------
-- 4. Quem lê e quem escreve
-- -------------------------------------------------------------
--
-- Lê: a equipe inteira, como tudo mais desde a 0028. O cliente não,
-- porque isto é o bastidor da produção da agência.
--
-- Escreve: ninguém pela tela. A rotina de sincronização roda por fora,
-- com conexão direta ao banco, e é por isso que a política de escrita
-- é `auth.uid() is null` em vez de uma permissão. Um dia isso pode
-- virar uma rota do sistema; enquanto for script, é assim que se diz
-- "não é gente que escreve aqui".

alter table public.operand_jobs enable row level security;
alter table public.operand_jobs force row level security;
alter table public.operand_sync enable row level security;
alter table public.operand_sync force row level security;

drop policy if exists operand_jobs_equipe_le on public.operand_jobs;
create policy operand_jobs_equipe_le on public.operand_jobs for select to authenticated
  using (public.is_staff());

drop policy if exists operand_jobs_script on public.operand_jobs;
create policy operand_jobs_script on public.operand_jobs for all to authenticated
  using (auth.uid() is null) with check (auth.uid() is null);

drop policy if exists operand_sync_equipe_le on public.operand_sync;
create policy operand_sync_equipe_le on public.operand_sync for select to authenticated
  using (public.is_staff());

drop policy if exists operand_sync_script on public.operand_sync;
create policy operand_sync_script on public.operand_sync for all to authenticated
  using (auth.uid() is null) with check (auth.uid() is null);

grant select on public.operand_jobs to authenticated;
grant select on public.operand_sync to authenticated;

-- -------------------------------------------------------------
-- 5. A última sincronização de cada marca, em uma pergunta
-- -------------------------------------------------------------

create or replace function public.operand_ultima_sync(b uuid)
returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select max(s.terminou_em)
  from public.operand_sync s
  where s.brand_id = b and s.ok
$$;

revoke execute on function public.operand_ultima_sync(uuid) from public;
grant execute on function public.operand_ultima_sync(uuid) to authenticated;

-- -------------------------------------------------------------
-- 6. Conferência
-- -------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'brands' and column_name = 'operand_client_id'
  ) then
    raise exception 'A ligação com o Operand não foi criada em brands.';
  end if;

  -- O cliente não pode alcançar o bastidor da produção.
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname in ('operand_jobs', 'operand_sync')
      and pg_get_expr(p.polqual, p.polrelid) like '%auth_role() = ''client''%'
  ) then
    raise exception 'Política de cliente em tabela do Operand.';
  end if;

  raise notice 'Operand: espelho de leitura pronto, sem caminho de volta.';
end $$;
