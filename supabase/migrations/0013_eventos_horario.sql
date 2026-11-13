-- =============================================================================
-- MAMANÍ CLUB · Migración 0013 · Horario de los eventos
--
-- Un evento puede durar todo el día o tener hora de inicio y (opcional) de fin.
--   - all_day = true  → starts_at es las 00:00 (hora AR) del día; sin hora de fin.
--   - ends_at         → hora de fin (opcional); si es antes que el inicio, es al día siguiente.
-- =============================================================================

begin;

alter table public.events
  add column all_day boolean not null default false,
  add column ends_at timestamptz;
alter table public.events add constraint events_ends_after_start check (ends_at is null or ends_at > starts_at);
alter table public.events add constraint events_all_day_no_end check (not all_day or ends_at is null);

drop function public.create_event(text, timestamptz, uuid, text, text);
drop function public.update_event(uuid, text, timestamptz, uuid, text, text);

-- Crear evento (cualquier integrante activa). La creadora queda como "Voy".
create function public.create_event(
  p_title text, p_starts_at timestamptz, p_type_id uuid, p_location text default null, p_description text default null,
  p_all_day boolean default false, p_ends_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden crear eventos' using errcode = '42501'; end if;
  if not exists (select 1 from public.categories where id = p_type_id and kind = 'juntada') then raise exception 'Tipo inválido'; end if;
  if p_ends_at is not null and (p_all_day or p_ends_at <= p_starts_at) then raise exception 'La hora de fin tiene que ser después del inicio'; end if;
  insert into public.events (title, starts_at, ends_at, all_day, type_id, location, description, created_by)
  values (trim(p_title), p_starts_at, case when p_all_day then null else p_ends_at end, coalesce(p_all_day, false), p_type_id,
          nullif(trim(p_location), ''), nullif(trim(p_description), ''), auth.uid())
  returning id into v_id;
  insert into public.event_rsvps (event_id, member_id, response) values (v_id, auth.uid(), 'going');
  return v_id;
end $$;

-- Editar (creadora o admin).
create function public.update_event(
  p_event_id uuid, p_title text, p_starts_at timestamptz, p_type_id uuid, p_location text default null, p_description text default null,
  p_all_day boolean default false, p_ends_at timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.events;
begin
  select * into v from public.events where id = p_event_id for update;
  if not found or v.status <> 'active' then raise exception 'El evento no existe o fue cancelado'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.created_by = auth.uid())) then
    raise exception 'Solo quien creó el evento o una admin puede editarlo' using errcode = '42501';
  end if;
  if not exists (select 1 from public.categories where id = p_type_id and kind = 'juntada') then raise exception 'Tipo inválido'; end if;
  if p_ends_at is not null and (p_all_day or p_ends_at <= p_starts_at) then raise exception 'La hora de fin tiene que ser después del inicio'; end if;
  update public.events set title = trim(p_title), starts_at = p_starts_at, ends_at = case when p_all_day then null else p_ends_at end,
    all_day = coalesce(p_all_day, false), type_id = p_type_id,
    location = nullif(trim(p_location), ''), description = nullif(trim(p_description), ''), updated_at = now()
  where id = p_event_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_event(text, timestamptz, uuid, text, text, boolean, timestamptz)',
    'public.update_event(uuid, text, timestamptz, uuid, text, text, boolean, timestamptz)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

-- Fin de la migración 0013.
