-- =============================================================
-- 0026: investimento de mídia por publicação
-- =============================================================
--
-- O planejamento passa a responder também a pergunta do cliente que
-- paga tráfego: quanto vai para cada peça, e com que objetivo de
-- campanha na Meta.
--
--   * o mês ganha um valor total de investimento (opcional);
--   * cada pauta ganha o objetivo de campanha sugerido, o valor
--     sugerido e uma justificativa de uma frase;
--   * a soma do que está distribuído nunca passa do total do mês.
--
-- A IA propõe na geração, a equipe revisa e altera, e o cliente vê o
-- que sobrou dessa conversa. Os campos ficam em `content_ideas` e não
-- em uma tabela nova porque pertencem à pauta: nascem com ela, somem
-- com ela, e o cliente já lê essa tabela.
--
-- Importante: estes campos NÃO entram em `idea_content_changed`. Mudar
-- o valor de mídia não é mudar o conteúdo da pauta, então não cria
-- versão nova nem estraga a medida de Precisão.

alter table public.plans
  add column if not exists investimento_total numeric(12, 2)
    check (investimento_total is null or investimento_total >= 0);

comment on column public.plans.investimento_total is
  'Quanto o cliente vai investir em mídia neste mês, no total. Nulo: não informado.';

-- Os seis objetivos de campanha da Meta, mais a opção de não impulsionar.
create table if not exists public.objetivos_meta (
  nome   text primary key,
  ordem  integer not null,
  ajuda  text not null
);

insert into public.objetivos_meta (nome, ordem, ajuda) values
  ('Sem impulsionamento', 0, 'A peça fica só no orgânico, sem verba.'),
  ('Reconhecimento',      1, 'Alcançar o máximo de pessoas do público e ser lembrado.'),
  ('Tráfego',             2, 'Levar gente para o site, a loja ou o WhatsApp.'),
  ('Engajamento',         3, 'Buscar interação: comentário, salvamento, mensagem, visualização de vídeo.'),
  ('Cadastros',           4, 'Coletar contatos por formulário dentro da própria Meta.'),
  ('Promoção do aplicativo', 5, 'Instalações e eventos dentro de um aplicativo.'),
  ('Vendas',              6, 'Conversão: compra no site ou no catálogo.')
on conflict (nome) do update set ordem = excluded.ordem, ajuda = excluded.ajuda;

alter table public.objetivos_meta enable row level security;
alter table public.objetivos_meta force row level security;
drop policy if exists objetivos_todos_leem on public.objetivos_meta;
create policy objetivos_todos_leem on public.objetivos_meta for select to authenticated using (true);
grant select on public.objetivos_meta to authenticated;

alter table public.content_ideas
  add column if not exists meta_objetivo text references public.objetivos_meta(nome) on update cascade,
  add column if not exists meta_investimento numeric(10, 2)
    check (meta_investimento is null or meta_investimento >= 0),
  add column if not exists meta_justificativa text;

comment on column public.content_ideas.meta_objetivo is
  'Objetivo de campanha na Meta sugerido para esta publicação (0026).';
comment on column public.content_ideas.meta_investimento is
  'Quanto desta publicação vai em mídia, em reais.';
comment on column public.content_ideas.meta_justificativa is
  'Uma frase dizendo por que este objetivo e este valor.';

-- -------------------------------------------------------------
-- A soma não passa do total do mês
-- -------------------------------------------------------------

create or replace function public.investimento_do_plano(p uuid, ignorar uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(ci.meta_investimento), 0)
  from public.content_ideas ci
  where ci.plan_id = p
    and (ignorar is null or ci.id <> ignorar)
$$;

create or replace function public.investimento_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric;
  usado numeric;
begin
  if new.meta_investimento is null or new.meta_investimento = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.meta_investimento is not distinct from old.meta_investimento
     and new.plan_id = old.plan_id then
    return new;
  end if;

  select p.investimento_total into total from public.plans p where p.id = new.plan_id;
  if total is null then
    return new;
  end if;

  usado := public.investimento_do_plano(new.plan_id, new.id) + new.meta_investimento;
  if usado > total + 0.005 then
    raise exception
      'A soma do investimento das publicações (R$ %) passa do total do mês (R$ %).',
      to_char(usado, 'FM999999990.00'), to_char(total, 'FM999999990.00')
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

drop trigger if exists investimento_guard_trg on public.content_ideas;
create trigger investimento_guard_trg
  before insert or update on public.content_ideas
  for each row execute function public.investimento_guard();

-- -------------------------------------------------------------
-- A mesma conta, mas depois do comando inteiro
-- -------------------------------------------------------------
--
-- O gatilho de linha acima não vê as outras linhas do MESMO comando:
-- numa inserção de quinze pautas de uma vez (é assim que a geração
-- grava o mês), cada linha se acha sozinha e a soma passa do total sem
-- ninguém reclamar. Por isso existe este segundo, por comando: ele
-- roda DEPOIS, quando as quinze já estão lá, e refaz a conta.
--
-- Os dois se completam. O de linha dá a mensagem específica na edição
-- de uma pauta só, que é o caso do dia a dia; este fecha a porta que o
-- outro não alcança.

create or replace function public.investimento_guard_stmt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct n.plan_id as plano from novas n where n.plan_id is not null
  loop
    if exists (
      select 1
      from public.plans p
      where p.id = r.plano
        and p.investimento_total is not null
        and public.investimento_do_plano(r.plano) > p.investimento_total + 0.005
    ) then
      raise exception
        'A soma do investimento das publicações (R$ %) passa do total do mês (R$ %).',
        to_char(public.investimento_do_plano(r.plano), 'FM999999990.00'),
        to_char((select p.investimento_total from public.plans p where p.id = r.plano),
                'FM999999990.00')
        using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end
$$;

drop trigger if exists investimento_guard_ins_stmt on public.content_ideas;
create trigger investimento_guard_ins_stmt
  after insert on public.content_ideas
  referencing new table as novas
  for each statement execute function public.investimento_guard_stmt();

drop trigger if exists investimento_guard_upd_stmt on public.content_ideas;
create trigger investimento_guard_upd_stmt
  after update on public.content_ideas
  referencing new table as novas
  for each statement execute function public.investimento_guard_stmt();

-- -------------------------------------------------------------
-- E se alguém baixar o total do mês depois?
-- -------------------------------------------------------------
--
-- Sem isto, diminuir `investimento_total` deixaria o mês com uma soma
-- maior que o teto e nenhum gatilho perceberia, porque todos olham
-- para `content_ideas`. A equipe tira a verba das publicações primeiro
-- e baixa o total depois.

create or replace function public.plano_verba_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  usado numeric;
begin
  if new.investimento_total is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.investimento_total is not distinct from old.investimento_total then
    return new;
  end if;

  usado := public.investimento_do_plano(new.id);
  if usado > new.investimento_total + 0.005 then
    raise exception
      'As publicações deste mês já somam R$ %, mais que o novo total de R$ %. Tire a verba das publicações antes de baixar o total.',
      to_char(usado, 'FM999999990.00'), to_char(new.investimento_total, 'FM999999990.00')
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

drop trigger if exists plano_verba_guard_trg on public.plans;
create trigger plano_verba_guard_trg
  before update on public.plans
  for each row execute function public.plano_verba_guard();
