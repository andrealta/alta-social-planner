-- =============================================================
-- 0028: permissão por responsabilidade, não por nível
-- =============================================================
--
-- Até aqui a equipe tinha três níveis por marca: responsável, edita, só
-- lê. Quem podia corrigir uma vírgula numa legenda podia também regerar
-- o mês inteiro, que custa dinheiro, mexer na base da marca e definir a
-- verba de mídia. São responsabilidades diferentes, com riscos
-- diferentes, tratadas como se fossem a mesma coisa.
--
-- Agora são cinco permissões, concedidas pessoa a pessoa, e valem em
-- todas as marcas. Ler não é mais permissão: quem é da Alta lê tudo, e
-- o que se concede é o direito de ALTERAR cada parte.
--
-- A troca inteira cabe em três funções porque o sistema já foi montado
-- assim: nenhuma política pergunta "esta pessoa é fulano". Elas
-- perguntam `can_access_brand` para ler e `pode_editar_marca` para
-- escrever, e é o conteúdo dessas funções que muda aqui. As dezenas de
-- políticas seguem atrás sem serem tocadas.
--
-- O que NÃO cabe em política é a regra por COLUNA: "esta pessoa mexe na
-- verba mas não no texto" fala de duas colunas da mesma tabela, e
-- política protege linha. Isso vira gatilho, que compara o antes e o
-- depois campo a campo. É o mesmo recurso que já impede trocar o tema
-- de uma pauta sem versionar.

-- -------------------------------------------------------------
-- 1. O catálogo
-- -------------------------------------------------------------
--
-- Lista fixa e pequena, nomeada pela responsabilidade e não pela tela.
-- Se fosse uma linha por tela, cresceria a cada tela nova e ninguém
-- lembraria de manter.

create table if not exists public.permissoes (
  chave text primary key,
  nome  text not null,
  ajuda text not null,
  ordem integer not null
);

insert into public.permissoes (chave, nome, ajuda, ordem) values
  ('base', 'Base da marca',
   'Criar e alterar a base de conhecimento, o escopo contratado, os concorrentes e a cor da marca.', 1),
  ('planejamento', 'Gerar planejamento',
   'Rodar a geração do mês e a avaliação da IA. É a parte que custa dinheiro a cada clique.', 2),
  ('conteudo', 'Pautas e conteúdo',
   'Alterar a pauta, escrever a legenda, anexar layout e aprovar internamente.', 3),
  ('midia', 'Investimento de mídia',
   'Definir o objetivo de campanha na Meta e quanto vai em cada publicação.', 4),
  ('cliente', 'Enviar ao cliente',
   'Liberar o mês e devolver publicações ao cliente. É o que sai da agência.', 5)
on conflict (chave) do update set
  nome = excluded.nome, ajuda = excluded.ajuda, ordem = excluded.ordem;

alter table public.permissoes enable row level security;
alter table public.permissoes force row level security;
drop policy if exists permissoes_todos_leem on public.permissoes;
create policy permissoes_todos_leem on public.permissoes for select to authenticated using (true);
grant select on public.permissoes to authenticated;

-- -------------------------------------------------------------
-- 2. Quem tem o quê
-- -------------------------------------------------------------
--
-- Uma linha por pessoa e permissão. Tabela em vez de coluna com lista
-- porque assim o banco recusa uma permissão inventada, e porque fica
-- registrado quem concedeu e quando: daqui a um ano, essa é a única
-- resposta para "por que fulano conseguiu mexer nisso".

create table if not exists public.permissao_usuario (
  user_id      uuid not null references auth.users(id) on delete cascade,
  permissao    text not null references public.permissoes(chave) on update cascade,
  concedida_em timestamptz not null default now(),
  concedida_por uuid references auth.users(id) on delete set null,
  primary key (user_id, permissao)
);

create index if not exists permissao_usuario_user_idx on public.permissao_usuario (user_id);

alter table public.permissao_usuario enable row level security;
alter table public.permissao_usuario force row level security;

-- Toda a equipe lê a lista inteira: saber quem responde pelo quê faz
-- parte de trabalhar junto, e esconder isso só gera pergunta no grupo.
drop policy if exists permissao_le on public.permissao_usuario;
create policy permissao_le on public.permissao_usuario for select to authenticated
  using (public.is_staff() or user_id = auth.uid());

-- Conceder e tirar é da administração. Não há caminho para alguém se
-- promover: a política olha quem está pedindo, não quem é o alvo.
drop policy if exists permissao_admin on public.permissao_usuario;
create policy permissao_admin on public.permissao_usuario for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.permissao_usuario to authenticated;

-- -------------------------------------------------------------
-- 3. A pergunta, em uma função
-- -------------------------------------------------------------
--
-- `auth.uid() is null` é a conexão direta ao banco, dos scripts de
-- manutenção: mesma isenção que o resto do sistema já dá. A
-- administração passa sempre, porque alguém precisa poder consertar as
-- permissões de todo mundo, inclusive as próprias.

create or replace function public.pode(p text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is null
      or public.is_admin()
      or exists (
        select 1 from public.permissao_usuario u
        where u.user_id = auth.uid() and u.permissao = p
      )
$$;

comment on function public.pode is
  'Esta pessoa tem esta permissão? Administração e script direto passam sempre (0028).';

revoke execute on function public.pode(text) from public;
grant execute on function public.pode(text) to authenticated;

-- Todas as permissões de uma pessoa, para a tela mostrar de uma vez.
create or replace function public.minhas_permissoes()
returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.is_admin() then array(select chave from public.permissoes order by ordem)
    else coalesce(
      (select array_agg(u.permissao order by u.permissao)
       from public.permissao_usuario u where u.user_id = auth.uid()),
      '{}'::text[])
  end
$$;

revoke execute on function public.minhas_permissoes() from public;
grant execute on function public.minhas_permissoes() to authenticated;

-- -------------------------------------------------------------
-- 4. Ler deixa de ser permissão
-- -------------------------------------------------------------
--
-- Quem é da Alta enxerga todas as marcas. Era uma escolha antiga, de
-- quando o vínculo com a marca servia para as duas coisas ao mesmo
-- tempo; agora ele diz só quem acompanha o quê, e a permissão de
-- alterar vem de outro lugar.
--
-- Vale dizer em voz alta o que isso significa: material interno de um
-- cliente passa a ser legível por qualquer pessoa da equipe, inclusive
-- quem não trabalha nele. Dentro de uma agência isso é normal; a trava
-- que importa, que é o cliente não ver o que não é dele, não muda em
-- nada.

create or replace function public.can_access_brand(b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_staff() or b = any(public.auth_brand_ids())
$$;

-- -------------------------------------------------------------
-- 5. As duas portas de escrita
-- -------------------------------------------------------------
--
-- Aqui está a troca inteira. Dezenas de políticas chamam estas duas
-- funções e não precisam ser tocadas: elas continuam perguntando a
-- mesma coisa, e a resposta é que mudou de fonte.

create or replace function public.pode_editar_marca(b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_staff() and public.pode('conteudo')
$$;

create or replace function public.pode_enviar_ao_cliente(b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_staff() and public.pode('cliente')
$$;

-- -------------------------------------------------------------
-- 5b. O nível vira uma leitura das permissões
-- -------------------------------------------------------------
--
-- Dezenas de telas e quatro rotas perguntam `nivel_na_marca` e decidem
-- por owner/editor/viewer. Reescrever todas de uma vez seria trocar o
-- motor com o carro andando, e cada esquecimento vira um botão que some
-- ou, pior, um botão que fica e não devia.
--
-- Então o nível passa a ser calculado a partir das permissões, e não
-- mais lido do vínculo com a marca. Quem envia ao cliente responde pela
-- conta, quem mexe em conteúdo edita, o resto acompanha. As telas
-- continuam perguntando a mesma coisa e recebendo a resposta certa.
--
-- Para o cliente nada muda: ele não tem permissões, tem vínculo, e é o
-- vínculo que a função devolve.

create or replace function public.nivel_na_marca(b uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.is_admin() then 'owner'
    when public.is_staff() and public.pode('cliente')  then 'owner'
    when public.is_staff() and public.pode('conteudo') then 'editor'
    when public.is_staff() then 'viewer'
    else (
      select m.access::text
      from public.brand_members m
      where m.user_id = auth.uid() and m.brand_id = b
      limit 1
    )
  end
$$;

comment on function public.nivel_na_marca is
  'O nível de uma pessoa, calculado das permissões desde a 0028. Existe para as telas antigas continuarem funcionando.';

-- -------------------------------------------------------------
-- 6. A base da marca tem dono próprio
-- -------------------------------------------------------------
--
-- Estas tabelas seguiam a mesma regra do conteúdo. Passam a exigir a
-- permissão de base: é o material que alimenta toda a geração, e
-- estragá-lo estraga os meses seguintes, não só uma peça.

do $$
declare t text;
begin
  foreach t in array array[
    'brand_knowledge', 'brand_scope', 'products', 'brand_platforms', 'resources'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('drop policy if exists staff_cria on public.%I', t);
    execute format('drop policy if exists staff_altera on public.%I', t);
    execute format('drop policy if exists staff_apaga on public.%I', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);

    execute format(
      'create policy staff_cria on public.%I for insert to authenticated
         with check (public.is_staff() and public.pode(''base''))', t);
    execute format(
      'create policy staff_altera on public.%I for update to authenticated
         using (public.is_staff() and public.pode(''base''))
         with check (public.is_staff() and public.pode(''base''))', t);
    execute format(
      'create policy staff_apaga on public.%I for delete to authenticated
         using (public.is_staff() and public.pode(''base''))', t);
  end loop;
end $$;

-- A cor da marca também é base.
drop policy if exists brands_staff_altera on public.brands;
create policy brands_staff_altera on public.brands for update to authenticated
  using (public.is_staff() and public.pode('base'))
  with check (public.is_staff() and public.pode('base'));

-- -------------------------------------------------------------
-- 6b. As políticas antigas que davam tudo a quem é da equipe
-- -------------------------------------------------------------
--
-- Sobraram de antes da separação entre ler e escrever: uma política só,
-- de comando ALL, dizendo "se é da Alta e alcança a marca, pode tudo".
-- Como políticas se somam, ela passaria por cima de toda a divisão
-- feita aqui: bastaria uma delas para a permissão de conteúdo não valer
-- nada em `idea_content`.
--
-- Viram leitura, que é o que deviam ter sido. As quatro políticas
-- separadas, que já existem nessas tabelas, cuidam da escrita.

do $$
declare r record;
begin
  for r in
    select c.relname as tabela, p.polname as politica
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and p.polcmd = '*'
      and pg_get_expr(p.polqual, p.polrelid) like '%is_staff()%'
  loop
    execute format('drop policy if exists %I on public.%I', r.politica, r.tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.is_staff() and public.can_access_brand(brand_id))',
      r.politica, r.tabela
    );
    raise notice 'Política % em % virou só leitura.', r.politica, r.tabela;
  end loop;
end $$;

-- -------------------------------------------------------------
-- 7. Gerar o mês
-- -------------------------------------------------------------
--
-- Criar um planejamento é o clique caro do sistema. Quem gera precisa
-- também poder gravar as pautas que a geração produz, então a criação
-- de pauta aceita as duas permissões. Alterar pauta depois continua
-- sendo de quem cuida do conteúdo.

drop policy if exists staff_cria on public.plans;
create policy staff_cria on public.plans for insert to authenticated
  with check (public.is_staff() and public.pode('planejamento'));

drop policy if exists staff_altera on public.plans;
create policy staff_altera on public.plans for update to authenticated
  using (public.is_staff() and (public.pode('conteudo') or public.pode('planejamento')))
  with check (public.is_staff() and (public.pode('conteudo') or public.pode('planejamento')));

do $$
declare t text;
begin
  foreach t in array array['content_ideas', 'content_channels'] loop
    execute format('drop policy if exists staff_cria on public.%I', t);
    execute format(
      'create policy staff_cria on public.%I for insert to authenticated
         with check (public.is_staff()
                     and (public.pode(''conteudo'') or public.pode(''planejamento'')))', t);
  end loop;
end $$;

-- A varredura de concorrentes e a crítica do mês também são chamadas de
-- IA, e saem do mesmo bolso.
do $$
declare t text;
begin
  foreach t in array array['research_runs', 'research_sources'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists staff_cria on public.%I', t);
    execute format(
      'create policy staff_cria on public.%I for insert to authenticated
         with check (public.is_staff()
                     and (public.pode(''planejamento'') or public.pode(''base'')))', t);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 8. A verba, que mora na mesma tabela do texto
-- -------------------------------------------------------------
--
-- Política protege linha, e as três colunas de mídia dividem a linha
-- com o título e a descrição da pauta. Para separar as duas
-- responsabilidades é preciso olhar coluna a coluna, e quem faz isso é
-- gatilho.
--
-- A geração escreve mídia junto com a pauta, e por isso a permissão de
-- planejamento também serve na inserção: seria absurdo pedir duas
-- permissões para um clique só.

create or replace function public.midia_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  mexeu boolean;
begin
  if tg_op = 'INSERT' then
    mexeu := coalesce(new.meta_objetivo, '') <> ''
          or coalesce(new.meta_investimento, 0) <> 0
          or coalesce(new.meta_justificativa, '') <> '';
    if mexeu and not (public.pode('midia') or public.pode('planejamento')) then
      raise exception 'Você não tem permissão para definir investimento de mídia.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  mexeu := new.meta_objetivo      is distinct from old.meta_objetivo
        or new.meta_investimento  is distinct from old.meta_investimento
        or new.meta_justificativa is distinct from old.meta_justificativa;

  if mexeu and not public.pode('midia') then
    raise exception 'Você não tem permissão para definir investimento de mídia.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

drop trigger if exists midia_guard_trg on public.content_ideas;
create trigger midia_guard_trg
  before insert or update on public.content_ideas
  for each row execute function public.midia_guard();

-- O total do mês é a mesma decisão, na tabela do plano.
create or replace function public.midia_plano_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and new.investimento_total is not distinct from old.investimento_total then
    return new;
  end if;
  if new.investimento_total is null and tg_op = 'INSERT' then
    return new;
  end if;
  if not (public.pode('midia') or public.pode('planejamento')) then
    raise exception 'Você não tem permissão para definir o investimento do mês.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists midia_plano_guard_trg on public.plans;
create trigger midia_plano_guard_trg
  before insert or update on public.plans
  for each row execute function public.midia_plano_guard();

-- -------------------------------------------------------------
-- 9. Trazer quem já existe para o modelo novo
-- -------------------------------------------------------------
--
-- Ninguém pode acordar amanhã sem conseguir trabalhar. O nível que a
-- pessoa tinha em QUALQUER marca vira o conjunto de permissões
-- equivalente:
--
--   responsável → tudo, menos pessoas (que segue sendo da administração)
--   edita       → pautas e conteúdo
--   só lê       → nada, e agora enxerga todas as marcas em vez de uma
--
-- A administração não ganha linha nenhuma: `pode()` já responde sim
-- para ela, e gravar o óbvio só cria estado para desencontrar depois.

insert into public.permissao_usuario (user_id, permissao)
select distinct m.user_id, v.permissao
from public.brand_members m
join public.profiles p on p.id = m.user_id
cross join lateral (
  select unnest(
    case m.access::text
      when 'owner'  then array['base', 'planejamento', 'conteudo', 'midia', 'cliente']
      when 'editor' then array['conteudo']
      else array[]::text[]
    end
  ) as permissao
) v
where p.role = 'staff'
on conflict (user_id, permissao) do nothing;

-- -------------------------------------------------------------
-- 10. Conferência
-- -------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n from public.permissoes;
  if n <> 5 then
    raise exception 'O catálogo de permissões devia ter 5 linhas, tem %', n;
  end if;

  -- Nenhuma política de escrita pode ter ficado presa ao vínculo com a
  -- marca: se sobrou alguma, a pessoa certa vai ser barrada em silêncio.
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where p.polname in ('staff_cria', 'staff_altera', 'staff_apaga')
      and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%nivel_na_marca%'
  ) then
    raise exception 'Ainda existe política de escrita presa ao nível na marca.';
  end if;

  -- Nenhuma política de comando ALL pode sobrar dando escrita à equipe:
  -- uma só desfaz a divisão inteira, e em silêncio.
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and p.polcmd = '*'
      and pg_get_expr(p.polqual, p.polrelid) like '%is_staff()%'
  ) then
    raise exception 'Sobrou política ALL dando escrita a qualquer pessoa da equipe.';
  end if;

  raise notice 'Permissões: cinco responsabilidades, por pessoa, valendo em todas as marcas.';
end $$;
