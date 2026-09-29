-- 0031_operand_chave.sql
--
-- A primeira listagem real trouxe um sinal de alerta: os 28 jobs da
-- Queensberry vieram com `itemId` de 1 a 28. Numero pequeno, sequencia
-- perfeita, exatamente a quantidade de jobs do cliente. Isso tem cara
-- de contagem DENTRO do cliente, nao de identificador do Operand
-- inteiro. Uma agencia com 522 clientes nao numera job de 1 a 28.
--
-- Se for isso mesmo, o job 1 da Queensberry e o job 1 da Habiarte sao
-- o MESMO numero, e com `job_id` sozinho como chave primaria o segundo
-- sobrescreveria o primeiro. A marca erraria de dono e ninguem
-- perceberia: a tela mostraria trabalho de um cliente no calendario de
-- outro.
--
-- Nao da para saber daqui qual campo e o identificador de verdade. Da
-- para tornar a pergunta irrelevante: a chave passa a ser a marca MAIS
-- o numero do job. Assim numero repetido entre marcas deixa de ser um
-- problema, seja qual for a resposta.
--
-- A tabela ainda esta vazia, entao isso nao custa nada agora. Custaria
-- caro daqui a um mes.

alter table public.operand_jobs drop constraint if exists operand_jobs_pkey;
alter table public.operand_jobs add primary key (brand_id, job_id);

-- O `id` que veio na linha da resposta, guardado ao lado. Se um dia
-- ficar provado que ELE e o identificador bom, a troca e uma linha.
alter table public.operand_jobs add column if not exists linha_id integer;

comment on column public.operand_jobs.job_id is
  'O itemId da resposta do Operand. Unico dentro da marca, nao necessariamente fora dela.';
comment on column public.operand_jobs.linha_id is
  'O id da linha na resposta de /beta/jobs, guardado para conferencia.';

-- ------------------------------------------------------------------
-- Conferencia: a chave e composta mesmo, e o numero repetido entre
-- marcas passa a ser aceito.
-- ------------------------------------------------------------------
do $$
declare
  colunas text;
begin
  select string_agg(a.attname, ',' order by k.ord) into colunas
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  where c.conrelid = 'public.operand_jobs'::regclass and c.contype = 'p';

  if colunas is distinct from 'brand_id,job_id' then
    raise exception 'A chave de operand_jobs ficou como (%), e deveria ser (brand_id,job_id)', colunas;
  end if;
end $$;
