-- =============================================================================
-- MAMANÍ CLUB · Migración 0009 · Calendario, eventos y panel de notificaciones
--
--  1. Borrar categorías/subcategorías que nunca se usaron (admins).
--  2. Ubicación en las juntadas.
--  3. Eventos del calendario con asistencia (Voy / Tal vez / No voy) y conversión
--     a juntada (1 evento = 1 juntada).
--  4. Feriados argentinos (los carga el servidor desde una API pública).
--  5. Mensajes de notificación editables por admins (frases semanales, saludos de
--     cumpleaños) y registro de envíos para eventos, cumpleaños y envíos manuales.
-- =============================================================================

-- Los valores nuevos de un enum no se pueden usar dentro de la misma transacción
-- en que se crean, por eso van antes del "begin".
alter type public.notification_kind add value if not exists 'event';
alter type public.notification_kind add value if not exists 'birthday';
alter type public.notification_kind add value if not exists 'birthday_week';
alter type public.notification_kind add value if not exists 'weekly';
alter type public.notification_kind add value if not exists 'broadcast';

begin;

-- -----------------------------------------------------------------------------
-- 1. BORRAR CATEGORÍAS SIN USO
-- -----------------------------------------------------------------------------
create function public.admin_delete_category(p_category_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.categories;
begin
  if not public.is_admin() then raise exception 'Solo una administradora puede hacer esto' using errcode = '42501'; end if;
  select * into v from public.categories where id = p_category_id;
  if not found then raise exception 'La categoría no existe'; end if;
  if v.code is not null then
    raise exception 'Esta categoría la usan los rankings: se puede renombrar o archivar, pero no borrar';
  end if;
  if exists (select 1 from public.categories where parent_id = p_category_id) then
    raise exception 'Primero borrá o mové sus subcategorías';
  end if;
  if exists (select 1 from public.expenses where category_id = p_category_id or subcategory_id = p_category_id)
     or exists (select 1 from public.juntadas where type_id = p_category_id) then
    raise exception 'Ya se usó en juntadas o gastos: archivala para ocultarla sin perder el historial';
  end if;
  delete from public.categories where id = p_category_id;   -- el trigger de auditoría registra el borrado
end $$;
revoke execute on function public.admin_delete_category(uuid) from public, anon;
grant execute on function public.admin_delete_category(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. UBICACIÓN EN JUNTADAS
-- -----------------------------------------------------------------------------
alter table public.juntadas add column location text check (location is null or length(trim(location)) between 1 and 200);

drop function public.create_juntada(text, date, uuid, uuid[], text);
create function public.create_juntada(
  p_title text, p_occurred_on date, p_type_id uuid, p_attendees uuid[] default '{}', p_description text default null, p_location text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden crear juntadas' using errcode = '42501'; end if;
  if p_occurred_on is null then raise exception 'La fecha de la juntada es obligatoria'; end if;
  if not exists (select 1 from public.categories where id = p_type_id and kind = 'juntada') then raise exception 'Tipo de juntada inválido'; end if;
  perform public.assert_members(coalesce(p_attendees, '{}'));
  insert into public.juntadas (title, occurred_on, type_id, description, location, created_by)
  values (trim(p_title), p_occurred_on, p_type_id, nullif(trim(p_description), ''), nullif(trim(p_location), ''), auth.uid())
  returning id into v_id;
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select v_id, m, auth.uid() from unnest(array_append(coalesce(p_attendees, '{}'), auth.uid())) m
  on conflict do nothing;
  perform public.write_audit('juntadas', v_id, 'juntada_created', null, public.juntada_snapshot(v_id));
  return v_id;
end $$;

drop function public.update_juntada(uuid, text, date, uuid, text, text);
create function public.update_juntada(
  p_juntada_id uuid, p_title text, p_occurred_on date, p_type_id uuid, p_description text default null, p_reason text default null, p_location text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.juntadas; v_before jsonb;
begin
  select * into v from public.juntadas where id = p_juntada_id for update;
  if not found or v.status <> 'active' then raise exception 'La juntada no existe o está anulada'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.created_by = auth.uid())) then
    raise exception 'Solo quien creó la juntada o una admin puede editarla' using errcode = '42501';
  end if;
  if not exists (select 1 from public.categories where id = p_type_id and kind = 'juntada') then raise exception 'Tipo de juntada inválido'; end if;
  v_before := public.juntada_snapshot(p_juntada_id);
  update public.juntadas set title = trim(p_title), occurred_on = p_occurred_on, type_id = p_type_id,
    description = nullif(trim(p_description), ''), location = nullif(trim(p_location), ''), updated_at = now() where id = p_juntada_id;
  update public.expenses set occurred_on = p_occurred_on where juntada_id = p_juntada_id;
  perform public.write_audit('juntadas', p_juntada_id, 'juntada_updated', v_before, public.juntada_snapshot(p_juntada_id), p_reason);
end $$;


-- -----------------------------------------------------------------------------
-- 3. EVENTOS DEL CALENDARIO
-- -----------------------------------------------------------------------------
create type public.rsvp_response as enum ('going', 'maybe', 'no');

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) between 1 and 80),
  starts_at    timestamptz not null,
  type_id      uuid not null references public.categories(id),
  location     text check (location is null or length(trim(location)) between 1 and 200),
  description  text check (description is null or length(description) <= 500),
  created_by   uuid not null references public.profiles(id),
  status       text not null default 'active' check (status in ('active', 'cancelled')),
  juntada_id   uuid unique references public.juntadas(id),   -- 1 evento = 1 juntada
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index events_starts_idx on public.events (starts_at) where status = 'active';

create table public.event_rsvps (
  event_id   uuid not null references public.events(id),
  member_id  uuid not null references public.profiles(id),
  response   public.rsvp_response not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create trigger audit_events after insert or update on public.events
  for each row execute function public.audit_row();

-- Crear evento (cualquier integrante activa). La creadora queda como "Voy".
create function public.create_event(
  p_title text, p_starts_at timestamptz, p_type_id uuid, p_location text default null, p_description text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden crear eventos' using errcode = '42501'; end if;
  if not exists (select 1 from public.categories where id = p_type_id and kind = 'juntada') then raise exception 'Tipo inválido'; end if;
  insert into public.events (title, starts_at, type_id, location, description, created_by)
  values (trim(p_title), p_starts_at, p_type_id, nullif(trim(p_location), ''), nullif(trim(p_description), ''), auth.uid())
  returning id into v_id;
  insert into public.event_rsvps (event_id, member_id, response) values (v_id, auth.uid(), 'going');
  return v_id;
end $$;

-- Editar (creadora o admin).
create function public.update_event(
  p_event_id uuid, p_title text, p_starts_at timestamptz, p_type_id uuid, p_location text default null, p_description text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.events;
begin
  select * into v from public.events where id = p_event_id for update;
  if not found or v.status <> 'active' then raise exception 'El evento no existe o fue cancelado'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.created_by = auth.uid())) then
    raise exception 'Solo quien creó el evento o una admin puede editarlo' using errcode = '42501';
  end if;
  if not exists (select 1 from public.categories where id = p_type_id and kind = 'juntada') then raise exception 'Tipo inválido'; end if;
  update public.events set title = trim(p_title), starts_at = p_starts_at, type_id = p_type_id,
    location = nullif(trim(p_location), ''), description = nullif(trim(p_description), ''), updated_at = now()
  where id = p_event_id;
end $$;

-- Eliminar (= cancelar, queda en la auditoría). Solo si su juntada no tiene gastos.
create function public.cancel_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.events;
begin
  select * into v from public.events where id = p_event_id for update;
  if not found or v.status <> 'active' then raise exception 'El evento no existe o ya fue cancelado'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.created_by = auth.uid())) then
    raise exception 'Solo quien creó el evento o una admin puede eliminarlo' using errcode = '42501';
  end if;
  if v.juntada_id is not null and exists (select 1 from public.expenses where juntada_id = v.juntada_id and status = 'active') then
    raise exception 'El evento ya tiene gastos cargados: no se puede eliminar';
  end if;
  update public.events set status = 'cancelled', updated_at = now() where id = p_event_id;
  if v.juntada_id is not null then
    update public.juntadas set status = 'void', void_reason = 'Evento eliminado', updated_at = now() where id = v.juntada_id and status = 'active';
  end if;
end $$;

-- Responder (cualquier integrante activa).
create function public.rsvp_event(p_event_id uuid, p_response public.rsvp_response)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = p_event_id and status = 'active') then raise exception 'El evento no existe'; end if;
  insert into public.event_rsvps (event_id, member_id, response) values (p_event_id, auth.uid(), p_response)
  on conflict (event_id, member_id) do update set response = excluded.response, updated_at = now();
  -- Si ya es juntada y confirma, queda como asistente.
  if p_response = 'going' then
    insert into public.juntada_attendees (juntada_id, member_id, added_by)
    select e.juntada_id, auth.uid(), auth.uid() from public.events e
    where e.id = p_event_id and e.juntada_id is not null
    on conflict do nothing;
  end if;
end $$;

-- Convertir en juntada (creadora o admin). Asistentes = las que dijeron "Voy".
create function public.convert_event_to_juntada(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.events; v_id uuid;
begin
  select * into v from public.events where id = p_event_id for update;
  if not found or v.status <> 'active' then raise exception 'El evento no existe o fue cancelado'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.created_by = auth.uid())) then
    raise exception 'Solo quien creó el evento o una admin puede convertirlo' using errcode = '42501';
  end if;
  if v.juntada_id is not null then return v.juntada_id; end if;
  insert into public.juntadas (title, occurred_on, type_id, description, location, created_by)
  values (v.title, (v.starts_at at time zone 'America/Argentina/Buenos_Aires')::date, v.type_id, v.description, v.location, auth.uid())
  returning id into v_id;
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select v_id, r.member_id, auth.uid() from public.event_rsvps r where r.event_id = p_event_id and r.response = 'going'
  on conflict do nothing;
  insert into public.juntada_attendees (juntada_id, member_id, added_by) values (v_id, auth.uid(), auth.uid()) on conflict do nothing;
  update public.events set juntada_id = v_id, updated_at = now() where id = p_event_id;
  perform public.write_audit('juntadas', v_id, 'juntada_created', null, public.juntada_snapshot(v_id), 'Desde el evento del calendario');
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_juntada(text, date, uuid, uuid[], text, text)',
    'public.update_juntada(uuid, text, date, uuid, text, text, text)',
    'public.create_event(text, timestamptz, uuid, text, text)',
    'public.update_event(uuid, text, timestamptz, uuid, text, text)',
    'public.cancel_event(uuid)',
    'public.rsvp_event(uuid, public.rsvp_response)',
    'public.convert_event_to_juntada(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 4. FERIADOS
-- -----------------------------------------------------------------------------
create table public.holidays (
  day   date not null,
  name  text not null,
  kind  text,
  primary key (day, name)
);


-- -----------------------------------------------------------------------------
-- 5. MENSAJES DE NOTIFICACIÓN (panel de admin)
-- -----------------------------------------------------------------------------
create table public.notification_messages (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('weekly', 'birthday', 'birthday_week')),
  title       text not null check (length(trim(title)) between 1 and 80),
  body        text not null check (length(trim(body)) between 1 and 200),
  active      boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create trigger audit_notification_messages after insert or update or delete on public.notification_messages
  for each row execute function public.audit_row();

-- {nombre} se reemplaza por el nombre de la cumpleañera.
insert into public.notification_messages (kind, title, body) values
  ('birthday_week', '¡La semana que viene cumple años {nombre}!', 'Vayan pensando el regalo 🎁'),
  ('birthday', '¡Feliz cumple!', '{nombre} cumple años hoy, saluden a la perrita!');

-- Registro de envíos: referencia genérica (evento, cumpleañera o mensaje).
alter table public.notification_log add column ref_id uuid;
drop index public.notification_log_once_per_day;
create unique index notification_log_once_per_day
  on public.notification_log (kind, member_id, juntada_id, ref_id, sent_on) nulls not distinct;


-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.events                enable row level security;
alter table public.event_rsvps           enable row level security;
alter table public.holidays              enable row level security;
alter table public.notification_messages enable row level security;

create policy "leer eventos" on public.events for select to authenticated using (public.is_active_member());
create policy "leer respuestas" on public.event_rsvps for select to authenticated using (public.is_active_member());
create policy "leer feriados" on public.holidays for select to authenticated using (public.is_active_member());
create policy "admins leen mensajes" on public.notification_messages for select to authenticated using (public.is_admin());
create policy "admins crean mensajes" on public.notification_messages for insert to authenticated with check (public.is_admin());
create policy "admins editan mensajes" on public.notification_messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins borran mensajes" on public.notification_messages for delete to authenticated using (public.is_admin());
-- Las admins ven todo el historial de envíos (para el panel).
create policy "admins ven el historial de notificaciones" on public.notification_log for select to authenticated using (public.is_admin());

revoke insert, update, delete, truncate on public.events, public.event_rsvps, public.holidays from anon, authenticated;
revoke all on public.events, public.event_rsvps, public.holidays, public.notification_messages from anon;

commit;

-- Fin de la migración 0009.
