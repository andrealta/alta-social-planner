-- 0042_acesso_por_marca.sql
--
-- O vinculo com a marca volta a valer para a equipe.
--
-- O QUE ESTAVA ACONTECENDO
--
-- A 0028 trocou o modelo inteiro e documentou a troca: ler virou
-- global para a equipe, e escrever passou a vir das permissoes. O
-- efeito colateral, que a migracao nao disse em voz alta, e que
-- `pode_editar_marca(b)` passou a IGNORAR o parametro `b`. Quem tem a
-- permissao de conteudo edita todas as marcas, inclusive as que nunca
-- viu. O vinculo com a marca, para a equipe, deixou de significar
-- qualquer coisa.
--
-- A tela de Pessoas continuou oferecendo "responsavel", "edita" e "so
-- le" marca por marca, com a explicacao de cada nivel ao lado, como se
-- valessem. Medido: uma pessoa marcada como "so le" numa marca edita
-- aquela marca normalmente. A tela prometia uma trava que nao existia,
-- que e o pior defeito que uma tela de permissao pode ter: ninguem vai
-- conferir uma trava que a tela afirma estar fechada.
--
-- A REGRA, EM UMA FRASE
--
-- A permissao diz O QUE a pessoa faz. O vinculo com a marca diz ONDE.
--
-- LER CONTINUA GLOBAL. A 0028 argumentou isso bem e o argumento segue
-- de pe: dentro de uma agencia, pessoa da equipe consultar o mes
-- passado de outra conta e trabalho normal, e a trava que importa, que
-- e o cliente nao ver o que nao e dele, nao muda em nada. Quem nao tem
-- vinculo numa marca le e nao altera.

-- ------------------------------------------------------------------
-- 1. As duas metades, separadas
-- ------------------------------------------------------------------
--
-- Ficam em funcoes proprias porque a conta aparece em tres lugares, e
-- regra de acesso copiada em tres lugares diverge no dia em que uma
-- das copias for ajustada.

create or replace function public.peso_do_nivel(n text)
returns int language sql immutable as $$
  select case n when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end
$$;

create or replace function public.menor_nivel(a text, b text)
returns text language sql immutable as $$
  select case when public.peso_do_nivel(a) <= public.peso_do_nivel(b) then a else b end
$$;

comment on function public.menor_nivel is
  'O menor de dois niveis. A permissao e um teto, o vinculo e outro, e vale o mais baixo (0042).';

-- O vinculo cru, sem permissao nenhuma por cima.
create or replace function public.vinculo_na_marca(b uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select m.access::text
  from public.brand_members m
  where m.user_id = auth.uid() and m.brand_id = b
  limit 1
$$;

-- O teto que as permissoes dao, em qualquer marca.
create or replace function public.teto_das_permissoes()
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.pode('cliente')  then 'owner'
    when public.pode('conteudo') then 'editor'
    else 'viewer'
  end
$$;

-- O mesmo teto, perguntado sobre outra pessoa. A migracao abaixo
-- precisa dele para cada membro da equipe, e a tela de Pessoas precisa
-- para mostrar o nivel efetivo de quem ela esta editando.
create or replace function public.teto_de(p_user uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when (select role::text from public.profiles where id = p_user) = 'admin' then 'owner'
    when exists (select 1 from public.permissao_usuario u
                 where u.user_id = p_user and u.permissao = 'cliente')  then 'owner'
    when exists (select 1 from public.permissao_usuario u
                 where u.user_id = p_user and u.permissao = 'conteudo') then 'editor'
    else 'viewer'
  end
$$;

comment on function public.teto_de is
  'O nivel mais alto que as permissoes desta pessoa permitem, em qualquer marca (0042).';

revoke execute on function public.teto_de(uuid)           from public;
grant  execute on function public.teto_de(uuid)           to authenticated;

revoke execute on function public.vinculo_na_marca(uuid)  from public;
revoke execute on function public.teto_das_permissoes()   from public;
grant  execute on function public.vinculo_na_marca(uuid)  to authenticated;
grant  execute on function public.teto_das_permissoes()   to authenticated;

-- ------------------------------------------------------------------
-- 2. O nivel, agora com as duas metades
-- ------------------------------------------------------------------
--
-- Sem vinculo a pessoa e 'viewer': le tudo, nao altera nada. Nao e
-- 'sem acesso' de proposito — ler continua global, e devolver nulo
-- aqui faria sumir botao de leitura em tela que hoje funciona.
--
-- Para o cliente nada muda: ele nao tem permissao, tem vinculo, e e o
-- vinculo que a funcao devolve.
create or replace function public.nivel_na_marca(b uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.is_admin()  then 'owner'
    when auth.uid() is null then 'owner'
    when public.is_staff()  then public.menor_nivel(
      public.teto_das_permissoes(),
      coalesce(public.vinculo_na_marca(b), 'viewer')
    )
    else public.vinculo_na_marca(b)
  end
$$;

comment on function public.nivel_na_marca is
  'O menor entre o que as permissoes permitem e o que o vinculo com a marca da. Cliente: o vinculo (0042).';

-- ------------------------------------------------------------------
-- 3. As duas portas de escrita voltam a olhar a marca
-- ------------------------------------------------------------------
--
-- Dezenas de politicas chamam estas duas e nao precisam ser tocadas,
-- do mesmo jeito que na 0028: continuam perguntando a mesma coisa, e a
-- resposta e que mudou de fonte outra vez.
--
-- A conferencia final da 0028 proibe politica de ESCRITA cujo texto
-- cite `nivel_na_marca`. Ela continua valendo e continua passando: a
-- marca entra por dentro destas funcoes, nao pelo texto da politica.
-- O que mudou foi o que elas respondem, nao onde elas sao chamadas.
create or replace function public.pode_editar_marca(b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_staff()
     and public.pode('conteudo')
     and public.nivel_na_marca(b) in ('owner', 'editor')
$$;

create or replace function public.pode_enviar_ao_cliente(b uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_staff()
     and public.pode('cliente')
     and public.nivel_na_marca(b) = 'owner'
$$;

comment on function public.pode_editar_marca is
  'Permissao de conteudo E vinculo de edicao NESTA marca (0042).';
comment on function public.pode_enviar_ao_cliente is
  'Permissao de enviar E ser responsavel NESTA marca (0042).';

-- ------------------------------------------------------------------
-- 4. Nada estreita sozinho
-- ------------------------------------------------------------------
--
-- Hoje quem tem a permissao escreve em toda marca, com vinculo ou sem.
-- Ligar a regra sem mais nada trancaria para fora, de uma vez, todo
-- mundo que trabalha numa marca sem linha em brand_members — e a
-- pessoa descobriria tentando salvar.
--
-- Pior que isso: a tela de Pessoas, desde a 0028, grava 'editor' em
-- toda marca marcada, sem oferecer escolha. Quem tem a permissao de
-- enviar ao cliente e uma linha 'editor' deixaria de poder liberar o
-- mes — e esse 'editor' nunca foi decisao de ninguem, foi o unico
-- valor que a tela sabia escrever.
--
-- A regra desta secao, entao, e uma so: NADA ESTREITA SOZINHO. Toda
-- pessoa da equipe fica, em toda marca viva, no nivel que as
-- permissoes dela ja davam na pratica. O dia seguinte a migracao e
-- igual ao dia anterior.
--
-- Estreitar e decisao de gente, na tela de Pessoas, que a partir de
-- agora diz a verdade sobre o que faz. A migracao abre; ela nao fecha.

-- As que faltam.
insert into public.brand_members (brand_id, user_id, access)
select b.id, p.id, public.teto_de(p.id)::public.brand_access
from public.profiles p
cross join public.brands b
where p.role = 'staff'
  and public.teto_de(p.id) <> 'viewer'
  and b.arquivada_em is null
  and not exists (
    select 1 from public.brand_members m
    where m.user_id = p.id and m.brand_id = b.id
  );

-- E as que existem, mas abaixo do que a pessoa ja podia fazer.
update public.brand_members m
   set access = public.teto_de(m.user_id)::public.brand_access
  from public.profiles p
 where p.id = m.user_id
   and p.role = 'staff'
   and public.peso_do_nivel(m.access::text) < public.peso_do_nivel(public.teto_de(m.user_id));

-- ------------------------------------------------------------------
-- 5. Marca nova nao nasce sem dono
-- ------------------------------------------------------------------
--
-- Sem isto, quem cria uma marca nao consegue escrever nela: a marca
-- nasce sem vinculo nenhum, e a regra nova exige vinculo. Quem cria
-- vira responsavel; o resto da equipe o administrador acrescenta na
-- tela de Pessoas.
--
-- E deliberado que a marca nova NAO saia liberada para a equipe
-- inteira. Era assim que funcionava quando o vinculo nao valia, e e
-- justamente o que se esta consertando. A equipe continua lendo a
-- marca nova desde o primeiro minuto.
create or replace function public.marca_nova_tem_dono()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and public.is_staff() then
    insert into public.brand_members (brand_id, user_id, access)
    values (new.id, auth.uid(), 'owner')
    on conflict (brand_id, user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists marca_nova_tem_dono_trg on public.brands;
create trigger marca_nova_tem_dono_trg
  after insert on public.brands
  for each row execute function public.marca_nova_tem_dono();

-- ------------------------------------------------------------------
-- Conferencia
-- ------------------------------------------------------------------
do $$
begin
  if public.menor_nivel('owner', 'viewer') <> 'viewer'
     or public.menor_nivel('editor', 'owner') <> 'editor'
     or public.menor_nivel('viewer', 'viewer') <> 'viewer' then
    raise exception 'menor_nivel esta errado';
  end if;

  -- A marca precisa voltar a entrar na conta. Se o texto da funcao nao
  -- cita a marca, ela esta ignorando o parametro como antes.
  if (select prosrc from pg_proc where proname = 'pode_editar_marca') not like '%nivel_na_marca(b)%' then
    raise exception 'pode_editar_marca voltou a ignorar a marca';
  end if;
  if (select prosrc from pg_proc where proname = 'pode_enviar_ao_cliente') not like '%nivel_na_marca(b)%' then
    raise exception 'pode_enviar_ao_cliente voltou a ignorar a marca';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'marca_nova_tem_dono_trg') then
    raise exception 'Faltou o gatilho marca_nova_tem_dono_trg';
  end if;
end $$;
