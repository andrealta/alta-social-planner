-- =============================================================
-- 0023: o layout de cada publicação
-- =============================================================
--
-- Depois que a pauta é aprovada pela equipe e o conteúdo é escrito, a
-- equipe anexa a arte (uma imagem, ou várias em ordem para carrossel)
-- e ela vai para o cliente junto com a legenda.
--
-- O arquivo mora no Storage do Supabase, num balde privado chamado
-- "layouts". Aqui fica uma linha por imagem: de qual pauta é, em que
-- posição, quem mandou. Quem pode ver o arquivo é decidido por esta
-- tabela: o balde só entrega a imagem a quem consegue ler a linha dela.
-- Assim o cliente vê o layout exatamente quando vê a pauta, e nunca
-- antes.
--
-- Regras de quando se pode mexer (gatilho abaixo):
--   * precisa haver conteúdo escrito para a pauta;
--   * a equipe anexa com a pauta aprovada internamente ou com pedido
--     de alteração do cliente;
--   * com a pauta nas mãos do cliente, ou já aprovada por ele, só a
--     administração troca. O que o cliente aprovou não muda sem
--     alguém com essa responsabilidade decidir;
--   * até 10 imagens por publicação;
--   * só JPG, PNG ou WEBP, até 10 MB.

create table public.pauta_layouts (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid not null references public.content_ideas(id) on delete cascade,
  brand_id      uuid not null references public.brands(id) on delete cascade,
  storage_path  text not null unique,
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes         integer check (bytes is null or (bytes > 0 and bytes <= 10485760)),
  largura       integer,
  altura        integer,
  nome_original text,
  posicao       integer not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.pauta_layouts is
  'As imagens de layout de cada publicação, em ordem. O arquivo fica no balde "layouts" do Storage.';

create index pauta_layouts_ideia_idx on public.pauta_layouts (idea_id, posicao);
create index pauta_layouts_marca_idx on public.pauta_layouts (brand_id);

create or replace function public.pauta_layouts_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo    uuid := coalesce(new.idea_id, old.idea_id);
  estado  text;
  marca   uuid;
  total   integer;
begin
  select ci.status::text, ci.brand_id into estado, marca from public.content_ideas ci where ci.id = alvo;

  -- A pauta sumiu no mesmo comando (exclusão do mês em cascata): a
  -- imagem vai junto, sem regra a conferir.
  if estado is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op <> 'DELETE' then
    new.brand_id := marca;
  end if;

  -- Só o carimbo de autoria mudando (pessoa excluída): sempre passa.
  if tg_op = 'UPDATE'
     and new.idea_id = old.idea_id and new.storage_path = old.storage_path
     and new.posicao = old.posicao then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.storage_path not like marca::text || '/' || alvo::text || '/%' then
      raise exception 'O arquivo precisa estar na pasta desta publicação.'
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.idea_content ic where ic.idea_id = alvo) then
      raise exception 'Crie o conteúdo da publicação antes de anexar o layout.'
        using errcode = 'check_violation';
    end if;
    select count(*) into total from public.pauta_layouts l where l.idea_id = alvo;
    if total >= 10 then
      raise exception 'Cada publicação aceita até 10 imagens.'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.idea_id <> old.idea_id then
    raise exception 'Um layout não muda de publicação.' using errcode = 'check_violation';
  end if;

  -- Conexão direta ao banco (scripts de manutenção): sem nível a conferir.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if estado = 'ai_generated' or estado = 'internal_review' or estado = 'internal_changes' then
    raise exception 'Aprove a pauta internamente antes de anexar ou trocar o layout.'
      using errcode = 'insufficient_privilege';
  end if;

  if estado in ('sent_to_client', 'client_approved') and not public.is_admin() then
    raise exception '%',
      case when estado = 'client_approved'
        then 'Esta publicação já foi aprovada pelo cliente. Só a administração pode trocar o layout.'
        else 'Esta publicação está com o cliente para avaliação. Só a administração pode trocar o layout agora.'
      end
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create trigger pauta_layouts_guard_trg
  before insert or update or delete on public.pauta_layouts
  for each row execute function public.pauta_layouts_guard();

alter table public.pauta_layouts enable row level security;
alter table public.pauta_layouts force row level security;

create policy staff_le on public.pauta_layouts
  for select using (public.is_staff() and public.can_access_brand(brand_id));
create policy cliente_le on public.pauta_layouts
  for select using (
    public.auth_role() = 'client'
    and brand_id = any (public.auth_brand_ids())
    and public.idea_is_client_visible(idea_id)
  );
create policy staff_cria on public.pauta_layouts
  for insert with check (public.pode_editar_marca(brand_id));
create policy staff_altera on public.pauta_layouts
  for update using (public.pode_editar_marca(brand_id))
  with check (public.pode_editar_marca(brand_id));
create policy staff_apaga on public.pauta_layouts
  for delete using (public.pode_editar_marca(brand_id));

grant select, insert, update, delete on public.pauta_layouts to authenticated;
revoke all on public.pauta_layouts from anon;

-- ---------- o balde no Storage ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('layouts', 'layouts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Caminho do arquivo: <marca>/<pauta>/<nome>. A primeira pasta diz a
-- marca, e é por ela que se confere quem pode enviar.
-- A marca dona do arquivo, lida da primeira pasta do caminho. Devolve
-- nulo (e não erro) para caminho fora do padrão: a política nunca pode
-- quebrar a leitura de outros baldes por causa de um nome estranho.
create or replace function public.marca_do_arquivo(nome text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(nome, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(nome, '/', 1)::uuid
  end
$$;

drop policy if exists layouts_le on storage.objects;
drop policy if exists layouts_envia on storage.objects;
drop policy if exists layouts_apaga on storage.objects;

-- Ler: a equipe da marca vê os arquivos da pasta dela (precisa, até
-- para apagar um arquivo que já saiu da tabela). O cliente só vê o
-- arquivo cuja linha ele consegue ler: a política da tabela decide.
create policy layouts_le on storage.objects
  for select to authenticated
  using (
    bucket_id = 'layouts'
    and (
      (public.is_staff() and public.can_access_brand(public.marca_do_arquivo(name)))
      or exists (select 1 from public.pauta_layouts l where l.storage_path = storage.objects.name)
    )
  );

-- Enviar: quem edita a marca da primeira pasta.
create policy layouts_envia on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'layouts'
    and public.pode_editar_marca(public.marca_do_arquivo(name))
  );

-- Apagar: quem edita a marca, e só arquivo que não está mais em uso.
-- A linha sai primeiro (com as regras do gatilho); o arquivo, depois.
-- Assim ninguém apaga a imagem de uma publicação aprovada pela porta
-- dos fundos.
create policy layouts_apaga on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'layouts'
    and public.pode_editar_marca(public.marca_do_arquivo(name))
    and not exists (select 1 from public.pauta_layouts l where l.storage_path = storage.objects.name)
  );
