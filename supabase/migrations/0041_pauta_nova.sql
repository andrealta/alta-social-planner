-- 0041_pauta_nova.sql
--
-- Acrescentar uma pauta a um mes que ja existe, inclusive a um mes que
-- o cliente ja aprovou.
--
-- A 0040 abriu a porta sem querer: o `sync_plan_approval` dispara no
-- INSERT, entao uma pauta nova num mes aprovado ja derrubava a
-- aprovacao do mes e o colocava de volta em revisao interna. O que
-- faltava era a tranca: hoje QUALQUER pessoa da equipe com permissao
-- de planejamento pode inserir uma pauta em qualquer mes, aprovado ou
-- nao, e o cliente so descobriria abrindo o portal.
--
-- A regra pedida: um mes aprovado so recebe pauta nova pelas maos de
-- quem criou aquele mes ou da administracao, com motivo escrito, e o
-- cliente volta a decidir.

-- ------------------------------------------------------------------
-- 1. Duas etapas que a contabilidade nao conhecia
-- ------------------------------------------------------------------
--
-- `pauta_nova` e a etapa desta migracao. `content_refine` e um defeito
-- antigo que apareceu enquanto eu lia o enum: a rota /api/conteudo
-- grava `agent: 'content_refine'` quando a equipe pede alteracao de
-- legenda a IA, e esse valor NUNCA existiu no tipo. O insert falhava,
-- o codigo ignora o erro (`const { data: corrida }`, sem olhar o
-- error), e a chamada seguia normalmente. Resultado: todo refino de
-- conteudo rodou sem registro, e a pagina de custo vinha somando
-- menos do que a agencia gastou. O `lib/medidas.ts` ja tinha ate o
-- rotulo em portugues para essa etapa, esperando linhas que nunca
-- chegaram.
--
-- Valor novo em enum nao pode ser USADO na mesma transacao em que foi
-- criado. Por isso nada abaixo neste arquivo escreve 'pauta_nova' nem
-- 'content_refine' numa coluna ai_agent.
alter type public.ai_agent add value if not exists 'content_refine';
alter type public.ai_agent add value if not exists 'pauta_nova';

-- ------------------------------------------------------------------
-- 2. De onde a pauta veio
-- ------------------------------------------------------------------
--
-- A medida de Precisao responde "de cada cem pautas que a IA escreveu,
-- quantas passaram sem ninguem reescrever". Pauta escrita a mao entra
-- na versao 1 e sem versao arquivada, exatamente como uma pauta que a
-- IA acertou de primeira — e contaria como acerto da IA. Numero errado
-- em tela de metrica nao parece errado: ninguem desconfia, so se decide
-- pior.
--
-- O valor padrao e 'ia' porque, ate hoje, toda pauta veio da geracao do
-- mes. Pauta que a equipe acrescenta depois e 'equipe', mesmo quando o
-- rascunho saiu do botao de IA do formulario: a medida pergunta pela
-- geracao do mes inteiro, com briefing, base e concorrencia, e nao por
-- um rascunho avulso de uma linha.
alter table public.content_ideas
  add column if not exists origem text not null default 'ia';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_ideas_origem_check'
  ) then
    alter table public.content_ideas
      add constraint content_ideas_origem_check check (origem in ('ia', 'equipe'));
  end if;
end $$;

comment on column public.content_ideas.origem is
  'De onde a pauta veio: ''ia'' (geracao do mes) ou ''equipe'' (acrescentada depois). So ''ia'' conta na medida de Precisao (0041).';

-- ------------------------------------------------------------------
-- 3. A tranca
-- ------------------------------------------------------------------
--
-- Mes aprovado nao recebe pauta por insert direto. O sinal e uma marca
-- de transacao, como na 0040: nao e a parede, e o aviso que manda a
-- pessoa para a porta certa. A parede sao as conferencias dentro da
-- funcao.
--
-- Conexao direta ao banco passa, como em todo o resto do sistema: quem
-- esta com as maos no banco ja passou por todas as paredes, e uma
-- restauracao de backup nao pode esbarrar nisto.
create or replace function public.pauta_em_mes_aprovado_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('app.pauta_nova', true), '') = '1' then
    return new;
  end if;

  if exists (
    select 1 from public.plans p
    where p.id = new.plan_id and (p.status = 'approved' or p.approved_at is not null)
  ) then
    raise exception
      'Este mes ja foi aprovado pelo cliente. Para acrescentar uma pauta, use adicionar_pauta().'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists pauta_em_mes_aprovado_trg on public.content_ideas;
create trigger pauta_em_mes_aprovado_trg
  before insert on public.content_ideas
  for each row execute function public.pauta_em_mes_aprovado_guard();

-- ------------------------------------------------------------------
-- 4. A porta
-- ------------------------------------------------------------------
--
-- Esta funcao roda com os poderes do dono, entao a RLS da tabela nao
-- a alcanca. Toda conferencia de permissao e feita aqui dentro, na
-- mao, porque a politica que fecharia a porta nao vale para quem entra
-- pela janela. E o mesmo erro que ja apareceu duas vezes neste
-- projeto, na 0037 e na 0038.
--
-- Dois degraus, conforme o mes:
--
-- MES EM ANDAMENTO: equipe, com acesso de edicao na marca e permissao
-- de conteudo. E trabalho normal.
--
-- MES APROVADO: alem disso, poder mandar pauta ao cliente
-- (`pode_enviar_ao_cliente`, a mesma permissao da 0040 — acrescentar
-- pauta obriga o cliente a decidir de novo, igual a reabrir) e ser
-- quem criou o mes ou a administracao (`dono_do_mes`), e motivo
-- escrito, que vai para a conversa que o cliente le.
create or replace function public.adicionar_pauta(
  p_plan           uuid,
  p_title          text,
  p_concept        text default null,
  p_description    text default null,
  p_editorial_line text default null,
  p_cta            text default null,
  p_theme          text default null,
  p_objective      text default null,
  p_rationale      text default null,
  p_scope          uuid default null,
  p_data           date default null,
  p_plataforma     text default 'instagram',
  p_formato        text default 'Feed',
  p_motivo         text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plano public.plans;
  aprovado boolean;
  nova uuid;
  prox int;
  quando date;
begin
  select * into plano from public.plans where id = p_plan;
  if plano.id is null then
    raise exception 'Planejamento nao encontrado.' using errcode = 'no_data_found';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'A pauta precisa de um titulo.' using errcode = 'check_violation';
  end if;

  if p_plataforma is not null and p_plataforma not in (
    'instagram', 'linkedin', 'tiktok', 'youtube', 'facebook', 'pinterest'
  ) then
    raise exception 'Plataforma desconhecida: %.', p_plataforma using errcode = 'check_violation';
  end if;

  -- Quem esta chamando. Sem isto a funcao seria uma porta aberta.
  if auth.uid() is not null then
    if not public.is_staff() then
      raise exception 'So a equipe da Alta acrescenta pauta ao planejamento.'
        using errcode = 'insufficient_privilege';
    end if;
    if not public.pode_editar_marca(plano.brand_id) then
      raise exception 'Voce tem acesso de leitura nesta marca; acrescentar pauta e de quem edita.'
        using errcode = 'insufficient_privilege';
    end if;
    if not public.pode('conteudo') then
      raise exception 'Voce nao tem permissao para mexer em pautas.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  aprovado := plano.status = 'approved' or plano.approved_at is not null;

  if aprovado and auth.uid() is not null then
    if not public.pode_enviar_ao_cliente(plano.brand_id) then
      raise exception
        'So quem pode mandar pauta ao cliente pode acrescentar uma a um mes que ele ja aprovou.'
        using errcode = 'insufficient_privilege';
    end if;
    if not public.dono_do_mes(p_plan) then
      raise exception
        'Para acrescentar pauta a um mes ja aprovado, e preciso ser quem criou este mes ou a administracao.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if aprovado and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Diga por que esta acrescentando esta pauta. O cliente vai ler.'
      using errcode = 'check_violation';
  end if;

  select coalesce(max(position), -1) + 1 into prox
  from public.content_ideas where plan_id = p_plan;

  -- Data fora do mes do planejamento e quase sempre engano de digitacao
  -- ou de fuso. O calendario so mostra o mes dele; a pauta sumiria.
  quando := coalesce(p_data, make_date(plano.year, plano.month, 1));
  if date_trunc('month', quando) <> make_date(plano.year, plano.month, 1) then
    raise exception 'A data % nao esta em %/%.', quando, plano.month, plano.year
      using errcode = 'check_violation';
  end if;

  perform set_config('app.pauta_nova', '1', true);

  insert into public.content_ideas (
    brand_id, plan_id, title, concept, description, editorial_line,
    cta, theme, objective, rationale, scope_id, status, position, origem
  ) values (
    plano.brand_id, p_plan, btrim(p_title),
    nullif(btrim(coalesce(p_concept, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_editorial_line, '')), ''),
    nullif(btrim(coalesce(p_cta, '')), ''),
    nullif(btrim(coalesce(p_theme, '')), ''),
    nullif(btrim(coalesce(p_objective, '')), ''),
    nullif(btrim(coalesce(p_rationale, '')), ''),
    p_scope, 'internal_review', prox, 'equipe'
  ) returning id into nova;

  perform set_config('app.pauta_nova', '', true);

  insert into public.content_channels (brand_id, idea_id, platform, format, scheduled_date)
  values (
    plano.brand_id, nova,
    coalesce(p_plataforma, 'instagram')::public.platform,
    coalesce(nullif(btrim(coalesce(p_formato, '')), ''), 'Feed'),
    quando
  );

  -- O motivo so existe quando havia acordo a desfazer. Num mes ainda em
  -- revisao interna nao ha o que explicar ao cliente, e um comentario
  -- vazio na conversa dele seria ruido.
  if aprovado then
    insert into public.comments (brand_id, idea_id, author_id, author_kind, body, visibility)
    values (plano.brand_id, nova, public.quem_sou(), 'internal', btrim(p_motivo), 'shared');
  end if;

  return nova;
end $$;

comment on function public.adicionar_pauta is
  'Acrescenta uma pauta a um planejamento. Mes aprovado exige dono do mes, permissao de envio e motivo visivel ao cliente (0041).';

revoke all on function public.adicionar_pauta(
  uuid, text, text, text, text, text, text, text, text, uuid, date, text, text, text
) from public;
grant execute on function public.adicionar_pauta(
  uuid, text, text, text, text, text, text, text, text, uuid, date, text, text, text
) to authenticated;

-- ------------------------------------------------------------------
-- Conferencia
-- ------------------------------------------------------------------
do $$
declare faltam text[];
begin
  if not exists (select 1 from pg_proc where proname = 'adicionar_pauta') then
    raise exception 'Faltou a funcao adicionar_pauta';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'pauta_em_mes_aprovado_trg'
  ) then
    raise exception 'Faltou o gatilho pauta_em_mes_aprovado_trg';
  end if;

  -- Toda etapa que o aplicativo grava em ai_runs tem de existir no
  -- enum. A lista abaixo e a do codigo; foi ela que denunciou o
  -- 'content_refine' perdido. Etapa nova sem linha aqui volta a sumir
  -- da conta de custo em silencio.
  select coalesce(array_agg(e), '{}') into faltam
  from unnest(array[
    'strategy', 'research', 'content', 'content_refine',
    'refine', 'critique', 'document_card', 'brand_memory', 'pauta_nova'
  ]) e
  where not exists (
    select 1 from pg_enum x join pg_type t on t.oid = x.enumtypid
    where t.typname = 'ai_agent' and x.enumlabel = e
  );
  if array_length(faltam, 1) > 0 then
    raise exception 'Etapas que o codigo grava e o enum ai_agent nao tem: %', faltam;
  end if;
end $$;
