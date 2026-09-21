-- =============================================================
-- Alta Social Planner · 0020 · Tempo de resposta, publicação a publicação
--
-- O André quer o tempo que o cliente levou para responder a cada
-- publicação, visível para o cliente e para a equipe, e a média de
-- cada mês na página de Precisão.
--
-- O número já era gravado (`approvals.seconds_to_decide`, desde a
-- 0010), mas contava a partir do momento em que o MÊS foi enviado. Na
-- primeira rodada isso é o mesmo que "quando a publicação chegou ao
-- cliente". Na segunda, não: se o cliente pede alteração no dia 3, a
-- equipe ajusta e reenvia no dia 10, e ele aprova no dia 10 à tarde,
-- o sistema registrava "respondeu em 7 dias". Ele respondeu em horas.
--
-- A correção:
--   1. cada publicação passa a guardar QUANDO foi enviada ao cliente
--      pela última vez (`enviada_ao_cliente_em`), carimbada pelo banco
--      toda vez que ela entra no estado "com o cliente";
--   2. o tempo da decisão passa a contar a partir desse carimbo.
--
-- As decisões já registradas não mudam — aprovação é append-only, e
-- está certo que seja. Elas foram medidas pela régua antiga, que
-- acerta em toda publicação que o cliente respondeu na primeira vez.
-- =============================================================

alter table public.content_ideas
  add column if not exists enviada_ao_cliente_em timestamptz;

comment on column public.content_ideas.enviada_ao_cliente_em is
  'Última vez que a publicação foi enviada ao cliente. O tempo de resposta conta daqui.';

-- As publicações que já estão ou já passaram pelo cliente recebem, como
-- melhor aproximação, a data em que o mês foi enviado.
update public.content_ideas ci
   set enviada_ao_cliente_em = p.client_released_at
  from public.plans p
 where p.id = ci.plan_id
   and ci.enviada_ao_cliente_em is null
   and p.client_released_at is not null
   and ci.status in ('sent_to_client', 'client_changes_requested', 'client_approved');

-- 1. O carimbo. Qualquer caminho que leve a publicação ao cliente —
--    liberar_plano hoje, qualquer outro amanhã — passa por aqui.
create or replace function public.ideia_carimbar_envio()
returns trigger language plpgsql as $$
begin
  if new.status = 'sent_to_client' and old.status is distinct from 'sent_to_client' then
    new.enviada_ao_cliente_em := now();
  end if;
  return new;
end $$;

drop trigger if exists content_ideas_carimbar_envio_trg on public.content_ideas;
create trigger content_ideas_carimbar_envio_trg
  before update on public.content_ideas
  for each row execute function public.ideia_carimbar_envio();

-- 2. O tempo da decisão, medido a partir do último envio.
--
-- Gatilho em vez de reescrever `decidir_pauta`: a função da 0010 tem
-- trinta linhas que funcionam, e copiá-la inteira para mudar uma
-- conta seria o jeito mais fácil de quebrar outra coisa.
create or replace function public.aprovacao_medir_resposta()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  enviada timestamptz;
begin
  if new.actor_kind <> 'client' then
    return new;
  end if;
  select enviada_ao_cliente_em into enviada from public.content_ideas where id = new.idea_id;
  if enviada is not null then
    new.seconds_to_decide := greatest(0, extract(epoch from (now() - enviada))::int);
  end if;
  return new;
end $$;

drop trigger if exists approvals_medir_resposta_trg on public.approvals;
create trigger approvals_medir_resposta_trg
  before insert on public.approvals
  for each row execute function public.aprovacao_medir_resposta();
