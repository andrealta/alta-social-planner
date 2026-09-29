-- 0032_operand_numero_certo.sql
--
-- Qual dos dois numeros da resposta e o job: resolvido, e resolvido
-- MEDINDO, nao lendo documentacao.
--
-- Cada job declara quantas tarefas tem (openedTasks, closedTasks,
-- canceledTasks) e existe uma rota que devolve as tarefas de um job.
-- O numero certo e o que faz as duas contas baterem. Em cinco jobs da
-- Queensberry:
--
--   esperado   por `id`   por `itemId`
--          1         1            6
--          7         7            4
--          7         6            3
--          7         7            6
--          7         7            6
--
-- O `id` acertou quatro de cinco, o `itemId` nenhuma. A vez que errou
-- foi por uma tarefa a menos, que e o tipo de diferenca que contador
-- desatualizado explica; errar por tres nao e.
--
-- Eu tinha concluido o contrario na rodada anterior, por causa do
-- `taskType: "job"` na resposta, que parecia dizer que o `itemId`
-- apontava para o job. Nao apontava. A linha JA E o job, e o `itemId`
-- e a numeracao que a equipe ve dentro do cliente: vai de 1 ate a
-- quantidade de jobs daquela conta, e por isso se repete entre
-- clientes.
--
-- Entao a coluna troca de dono: o que estava guardado como "id da
-- linha" era o numero do job, e o que estava como job era o numero no
-- cliente. A chave composta da 0031 continua valendo, e continua sendo
-- o que impediria estrago se eu tivesse errado de novo.

alter table public.operand_jobs rename column linha_id to numero_no_cliente;

comment on column public.operand_jobs.job_id is
  'O job no Operand (campo `id` da resposta). Identifica o trabalho em toda a agencia.';
comment on column public.operand_jobs.numero_no_cliente is
  'O `itemId`: como a equipe se refere ao job dentro daquele cliente. Repete entre clientes.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'operand_jobs'
      and column_name = 'numero_no_cliente'
  ) then
    raise exception 'A coluna numero_no_cliente nao existe em operand_jobs';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'operand_jobs'
      and column_name = 'linha_id'
  ) then
    raise exception 'A coluna linha_id ficou para tras em operand_jobs';
  end if;
end $$;
