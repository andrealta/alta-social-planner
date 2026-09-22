-- =============================================================
-- 0024: a foto de perfil
-- =============================================================
--
-- Cada pessoa pode pôr uma foto na própria conta. Ela aparece redonda
-- ao lado do nome, na barra do topo e na lista de pessoas.
--
-- A coluna `profiles.avatar_url` existe desde a 0001 e estava vazia.
-- Agora ela guarda o CAMINHO do arquivo dentro do balde privado
-- "avatares", no formato <pessoa>/<arquivo>. O endereço para ver a
-- imagem é assinado na hora, como no layout das publicações (0023).
--
-- Quem pode o quê:
--   * cada pessoa manda, troca e apaga a foto da própria pasta
--     (a política de `profiles` já deixava cada um editar a própria
--     linha, e o gatilho da 0011 continua barrando papel e e-mail);
--   * a equipe da Alta vê a foto de qualquer pessoa, porque a lista de
--     pessoas e o painel mostram quem fez o quê;
--   * o cliente vê a própria foto. A dos outros não lhe diz respeito.
--   * a administração também troca e apaga a foto de qualquer pessoa,
--     para o caso de alguém subir algo inadequado.

comment on column public.profiles.avatar_url is
  'Caminho da foto de perfil dentro do balde "avatares" (<pessoa>/<arquivo>). Nulo: sem foto, a tela mostra as iniciais.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A pessoa dona do arquivo, lida da primeira pasta do caminho.
create or replace function public.dono_do_arquivo(nome text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(nome, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(nome, '/', 1)::uuid
  end
$$;

drop policy if exists avatares_le on storage.objects;
drop policy if exists avatares_envia on storage.objects;
drop policy if exists avatares_troca on storage.objects;
drop policy if exists avatares_apaga on storage.objects;

create policy avatares_le on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatares'
    and (public.dono_do_arquivo(name) = auth.uid() or public.is_staff())
  );

create policy avatares_envia on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (public.dono_do_arquivo(name) = auth.uid() or public.is_admin())
  );

create policy avatares_troca on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and (public.dono_do_arquivo(name) = auth.uid() or public.is_admin())
  );

create policy avatares_apaga on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (public.dono_do_arquivo(name) = auth.uid() or public.is_admin())
  );
