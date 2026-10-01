-- 0040_reabrir.sql
--
-- Mexer num mes que o cliente ja aprovou.
--
-- O QUE EXISTIA, E O QUE FALTAVA
--
-- A pauta aprovada pelo cliente e terminal desde a 0003, e o
-- comentario de la ja previa este dia: "Reabrir exige remover a
-- aprovacao primeiro, de proposito." O caminho controlado de
-- reabertura e o que faltava.
--
-- O gatilho `sync_plan_approval` ja fazia metade do trabalho sem
-- ninguem notar: ele dispara tambem no INSERT, entao acrescentar uma
-- pauta a um mes aprovado ja derrubava a aprovacao do mes. So que ele
-- limpava o `approved_at` e deixava o `status` em 'approved'. O mes
-- ficava marcado como aprovado sem data de aprovacao. Nunca incomodou
-- porque nunca houve como reabrir; a partir de agora apareceria na
-- tela toda vez.
--
-- A REGRA, EM UMA FRASE
--
-- Quando uma pauta muda, so ela volta para o cliente. As outras
-- mantem a aprovacao que ja tinham, e o mes deixa de estar aprovado
-- ate essa uma ser decidida. Pedir ao cliente que reavalie quinze
-- pautas porque uma data mudou seria desrespeitoso com o tempo dele, e
-- o sistema ja guarda aprovacao por pauta, nunca por mes.

-- ------------------------------------------------------------------
-- 1. O mes reaberto volta ao estado certo
-- ------------------------------------------------------------------
--
-- Para onde ele volta depende do que falta: se alguma pauta ainda esta
-- sendo escrita, o mes esta em revisao interna; se todas ja foram
-- enviadas e so falta o cliente decidir, ele esta com o cliente.
--
-- So mexe no `status` quando ele era 'approved'. Durante a geracao o
-- gatilho continua sem tocar em nada, que e o comportamento de hoje.
-- E ele passa a ouvir tambem a EXCLUSAO de pauta.
--
-- Achado por um teste, nao por leitura: um mes aprovado que recebe uma
-- pauta nova reabre, certo. Se alguem apaga essa pauta em seguida, o
-- mes continuava reaberto para sempre, porque o gatilho so escutava
-- insercao e mudanca de status. Ninguem tinha percebido porque, ate
-- esta migracao, nao havia como acrescentar pauta a um mes aprovado:
-- o defeito nasceu junto com a funcionalidade que ele atrapalha.
create or replace function public.sync_plan_approval()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  alvo uuid := coalesce(new.plan_id, old.plan_id);
  pendentes int;
  internas int;
  total int;
begin
  select
    count(*) filter (where status <> 'client_approved'),
    count(*) filter (where status in (
      'ai_generated', 'internal_review', 'internal_changes', 'internally_approved'
    )),
    count(*)
  into pendentes, internas, total
  from public.content_ideas where plan_id = alvo;

  if total > 0 and pendentes = 0 then
    update public.plans
      set status = 'approved', approved_at = coalesce(approved_at, now())
      where id = alvo and approved_at is null;
  else
    update public.plans
      set approved_at = null,
          status = case
            when status = 'approved' and internas > 0 then 'internal_review'::plan_status
            when status = 'approved' then 'sent_to_client'::plan_status
            else status
          end
      where id = alvo and (approved_at is not null or status = 'approved');
  end if;

  -- Em DELETE o `new` nao existe; quem manda e o `old`.
  return coalesce(new, old);
end $$;

drop trigger if exists sync_plan_approval_trg on public.content_ideas;
create trigger sync_plan_approval_trg
  after insert or delete or update of status on public.content_ideas
  for each row execute function public.sync_plan_approval();

-- ------------------------------------------------------------------
-- 2. A porta de reabertura
-- ------------------------------------------------------------------
--
-- `idea_transition_allowed` continua pura e imutavel: ela responde
-- "esta transicao tem forma legal", e nada mais. A pergunta "quem pode
-- fazer isso agora" e outra, e fica no gatilho, que e onde o contexto
-- existe.
--
-- O sinal e uma marca de transacao, posta pela funcao de reabrir. Nao
-- e uma parede, e um aviso: quem escrever um UPDATE direto trocando
-- 'client_approved' por 'sent_to_client' vai bater na excecao e ler o
-- nome da funcao que deveria ter usado. A parede de verdade sao as
-- conferencias de quem chama, dentro da funcao, mais a RLS da tabela.
create or replace function public.content_ideas_guard()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and not public.idea_transition_allowed(old.status, new.status)
     and not (
       old.status = 'client_approved'
       and new.status = 'sent_to_client'
       and coalesce(current_setting('app.reabrindo', true), '') = '1'
     ) then
    raise exception
      'Transicao de status invalida: % -> %. Para reabrir pauta aprovada, use reabrir_pauta().',
      old.status, new.status
      using errcode = 'check_violation';
  end if;

  if public.idea_content_changed(old, new)
     and new.current_version <= old.current_version then
    raise exception
      'Mudanca de conteudo exige nova versao: incremente current_version e grave em content_versions'
      using errcode = 'check_violation';
  end if;

  if new.status = 'sent_to_client'
     and old.status is distinct from new.status
     and not public.tem_legenda(new.id) then
    raise exception
      'Esta pauta ainda nao tem legenda escrita. O cliente recebe a peca, nao so a ideia.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- ------------------------------------------------------------------
-- 3. Quem pode mexer num mes aprovado
-- ------------------------------------------------------------------
--
-- Duas regras, e a de baixo ja existia sem eu perceber.
--
-- PRIMEIRA, PARA OS DOIS CASOS: reabrir e, literalmente, pôr a peca de
-- volta na frente do cliente. O sistema ja tem uma permissao para
-- isso desde a 0013, `pode_enviar_ao_cliente`, e o gatilho de la
-- recusou a primeira versao desta funcao. Estava certo em recusar:
-- quem nao pode mandar uma pauta ao cliente tambem nao pode obrigar o
-- cliente a decidir de novo. A regra nova obedece a antiga em vez de
-- abrir uma excecao ao lado dela.
--
-- SEGUNDA, SO PARA CONTEUDO: alem disso, ser quem criou aquele mes ou
-- a administracao. Mexer no texto de uma peca ja aprovada e desfazer
-- um acordo, e quem fez o acordo tem de estar no circuito. Remarcar
-- uma data nao desfaz acordo nenhum sobre o que vai ser publicado, so
-- sobre quando, e por isso nao pede esse segundo degrau.
create or replace function public.dono_do_mes(p_plan uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is null
      or public.is_admin()
      or exists (
        select 1 from public.plans p
        where p.id = p_plan and p.created_by = auth.uid()
      )
$$;

comment on function public.dono_do_mes is
  'Quem criou este planejamento, ou a administracao. Script direto passa sempre (0040).';

revoke execute on function public.dono_do_mes(uuid) from public;
grant execute on function public.dono_do_mes(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 4. Reabrir
-- ------------------------------------------------------------------
--
-- `p_motivo` vira comentario compartilhado, e nao um registro interno,
-- de proposito: o cliente precisa saber por que uma peca que ele ja
-- aprovou voltou a pedir resposta. Peca que reaparece sem explicacao
-- parece erro do sistema, e a proxima aprovacao dele vem mais lenta.
create or replace function public.reabrir_pauta(
  p_idea uuid,
  p_motivo text,
  p_tipo text default 'conteudo'
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pauta public.content_ideas;
begin
  select * into pauta from public.content_ideas where id = p_idea;
  if pauta.id is null then
    raise exception 'Pauta nao encontrada.' using errcode = 'no_data_found';
  end if;

  if auth.uid() is not null and not public.pode_enviar_ao_cliente(pauta.brand_id) then
    raise exception
      'So quem pode mandar pauta ao cliente pode devolver uma ja aprovada a ele.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_tipo = 'conteudo' and not public.dono_do_mes(pauta.plan_id) then
    raise exception
      'Para alterar uma peca ja aprovada, e preciso ser quem criou este mes ou a administracao.'
      using errcode = 'insufficient_privilege';
  end if;

  if pauta.status <> 'client_approved' then
    raise exception 'Esta pauta nao esta aprovada pelo cliente; nao ha o que reabrir.'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Diga por que esta reabrindo. O cliente vai ler.'
      using errcode = 'check_violation';
  end if;

  insert into public.comments (brand_id, idea_id, author_id, author_kind, body, visibility)
  values (pauta.brand_id, pauta.id, public.quem_sou(), 'internal', btrim(p_motivo), 'shared');

  perform set_config('app.reabrindo', '1', true);
  update public.content_ideas set status = 'sent_to_client' where id = p_idea;
  perform set_config('app.reabrindo', '', true);
end $$;

comment on function public.reabrir_pauta is
  'Devolve ao cliente uma pauta que ele ja aprovou, com o motivo visivel para ele (0040).';

revoke all on function public.reabrir_pauta(uuid, text, text) from public;
grant execute on function public.reabrir_pauta(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------
-- Conferencia
-- ------------------------------------------------------------------
do $$
begin
  if public.idea_transition_allowed('client_approved', 'sent_to_client') then
    raise exception 'A transicao de reabertura nao pode ser legal por si so';
  end if;
  if not exists (select 1 from pg_proc where proname = 'reabrir_pauta') then
    raise exception 'Faltou a funcao reabrir_pauta';
  end if;
  if not exists (select 1 from pg_proc where proname = 'dono_do_mes') then
    raise exception 'Faltou a funcao dono_do_mes';
  end if;
end $$;
