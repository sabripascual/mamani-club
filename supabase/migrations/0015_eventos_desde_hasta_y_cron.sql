-- =============================================================================
-- MAMANÍ CLUB · Migración 0015 · Eventos "desde / hasta" y registro del cron
--
-- 1. Eventos como en el calendario del teléfono: desde (fecha + hora) y hasta (fecha +
--    hora). Pueden durar varios días (un viaje), también los de "todo el día". El fin
--    tiene que ser igual o posterior al inicio.
--      - todo el día: starts_at = 00:00 del primer día, ends_at = 23:59 del último.
-- 2. cron_runs: cada corrida de los avisos automáticos queda registrada (cuándo, qué
--    mandó, o por qué falló) y se ve en el panel de notificaciones.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. EVENTOS DESDE / HASTA
-- -----------------------------------------------------------------------------
alter table public.events drop constraint events_ends_after_start;
alter table public.events drop constraint events_all_day_no_end;
alter table public.events add constraint events_ends_not_before_start check (ends_at is null or ends_at >= starts_at);

create or replace function public.create_event(
  p_title text, p_starts_at timestamptz, p_type_id uuid, p_location text default null, p_description text default null,
  p_all_day boolean default false, p_ends_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden crear eventos' using errcode = '42501'; end if;
  if not exists (select 1 from public.categories where id = p_type_id and kind = 'juntada') then raise exception 'Tipo inválido'; end if;
  if p_ends_at is not null and p_ends_at < p_starts_at then raise exception 'El evento no puede terminar antes de empezar'; end if;
  insert into public.events (title, starts_at, ends_at, all_day, type_id, location, description, created_by)
  values (trim(p_title), p_starts_at, p_ends_at, coalesce(p_all_day, false), p_type_id,
          nullif(trim(p_location), ''), nullif(trim(p_description), ''), auth.uid())
  returning id into v_id;
  insert into public.event_rsvps (event_id, member_id, response) values (v_id, auth.uid(), 'going');
  return v_id;
end $$;

create or replace function public.update_event(
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
  if p_ends_at is not null and p_ends_at < p_starts_at then raise exception 'El evento no puede terminar antes de empezar'; end if;
  update public.events set title = trim(p_title), starts_at = p_starts_at, ends_at = p_ends_at,
    all_day = coalesce(p_all_day, false), type_id = p_type_id,
    location = nullif(trim(p_location), ''), description = nullif(trim(p_description), ''), updated_at = now()
  where id = p_event_id;
end $$;

-- -----------------------------------------------------------------------------
-- 2. REGISTRO DE CORRIDAS DEL CRON
-- -----------------------------------------------------------------------------
create table public.cron_runs (
  id        bigint generated always as identity primary key,
  job       text not null,                 -- 'diario' (10:00) | 'manana' (8:00) | 'manual'
  ran_at    timestamptz not null default now(),
  ok        boolean not null,
  planned   int not null default 0,        -- avisos que tocaba mandar
  sent      int not null default 0,        -- avisos que llegaron a algún dispositivo
  detail    text                           -- motivo si falló (sin datos personales)
);
create index cron_runs_ran_at_idx on public.cron_runs (ran_at desc);
alter table public.cron_runs enable row level security;
create policy "admins ven las corridas" on public.cron_runs for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.cron_runs from anon, authenticated;
revoke all on public.cron_runs from anon;

commit;

-- Fin de la migración 0015.
