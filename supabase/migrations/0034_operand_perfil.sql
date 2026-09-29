-- 0034_operand_perfil.sql
--
-- O retrato do que a agencia ja produziu para cada marca.
--
-- Nao e tela, e insumo. Este texto entra no raciocinio da IA quando
-- ela monta o planejamento e cria o conteudo. Ate agora ela planejava
-- a partir do que foi ESCRITO sobre a marca, que e uma descricao de
-- intencao. Aqui entra o que ACONTECEU.
--
-- POR QUE UMA TABELA E NAO UMA CONTA NA HORA
--
-- Sao centenas de jobs por marca, e o retrato muda uma vez por dia, no
-- maximo. Recalcular a cada geracao de planejamento seria pagar o
-- mesmo preco varias vezes por dia pelo mesmo resultado. Alem disso,
-- guardado da para CONFERIR: alguem pode ler o texto e dizer "isso nao
-- e a nossa conta" antes que ele influencie qualquer sugestao.
--
-- O `resumo` e texto em portugues de proposito. E o que vai para o
-- prompt, e e o que uma pessoa consegue auditar. O `perfil` em jsonb
-- guarda os numeros por tras, para quando alguem quiser conferir de
-- onde saiu uma frase.
--
-- QUEM ESCREVE: so o script, como todo o resto da copia do Operand.
-- O site le. A equipe le. Ninguem edita pela tela, porque um retrato
-- editado a mao deixa de ser um retrato.

create table if not exists public.operand_perfil (
  brand_id   uuid primary key references public.brands(id) on delete cascade,
  gerado_em  timestamptz not null default now(),
  de         date,
  ate        date,
  jobs       integer not null default 0,
  minutos    integer not null default 0,
  /** Os numeros por tras do texto, para conferencia. */
  perfil     jsonb not null default '{}'::jsonb,
  /** O texto em portugues que vai para o prompt. */
  resumo     text
);

comment on table public.operand_perfil is
  'O que a agencia produziu para a marca, resumido. Alimenta o prompt, nao a tela.';

alter table public.operand_perfil enable row level security;
alter table public.operand_perfil force row level security;

drop policy if exists operand_perfil_equipe_le on public.operand_perfil;
create policy operand_perfil_equipe_le on public.operand_perfil for select to authenticated
  using (public.is_staff());

drop policy if exists operand_perfil_script on public.operand_perfil;
create policy operand_perfil_script on public.operand_perfil for all to authenticated
  using (auth.uid() is null) with check (auth.uid() is null);

grant select on public.operand_perfil to authenticated;

-- ------------------------------------------------------------------
-- Conferencia: o cliente nao alcanca isso, e a tela nao escreve.
-- ------------------------------------------------------------------
do $$
declare
  ruim text;
begin
  if not exists (
    select 1 from pg_class where relname = 'operand_perfil' and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'operand_perfil ficou sem RLS forcada';
  end if;

  select string_agg(polname, ', ') into ruim
  from pg_policy
  where polrelid = 'public.operand_perfil'::regclass
    and polcmd in ('*', 'w', 'a', 'd')
    and coalesce(pg_get_expr(polqual, polrelid), '') not like '%auth.uid() IS NULL%';
  if ruim is not null then
    raise exception 'Politica de escrita inesperada em operand_perfil: %', ruim;
  end if;
end $$;
