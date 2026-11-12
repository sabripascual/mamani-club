-- =============================================================================
-- MAMANÍ CLUB · Migración 0001 · Fundamentos
-- Integrantes, roles, aprobación de acceso, configuración del grupo, monedas,
-- auditoría y avatares.
--
-- Cómo correrla: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se corre UNA sola vez. Los cambios futuros van en migraciones nuevas (0002, 0003…).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- Un "enum" es una lista cerrada de valores posibles. La base rechaza cualquier
-- otro valor, así no aparece un rol "superadmin" inventado ni un estado mal escrito.
-- -----------------------------------------------------------------------------
create type public.member_role   as enum ('admin', 'member');
create type public.member_status as enum ('pending', 'active', 'inactive', 'rejected');


-- -----------------------------------------------------------------------------
-- 2. MONEDAS (preparado para multidivisa; por ahora solo ARS)
-- -----------------------------------------------------------------------------
create table public.currencies (
  code      char(3) primary key,              -- código ISO 4217: ARS, USD, EUR…
  name      text    not null,
  symbol    text    not null,
  decimals  smallint not null default 2 check (decimals between 0 and 4),
  enabled   boolean not null default false     -- solo las habilitadas se ofrecen en la app
);

insert into public.currencies (code, name, symbol, decimals, enabled) values
  ('ARS', 'Peso argentino',       '$',   2, true),
  ('USD', 'Dólar estadounidense', 'US$', 2, false),
  ('EUR', 'Euro',                 '€',   2, false);


-- -----------------------------------------------------------------------------
-- 3. CONFIGURACIÓN DEL GRUPO
-- Tabla de una sola fila (el check "id = 1" impide que haya una segunda).
-- -----------------------------------------------------------------------------
create table public.group_settings (
  id             smallint primary key default 1 check (id = 1),
  name           text    not null default 'MAMANÍ CLUB',
  tagline        text    not null default 'La cuenta de nuestras juntadas.',
  base_currency  char(3) not null default 'ARS' references public.currencies(code),
  timezone       text    not null default 'America/Argentina/Buenos_Aires',
  updated_at     timestamptz not null default now()
);

insert into public.group_settings (id) values (1);


-- -----------------------------------------------------------------------------
-- 4. PERFILES DE INTEGRANTES
-- Supabase guarda el email y la contraseña en auth.users (esquema privado).
-- Acá guardamos todo lo demás, con el mismo id.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete restrict,
  first_name   text not null check (length(trim(first_name)) between 1 and 60),
  last_name    text not null check (length(trim(last_name))  between 1 and 60),
  -- username: minúsculas, números, punto o guion bajo; 3 a 20 caracteres.
  username     text not null check (username ~ '^[a-z0-9_.]{3,20}$'),
  nickname     text check (nickname is null or length(trim(nickname)) between 1 and 40),
  avatar_path  text,                                      -- ruta dentro del bucket "avatars"
  role         public.member_role   not null default 'member',
  status       public.member_status not null default 'pending',
  joined_at    timestamptz,                               -- se completa al aprobarla
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Índice único: no puede haber dos integrantes con el mismo username.
create unique index profiles_username_key on public.profiles (username);


-- -----------------------------------------------------------------------------
-- 5. FUNCIONES DE AYUDA PARA PERMISOS
-- "security definer" = la función se ejecuta con permisos de su dueño, así puede
-- leer profiles sin quedar atrapada en las propias reglas RLS (evita recursión).
-- "set search_path = ''" obliga a escribir public.xxx y evita trucos de suplantación.
-- auth.uid() devuelve el id de la usuaria logueada que hace la consulta.
-- -----------------------------------------------------------------------------
create function public.is_active_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;


-- -----------------------------------------------------------------------------
-- 6. ALTA AUTOMÁTICA DEL PERFIL AL REGISTRARSE
-- Cuando alguien se registra, Supabase inserta una fila en auth.users.
-- Este trigger crea su perfil con los datos del formulario, SIEMPRE como
-- 'member' + 'pending' (aunque alguien intente mandar otro rol desde el navegador).
-- -----------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, first_name, last_name, username, nickname, avatar_path)
  values (
    new.id,
    trim(meta->>'first_name'),
    trim(meta->>'last_name'),
    lower(trim(meta->>'username')),
    nullif(trim(meta->>'nickname'), ''),
    nullif(meta->>'avatar_path', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 7. LOGIN CON USERNAME
-- Supabase solo sabe loguear con email. Esta función traduce username → email.
-- Solo la puede llamar el SERVIDOR (service_role), nunca el navegador: así nadie
-- puede averiguar los emails de las integrantes probando usernames.
-- -----------------------------------------------------------------------------
create function public.email_for_login(identifier text)
returns text
language sql stable security definer set search_path = ''
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.username = lower(trim(identifier))
  limit 1;
$$;

revoke execute on function public.email_for_login(text) from public, anon, authenticated;
grant  execute on function public.email_for_login(text) to service_role;

-- ¿Está libre este username? (lo usa el formulario de registro; no revela emails)
create function public.username_available(candidate text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.profiles where username = lower(trim(candidate)));
$$;

grant execute on function public.username_available(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 8. AUDITORÍA
-- Cada cambio relevante deja una fila acá con los valores de antes y de después.
-- Nadie de la app puede modificar ni borrar estas filas (ver permisos al final).
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id),   -- quién hizo el cambio (null = sistema)
  occurred_at timestamptz not null default now(),
  entity      text not null,                          -- tabla afectada: 'profiles', 'expenses'…
  entity_id   text not null,                          -- id de la fila afectada
  action      text not null,                          -- 'insert' | 'update' | 'delete' | acción de negocio
  old_values  jsonb,
  new_values  jsonb,
  reason      text                                    -- motivo opcional
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_idx  on public.audit_log (actor_id, occurred_at desc);
create index audit_log_time_idx   on public.audit_log (occurred_at desc);

-- Trigger genérico: se engancha a cualquier tabla y registra el cambio.
-- El motivo se pasa desde una función con: set_config('app.audit_reason', 'texto', true)
create function public.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_action text := lower(tg_op);
begin
  -- Si un UPDATE no cambió nada, no registramos ruido.
  if tg_op = 'UPDATE' and v_old - 'updated_at' = v_new - 'updated_at' then
    return new;
  end if;

  -- Acciones con nombre propio para que la auditoría se lea fácil.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      v_action := case new.status
        when 'active'   then case when old.status = 'inactive' then 'member_reactivated' else 'member_approved' end
        when 'rejected' then 'member_rejected'
        when 'inactive' then 'member_deactivated'
        else 'member_status_changed' end;
    elsif old.role is distinct from new.role then
      v_action := 'role_changed';
    end if;
  end if;

  insert into public.audit_log (actor_id, entity, entity_id, action, old_values, new_values, reason)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(v_new->>'id', v_old->>'id'),
    v_action,
    v_old,
    v_new,
    nullif(current_setting('app.audit_reason', true), '')
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row();

create trigger audit_group_settings
  after update on public.group_settings
  for each row execute function public.audit_row();


-- -----------------------------------------------------------------------------
-- 9. PROTECCIÓN DE CAMPOS SENSIBLES DEL PERFIL
-- Una integrante puede editar su nombre, apodo y avatar, pero NO su rol, su
-- estado, su username ni su fecha de ingreso. Solo una admin puede.
-- Además: nunca puede quedar el grupo sin ninguna admin activa.
-- -----------------------------------------------------------------------------
create function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();

  -- auth.uid() es null cuando el cambio viene del SQL Editor o del servidor con
  -- service_role: en ese caso se permite (es la dueña del proyecto o el sistema).
  if auth.uid() is not null and not public.is_admin() then
    if new.role       is distinct from old.role
    or new.status     is distinct from old.status
    or new.username   is distinct from old.username
    or new.joined_at  is distinct from old.joined_at then
      raise exception 'No tenés permiso para modificar rol, estado, username o fecha de ingreso'
        using errcode = '42501';
    end if;
  end if;

  -- Al aprobar por primera vez, se fija la fecha de ingreso.
  if new.status = 'active' and old.status = 'pending' and new.joined_at is null then
    new.joined_at := now();
  end if;

  -- No dejar el grupo sin admins.
  if old.role = 'admin' and old.status = 'active'
     and (new.role <> 'admin' or new.status <> 'active')
     and not exists (
       select 1 from public.profiles
       where id <> old.id and role = 'admin' and status = 'active'
     ) then
    raise exception 'Tiene que quedar al menos una administradora activa';
  end if;

  return new;
end;
$$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();


-- -----------------------------------------------------------------------------
-- 10. ACCIONES DE ADMINISTRACIÓN (con motivo para la auditoría)
-- -----------------------------------------------------------------------------
create function public.admin_set_member_status(
  p_member uuid, p_status public.member_status, p_reason text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo una administradora puede hacer esto' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);
  update public.profiles set status = p_status where id = p_member;
  if not found then raise exception 'Integrante inexistente'; end if;
end;
$$;

create function public.admin_set_member_role(
  p_member uuid, p_role public.member_role, p_reason text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo una administradora puede hacer esto' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);
  update public.profiles set role = p_role where id = p_member;
  if not found then raise exception 'Integrante inexistente'; end if;
end;
$$;

revoke execute on function public.admin_set_member_status(uuid, public.member_status, text) from public, anon;
revoke execute on function public.admin_set_member_role(uuid, public.member_role, text)     from public, anon;
grant  execute on function public.admin_set_member_status(uuid, public.member_status, text) to authenticated;
grant  execute on function public.admin_set_member_role(uuid, public.member_role, text)     to authenticated;


-- -----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS)
-- Con RLS activado, una tabla no devuelve NINGUNA fila salvo que una "policy"
-- lo permita. Es la barrera real de seguridad: vale aunque alguien llame a la
-- API directamente sin pasar por la app.
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.currencies     enable row level security;
alter table public.group_settings enable row level security;
alter table public.audit_log      enable row level security;

-- PROFILES
-- Cada una ve siempre su propio perfil (para saber si está pendiente).
create policy "ver mi perfil" on public.profiles
  for select to authenticated using (id = auth.uid());

-- Las integrantes activas ven a las demás activas e inactivas (el historial
-- muestra a quienes ya no están). Las admins ven también pendientes y rechazadas.
create policy "integrantes ven al grupo" on public.profiles
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_active_member() and status in ('active', 'inactive'))
  );

-- Cada una edita su perfil (el trigger del punto 9 bloquea los campos sensibles).
create policy "editar mi perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Las admins editan cualquier perfil.
create policy "admins editan perfiles" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Nadie inserta ni borra perfiles desde la app: los crea el trigger de registro
-- y nunca se borran (desactivar ≠ borrar).

-- CURRENCIES y GROUP_SETTINGS: lectura para integrantes activas; edición solo admins.
create policy "leer monedas" on public.currencies
  for select to authenticated using (public.is_active_member());
create policy "admins gestionan monedas" on public.currencies
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "leer configuración" on public.group_settings
  for select to authenticated using (public.is_active_member());
create policy "admins editan configuración" on public.group_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- AUDIT_LOG: solo admins leen. No hay policy de insert/update/delete:
-- las filas las escribe únicamente el trigger (security definer).
create policy "admins leen auditoría" on public.audit_log
  for select to authenticated using (public.is_admin());

-- Cinturón y tiradores: quitamos permisos de escritura sobre la auditoría.
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
-- Las visitantes sin sesión (anon) no tocan ninguna tabla.
revoke all on public.profiles, public.currencies, public.group_settings, public.audit_log from anon;


-- -----------------------------------------------------------------------------
-- 12. STORAGE: AVATARES
-- Bucket PRIVADO (public = false): las imágenes solo se ven con URLs firmadas.
-- Cada usuaria guarda su avatar en la carpeta con su id: avatars/<su-id>/foto.webp
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152,                       -- 2 MB
        array['image/jpeg', 'image/png', 'image/webp']);

-- Cualquiera logueada (incluso pendiente) sube/cambia/borra SU avatar.
create policy "subir mi avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cambiar mi avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "borrar mi avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Ver avatares: el propio siempre; los demás solo si sos integrante activa.
create policy "ver avatares" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_active_member())
  );

-- Fin de la migración 0001.
