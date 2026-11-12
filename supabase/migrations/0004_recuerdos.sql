-- =============================================================================
-- MAMANÍ CLUB · Migración 0004 · Recuerdos: fotos, likes y comentarios
--
-- Cada juntada tiene su álbum. Las fotos se guardan en un bucket PRIVADO de
-- Supabase Storage (solo se ven con URLs firmadas de vida corta) y se achican en
-- el celular antes de subir: versión grande (~1600 px) + miniatura (~480 px).
--
-- Ruta de cada archivo:  photos/<id de la juntada>/<id de quien sube>/<id>.webp
--                        photos/<id de la juntada>/<id de quien sube>/<id>-thumb.webp
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. TABLAS
-- -----------------------------------------------------------------------------
create table public.photos (
  id                uuid primary key default gen_random_uuid(),
  expense_id        uuid not null references public.expenses(id),
  uploaded_by       uuid not null references public.profiles(id),
  storage_path      text not null unique,
  thumb_path        text not null unique,
  width             int  not null check (width  between 1 and 10000),
  height            int  not null check (height between 1 and 10000),
  size_bytes        int  not null check (size_bytes > 0),
  thumb_size_bytes  int  not null check (thumb_size_bytes > 0),
  mime_type         text not null check (mime_type in ('image/webp', 'image/jpeg')),
  created_at        timestamptz not null default now(),
  -- Borrado lógico: la fila queda (para la auditoría), el archivo se elimina.
  deleted_at        timestamptz,
  deleted_by        uuid references public.profiles(id),
  moderation_reason text
);

create index photos_expense_idx on public.photos (expense_id, created_at desc) where deleted_at is null;
create index photos_recent_idx  on public.photos (created_at desc) where deleted_at is null;

-- Un like por persona y foto: la clave primaria lo garantiza (caso 28).
create table public.photo_likes (
  photo_id   uuid not null references public.photos(id),
  member_id  uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (photo_id, member_id)
);

create table public.photo_comments (
  id                uuid primary key default gen_random_uuid(),
  photo_id          uuid not null references public.photos(id),
  author_id         uuid not null references public.profiles(id),
  body              text not null check (length(trim(body)) between 1 and 500),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        uuid references public.profiles(id),
  moderation_reason text
);

create index photo_comments_photo_idx on public.photo_comments (photo_id, created_at) where deleted_at is null;


-- -----------------------------------------------------------------------------
-- 2. CONTADORES (vista calculada)
-- -----------------------------------------------------------------------------
create view public.v_photo_stats with (security_invoker = true) as
select
  p.id as photo_id,
  p.expense_id,
  (select count(*) from public.photo_likes l where l.photo_id = p.id)                              as likes,
  (select count(*) from public.photo_comments c where c.photo_id = p.id and c.deleted_at is null) as comments
from public.photos p
where p.deleted_at is null;


-- -----------------------------------------------------------------------------
-- 3. FUNCIONES
-- -----------------------------------------------------------------------------

-- Registra una foto ya subida a Storage. Verifica que los archivos existan, que
-- estén en la carpeta de esa juntada y de quien sube, y que la juntada esté activa.
create function public.add_photo(
  p_expense_id uuid, p_storage_path text, p_thumb_path text,
  p_width int, p_height int, p_size_bytes int, p_thumb_size_bytes int, p_mime_type text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_prefix text := p_expense_id::text || '/' || auth.uid()::text || '/';
  v_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'Solo integrantes activas pueden subir fotos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.expenses where id = p_expense_id and status = 'active') then
    raise exception 'La juntada no existe o está anulada';
  end if;
  if left(p_storage_path, length(v_prefix)) <> v_prefix or left(p_thumb_path, length(v_prefix)) <> v_prefix then
    raise exception 'Ruta de archivo inválida';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'photos' and name in (p_storage_path, p_thumb_path)) <> 2 then
    raise exception 'No se encontraron los archivos subidos';
  end if;

  insert into public.photos (expense_id, uploaded_by, storage_path, thumb_path, width, height, size_bytes, thumb_size_bytes, mime_type)
  values (p_expense_id, auth.uid(), p_storage_path, p_thumb_path, p_width, p_height, p_size_bytes, p_thumb_size_bytes, p_mime_type)
  returning id into v_id;
  return v_id;
end $$;

-- Borra (lógicamente) una foto: la autora o una admin. Si la borra una admin y no
-- es suya, es moderación. Devuelve las rutas para que la app elimine los archivos.
create function public.delete_photo(p_photo_id uuid, p_reason text default null)
returns table (storage_path text, thumb_path text)
language plpgsql security definer set search_path = ''
as $$
declare
  v public.photos;
  v_moderation boolean;
begin
  select * into v from public.photos p where p.id = p_photo_id for update;
  if not found or v.deleted_at is not null then raise exception 'La foto no existe'; end if;
  v_moderation := v.uploaded_by <> auth.uid();
  if not (public.is_admin() or (public.is_active_member() and not v_moderation)) then
    raise exception 'Solo quien subió la foto o una admin puede borrarla' using errcode = '42501';
  end if;

  update public.photos set deleted_at = now(), deleted_by = auth.uid(), moderation_reason = nullif(trim(p_reason), '')
   where id = p_photo_id;
  perform public.write_audit('photos', p_photo_id,
    case when v_moderation then 'photo_moderated' else 'photo_deleted' end,
    to_jsonb(v), (select to_jsonb(p) from public.photos p where p.id = p_photo_id), p_reason);
  return query select v.storage_path, v.thumb_path;
end $$;

-- Borra (lógicamente) un comentario: la autora o una admin (moderación).
create function public.delete_comment(p_comment_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.photo_comments;
  v_moderation boolean;
begin
  select * into v from public.photo_comments where id = p_comment_id for update;
  if not found or v.deleted_at is not null then raise exception 'El comentario no existe'; end if;
  v_moderation := v.author_id <> auth.uid();
  if not (public.is_admin() or (public.is_active_member() and not v_moderation)) then
    raise exception 'Solo la autora o una admin puede borrar el comentario' using errcode = '42501';
  end if;
  update public.photo_comments set deleted_at = now(), deleted_by = auth.uid(), moderation_reason = nullif(trim(p_reason), '')
   where id = p_comment_id;
  perform public.write_audit('photo_comments', p_comment_id,
    case when v_moderation then 'comment_moderated' else 'comment_deleted' end,
    to_jsonb(v), (select to_jsonb(c) from public.photo_comments c where c.id = p_comment_id), p_reason);
end $$;

-- Dar o quitar like (idempotente). Devuelve true si quedó con like.
create function public.toggle_like(p_photo_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Solo integrantes activas pueden dar like' using errcode = '42501';
  end if;
  if not exists (select 1 from public.photos where id = p_photo_id and deleted_at is null) then
    raise exception 'La foto no existe';
  end if;
  delete from public.photo_likes where photo_id = p_photo_id and member_id = auth.uid();
  if found then return false; end if;
  insert into public.photo_likes (photo_id, member_id) values (p_photo_id, auth.uid())
  on conflict do nothing;   -- dos toques simultáneos no duplican
  return true;
end $$;

revoke execute on function public.add_photo(uuid, text, text, int, int, int, int, text) from public, anon;
revoke execute on function public.delete_photo(uuid, text) from public, anon;
revoke execute on function public.delete_comment(uuid, text) from public, anon;
revoke execute on function public.toggle_like(uuid) from public, anon;
grant execute on function public.add_photo(uuid, text, text, int, int, int, int, text) to authenticated;
grant execute on function public.delete_photo(uuid, text) to authenticated;
grant execute on function public.delete_comment(uuid, text) to authenticated;
grant execute on function public.toggle_like(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.photos         enable row level security;
alter table public.photo_likes    enable row level security;
alter table public.photo_comments enable row level security;

create policy "leer fotos" on public.photos
  for select to authenticated using (public.is_active_member() and deleted_at is null);
create policy "leer likes" on public.photo_likes
  for select to authenticated using (public.is_active_member());
create policy "leer comentarios" on public.photo_comments
  for select to authenticated using (public.is_active_member() and deleted_at is null);

-- Comentar: directo en la tabla, como una misma y sobre una foto visible.
create policy "comentar" on public.photo_comments
  for insert to authenticated
  with check (
    public.is_active_member()
    and author_id = auth.uid()
    and deleted_at is null and deleted_by is null and moderation_reason is null
    and exists (select 1 from public.photos p where p.id = photo_id and p.deleted_at is null)
  );

revoke insert, update, delete, truncate on public.photos, public.photo_likes from anon, authenticated;
revoke update, delete, truncate on public.photo_comments from anon, authenticated;
revoke all on public.photos, public.photo_likes, public.photo_comments, public.v_photo_stats from anon;

-- Auditoría de altas de comentarios no hace falta (son contenido); sí la de bajas
-- y moderación, que hacen las funciones de arriba.


-- -----------------------------------------------------------------------------
-- 5. STORAGE: bucket privado "photos"
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728,                          -- 3 MB por archivo
        array['image/webp', 'image/jpeg']);

-- Subir: integrante activa, en la carpeta de una juntada activa y en SU subcarpeta.
create policy "subir fotos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and public.is_active_member()
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (select 1 from public.expenses e
                where e.id::text = (storage.foldername(name))[1] and e.status = 'active')
  );

-- Ver: solo integrantes activas (las URLs firmadas se generan con este permiso).
create policy "ver fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_active_member());

-- Borrar archivos: la autora (su subcarpeta) o una admin, y SOLO si el archivo no
-- pertenece a una foto visible (primero se borra la foto con delete_photo). Así
-- nunca queda una foto apuntando a un archivo inexistente.
create policy "borrar fotos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and ((storage.foldername(name))[2] = auth.uid()::text or public.is_admin())
    and not exists (
      select 1 from public.photos p
      where (p.storage_path = name or p.thumb_path = name) and p.deleted_at is null
    )
  );

-- Fin de la migración 0004.
