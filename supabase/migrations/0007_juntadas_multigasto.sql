-- =============================================================================
-- MAMANÍ CLUB · Migración 0007 · Juntadas con varios gastos (estilo Tricount)
--
-- Antes: cada gasto ERA una juntada, con una sola pagadora, y las deudas se
--        pagaban parte por parte.
-- Ahora: una JUNTADA (el encuentro) tiene ASISTENTES y uno o más GASTOS. Cada
--        gasto tiene su pagadora y sus participantes. Las deudas se saldan con
--        TRANSFERENCIAS netas dentro de la juntada (la app sugiere cuáles).
--
-- Saldo neto de cada una en una juntada =
--     lo que pagó en gastos − su consumo + lo que transfirió − lo que recibió
--   > 0: le deben · < 0: debe · 0: está al día.
--
-- Migración de datos: cada gasto existente pasa a ser una juntada con EL MISMO id
-- (así no se rompen links, fotos ni notificaciones) que contiene ese único gasto.
-- Los pagos existentes pasan a ser transferencias. Al final se verifica que los
-- saldos de todas queden exactamente iguales que antes.
--
-- ANTES DE CORRERLA: hacer el backup (ver supabase/scripts/backup-antes-0007.md).
--
-- Todo corre en UNA transacción: si algo falla (incluida la verificación final),
-- no se aplica ningún cambio.
-- =============================================================================

begin;


-- -----------------------------------------------------------------------------
-- 0. FOTO DE LOS SALDOS ACTUALES (para verificar al final)
-- -----------------------------------------------------------------------------
create temp table _antes as
select expense_id, member_id, outstanding_cents
from public.v_share_balances
where outstanding_cents <> 0;


-- -----------------------------------------------------------------------------
-- 1. CATEGORÍAS: tipos de juntada y categorías de gasto
-- -----------------------------------------------------------------------------
alter table public.categories add column kind text not null default 'gasto'
  check (kind in ('gasto', 'juntada'));
alter table public.categories drop constraint categories_parent_id_name_key;
create unique index categories_kind_parent_name_key on public.categories (kind, parent_id, name) nulls not distinct;

insert into public.categories (kind, code, name, icon, sort_order) values
  ('juntada', 'j_casa',          'Juntada en casa',          'home',         1),
  ('juntada', 'j_salida',        'Salida / boliche',         'party-popper', 2),
  ('juntada', 'j_bar',           'Bar / restaurante',        'wine',         3),
  ('juntada', 'j_cumple',        'Cumpleaños / celebración', 'cake',         4),
  ('juntada', 'j_deportes',      'Deportes',                 'trophy',       5),
  ('juntada', 'j_tercer_tiempo', 'Tercer tiempo',            'beer',         6),
  ('juntada', 'j_viaje',         'Viaje / escapada',         'plane',        7),
  ('juntada', 'j_otro',          'Otro',                     'sparkles',     8);

-- Un tipo de juntada no tiene subcategorías; una subcategoría es del mismo tipo que su madre.
create or replace function public.guard_category_depth()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.parent_id is not null then
    if exists (select 1 from public.categories where id = new.parent_id and parent_id is not null) then
      raise exception 'Las subcategorías no pueden tener subcategorías';
    end if;
    if (select kind from public.categories where id = new.parent_id) <> new.kind then
      raise exception 'La subcategoría tiene que ser del mismo tipo que su categoría';
    end if;
    if new.kind = 'juntada' then
      raise exception 'Los tipos de juntada no tienen subcategorías';
    end if;
  end if;
  return new;
end $$;


-- -----------------------------------------------------------------------------
-- 2. JUNTADAS, ASISTENTES Y TRANSFERENCIAS
-- -----------------------------------------------------------------------------
create table public.juntadas (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) between 1 and 80),
  occurred_on  date not null,
  type_id      uuid not null references public.categories(id),
  description  text check (description is null or length(description) <= 500),
  currency     char(3) not null default 'ARS' references public.currencies(code),
  created_by   uuid not null references public.profiles(id),
  status       public.record_status not null default 'active',
  void_reason  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index juntadas_occurred_idx on public.juntadas (occurred_on desc) where status = 'active';

create table public.juntada_attendees (
  juntada_id  uuid not null references public.juntadas(id),
  member_id   uuid not null references public.profiles(id),
  added_by    uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  primary key (juntada_id, member_id)
);
create index juntada_attendees_member_idx on public.juntada_attendees (member_id);

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  juntada_id   uuid not null references public.juntadas(id),
  from_member  uuid not null references public.profiles(id),
  to_member    uuid not null references public.profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency     char(3) not null references public.currencies(code),
  paid_on      date not null,
  alias        text check (alias is null or length(alias) <= 60),
  note         text check (note is null or length(note) <= 200),
  status       public.record_status not null default 'active',
  void_reason  text,
  voided_by    uuid references public.profiles(id),
  voided_at    timestamptz,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  check (from_member <> to_member)
);
create index settlements_juntada_idx on public.settlements (juntada_id) where status = 'active';

alter table public.expenses add column juntada_id uuid references public.juntadas(id);


-- -----------------------------------------------------------------------------
-- 3. MIGRACIÓN DE DATOS
-- -----------------------------------------------------------------------------
-- 3.1 Tipo de juntada a partir de la categoría (y subcategoría) del gasto viejo.
create temp table _tipo as
select e.id as expense_id,
  coalesce(
    case
      when sub.code = 'tercer_tiempo'                       then (select id from public.categories where code = 'j_tercer_tiempo')
      when sub.name in ('Restaurantes', 'Bares')            then (select id from public.categories where code = 'j_bar')
      when sub.name in ('Cumpleaños')                       then (select id from public.categories where code = 'j_cumple')
    end,
    case cat.code
      when 'comida'        then (select id from public.categories where code = 'j_casa')
      when 'bebidas'       then (select id from public.categories where code = 'j_casa')
      when 'fiestas'       then (select id from public.categories where code = 'j_salida')
      when 'deportes'      then (select id from public.categories where code = 'j_deportes')
      when 'celebraciones' then (select id from public.categories where code = 'j_cumple')
      when 'viajes'        then (select id from public.categories where code = 'j_viaje')
    end,
    (select id from public.categories where code = 'j_otro')
  ) as type_id
from public.expenses e
join public.categories cat on cat.id = e.category_id
left join public.categories sub on sub.id = e.subcategory_id;

-- 3.2 Una juntada por gasto, con el MISMO id.
insert into public.juntadas (id, title, occurred_on, type_id, description, currency, created_by, status, void_reason, created_at, updated_at)
select e.id, e.title, e.occurred_on, t.type_id, e.description, e.currency, e.created_by, e.status, e.void_reason, e.created_at, e.updated_at
from public.expenses e join _tipo t on t.expense_id = e.id;

update public.expenses set juntada_id = id;
alter table public.expenses alter column juntada_id set not null;
create index expenses_juntada_idx on public.expenses (juntada_id);

-- 3.3 Asistentes = participantes.
insert into public.juntada_attendees (juntada_id, member_id, added_by, created_at)
select s.expense_id, s.member_id, e.created_by, e.created_at
from public.expense_shares s join public.expenses e on e.id = s.expense_id
where s.is_participant
on conflict do nothing;

-- 3.4 Pagos → transferencias (con su estado; los reintegros ya vienen con from/to invertidos).
insert into public.settlements (id, juntada_id, from_member, to_member, amount_cents, currency, paid_on, note,
                                status, void_reason, voided_by, voided_at, created_by, created_at)
select p.id, p.expense_id, p.from_member, p.to_member, p.amount_cents, p.currency, p.paid_on, p.note,
       p.status, p.void_reason, p.voided_by, p.voided_at, p.created_by, p.created_at
from public.payments p;

-- 3.5 Fotos: pasan a colgar de la juntada (mismo id, así las rutas en Storage no cambian).
alter table public.photos drop constraint photos_expense_id_fkey;
alter table public.photos rename column expense_id to juntada_id;
alter table public.photos add constraint photos_juntada_id_fkey foreign key (juntada_id) references public.juntadas(id);

-- 3.6 Registro de notificaciones: de la juntada.
drop index public.notification_log_once_per_day;
alter table public.notification_log drop constraint notification_log_expense_id_fkey;
alter table public.notification_log rename column expense_id to juntada_id;
alter table public.notification_log add constraint notification_log_juntada_id_fkey foreign key (juntada_id) references public.juntadas(id);
create unique index notification_log_once_per_day
  on public.notification_log (kind, member_id, juntada_id, sent_on) nulls not distinct;


-- -----------------------------------------------------------------------------
-- 4. CÁLCULO DE SALDOS (vistas y funciones de lectura)
-- -----------------------------------------------------------------------------
-- Se reemplazan las vistas del modelo anterior.
drop view public.v_member_balances;
drop view public.v_debts;
drop view public.v_expense_status;
drop view public.v_share_balances;
drop view public.v_photo_stats;

-- Saldo neto por juntada e integrante.
create view public.v_juntada_member_balances with (security_invoker = true) as
with movs as (
  -- lo que pagó en gastos
  select e.juntada_id, e.paid_by as member_id, e.amount_cents as paid, 0::bigint as consumed, 0::bigint as sent, 0::bigint as received
  from public.expenses e where e.status = 'active'
  union all
  -- su consumo
  select e.juntada_id, s.member_id, 0, s.amount_cents, 0, 0
  from public.expense_shares s join public.expenses e on e.id = s.expense_id and e.status = 'active'
  union all
  -- transferencias hechas y recibidas
  select t.juntada_id, t.from_member, 0, 0, t.amount_cents, 0 from public.settlements t where t.status = 'active'
  union all
  select t.juntada_id, t.to_member, 0, 0, 0, t.amount_cents from public.settlements t where t.status = 'active'
)
select m.juntada_id, m.member_id, j.currency,
       sum(m.paid)::bigint     as paid_cents,
       sum(m.consumed)::bigint as consumed_cents,
       sum(m.sent)::bigint     as sent_cents,
       sum(m.received)::bigint as received_cents,
       (sum(m.paid) - sum(m.consumed) + sum(m.sent) - sum(m.received))::bigint as net_cents
from movs m
join public.juntadas j on j.id = m.juntada_id and j.status = 'active'
group by m.juntada_id, m.member_id, j.currency;

-- Transferencias sugeridas de UNA juntada: la que más debe le paga a la que más le
-- deben, hasta dejar todo en cero (mínima cantidad de transferencias, determinística:
-- a igual monto gana el id menor). Sin tablas temporales: las lecturas de la API
-- corren en transacciones de solo lectura.
create function public.juntada_transfers(p_juntada uuid)
returns table (from_member uuid, to_member uuid, amount_cents bigint)
language plpgsql stable set search_path = ''
as $$
declare
  ids uuid[]; nets bigint[]; n int; i int; di int; ci int; pay bigint;
begin
  select array_agg(b.member_id order by b.member_id), array_agg(b.net_cents order by b.member_id)
    into ids, nets
  from public.v_juntada_member_balances b
  where b.juntada_id = p_juntada and b.net_cents <> 0;
  if ids is null then return; end if;
  n := array_length(ids, 1);
  loop
    di := null; ci := null;
    for i in 1..n loop
      if nets[i] < 0 and (di is null or nets[i] < nets[di]) then di := i; end if;
      if nets[i] > 0 and (ci is null or nets[i] > nets[ci]) then ci := i; end if;
    end loop;
    exit when di is null or ci is null;
    pay := least(-nets[di], nets[ci]);
    from_member := ids[di]; to_member := ids[ci]; amount_cents := pay;
    return next;
    nets[di] := nets[di] + pay;
    nets[ci] := nets[ci] - pay;
  end loop;
end $$;

-- Estado de cada juntada.
create view public.v_juntada_status with (security_invoker = true) as
select j.id as juntada_id,
  coalesce((select sum(e.amount_cents) from public.expenses e where e.juntada_id = j.id and e.status = 'active'), 0)::bigint as total_cents,
  coalesce((select sum(e.base_amount_cents) from public.expenses e where e.juntada_id = j.id and e.status = 'active'), 0)::bigint as total_base_cents,
  (select count(*) from public.expenses e where e.juntada_id = j.id and e.status = 'active') as expenses_count,
  (select count(*) from public.juntada_attendees a where a.juntada_id = j.id) as attendees_count,
  coalesce((select sum(-b.net_cents) from public.v_juntada_member_balances b where b.juntada_id = j.id and b.net_cents < 0), 0)::bigint as pending_cents,
  case
    when not exists (select 1 from public.expenses e where e.juntada_id = j.id and e.status = 'active') then 'empty'
    when not exists (select 1 from public.v_juntada_member_balances b where b.juntada_id = j.id and b.net_cents <> 0) then 'settled'
    when exists (select 1 from public.settlements t where t.juntada_id = j.id and t.status = 'active') then 'partial'
    else 'pending'
  end as settlement_status
from public.juntadas j
where j.status = 'active';

-- Todas las transferencias pendientes (de todas las juntadas activas).
create view public.v_pending_transfers with (security_invoker = true) as
select j.id as juntada_id, j.currency, t.from_member, t.to_member, t.amount_cents
from public.juntadas j
cross join lateral public.juntada_transfers(j.id) t
where j.status = 'active';

-- Resumen por integrante (adelantado y consumo SEPARADOS).
create view public.v_member_balances with (security_invoker = true) as
with b as (
  select member_id, currency,
         sum(paid_cents) as advanced_cents, sum(consumed_cents) as consumed_cents,
         sum(sent_cents) as sent_cents, sum(received_cents) as received_cents
  from public.v_juntada_member_balances group by 1, 2
), owe as (
  select from_member as member_id, currency, sum(amount_cents) as i_owe_cents from public.v_pending_transfers group by 1, 2
), owed as (
  select to_member as member_id, currency, sum(amount_cents) as owed_to_me_cents from public.v_pending_transfers group by 1, 2
), att as (
  select a.member_id, count(*) as juntadas_attended
  from public.juntada_attendees a join public.juntadas j on j.id = a.juntada_id and j.status = 'active' group by 1
), paid as (
  select e.paid_by as member_id, count(*) as times_paid from public.expenses e
  join public.juntadas j on j.id = e.juntada_id and j.status = 'active' where e.status = 'active' group by 1
)
select b.member_id, b.currency,
  b.advanced_cents::bigint, coalesce(paid.times_paid, 0) as times_paid,
  b.consumed_cents::bigint, coalesce(att.juntadas_attended, 0) as expenses_participated,
  coalesce(owed.owed_to_me_cents, 0)::bigint as owed_to_me_cents,
  coalesce(owe.i_owe_cents, 0)::bigint as i_owe_cents,
  b.received_cents::bigint, b.sent_cents::bigint
from b
left join owe  on owe.member_id = b.member_id and owe.currency = b.currency
left join owed on owed.member_id = b.member_id and owed.currency = b.currency
left join att  on att.member_id = b.member_id
left join paid on paid.member_id = b.member_id;

create view public.v_photo_stats with (security_invoker = true) as
select p.id as photo_id, p.juntada_id,
  (select count(*) from public.photo_likes l where l.photo_id = p.id) as likes,
  (select count(*) from public.photo_comments c where c.photo_id = p.id and c.deleted_at is null) as comments
from public.photos p
where p.deleted_at is null;


-- -----------------------------------------------------------------------------
-- 5. FUNCIONES DE ESCRITURA
-- -----------------------------------------------------------------------------
-- Las del modelo anterior se reemplazan.
drop function public.create_expense(text, date, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date);
drop function public.update_expense(uuid, text, date, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date, text);
drop function public.void_expense(uuid, text);
drop function public.mark_share_paid(uuid, text, text, date);
drop function public.void_payment(uuid, text);
drop function public.add_photo(uuid, text, text, int, int, int, int, text);
drop function public.validate_expense_header(uuid, uuid, char, uuid, uuid[]);

create function public.juntada_snapshot(p_juntada uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(j) || jsonb_build_object(
    'attendees', coalesce((select jsonb_agg(a.member_id order by a.member_id) from public.juntada_attendees a where a.juntada_id = j.id), '[]'::jsonb))
  from public.juntadas j where j.id = p_juntada;
$$;
revoke execute on function public.juntada_snapshot(uuid) from public, anon, authenticated;

-- ¿Integrantes válidas? (activas o desactivadas, para poder cargar juntadas pasadas)
create function public.assert_members(p_members uuid[])
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(p_members) m
             where not exists (select 1 from public.profiles where id = m and status in ('active', 'inactive'))) then
    raise exception 'Hay integrantes inválidas';
  end if;
end $$;
revoke execute on function public.assert_members(uuid[]) from public, anon, authenticated;

-- 5.1 Crear juntada (la creadora queda como asistente).
create function public.create_juntada(
  p_title text, p_occurred_on date, p_type_id uuid, p_attendees uuid[] default '{}', p_description text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden crear juntadas' using errcode = '42501'; end if;
  if p_occurred_on is null then raise exception 'La fecha de la juntada es obligatoria'; end if;
  if not exists (select 1 from public.categories where id = p_type_id and kind = 'juntada') then raise exception 'Tipo de juntada inválido'; end if;
  perform public.assert_members(coalesce(p_attendees, '{}'));
  insert into public.juntadas (title, occurred_on, type_id, description, created_by)
  values (trim(p_title), p_occurred_on, p_type_id, nullif(trim(p_description), ''), auth.uid())
  returning id into v_id;
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select v_id, m, auth.uid() from unnest(array_append(coalesce(p_attendees, '{}'), auth.uid())) m
  on conflict do nothing;
  perform public.write_audit('juntadas', v_id, 'juntada_created', null, public.juntada_snapshot(v_id));
  return v_id;
end $$;

-- 5.2 Editar datos de la juntada (creadora o admin). Los gastos siguen la fecha.
create function public.update_juntada(
  p_juntada_id uuid, p_title text, p_occurred_on date, p_type_id uuid, p_description text default null, p_reason text default null
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
    description = nullif(trim(p_description), ''), updated_at = now() where id = p_juntada_id;
  update public.expenses set occurred_on = p_occurred_on where juntada_id = p_juntada_id;
  perform public.write_audit('juntadas', p_juntada_id, 'juntada_updated', v_before, public.juntada_snapshot(p_juntada_id), p_reason);
end $$;

-- 5.3 Sumarme a una juntada (cualquier integrante activa).
create function public.join_juntada(p_juntada_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas' using errcode = '42501'; end if;
  if not exists (select 1 from public.juntadas where id = p_juntada_id and status = 'active') then raise exception 'La juntada no existe'; end if;
  insert into public.juntada_attendees (juntada_id, member_id, added_by) values (p_juntada_id, auth.uid(), auth.uid())
  on conflict do nothing;
end $$;

-- 5.4 Sacar una asistente (ella misma, la creadora o una admin), solo si no está en ningún gasto.
create function public.leave_juntada(p_juntada_id uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.juntadas;
begin
  select * into v from public.juntadas where id = p_juntada_id;
  if not found then raise exception 'La juntada no existe'; end if;
  if not (public.is_admin() or (public.is_active_member() and auth.uid() in (p_member, v.created_by))) then
    raise exception 'No podés sacar a esta asistente' using errcode = '42501';
  end if;
  if exists (select 1 from public.expense_shares s join public.expenses e on e.id = s.expense_id
             where e.juntada_id = p_juntada_id and e.status = 'active' and s.member_id = p_member and s.is_participant)
     or exists (select 1 from public.expenses e where e.juntada_id = p_juntada_id and e.status = 'active' and e.paid_by = p_member) then
    raise exception 'Está en algún gasto de la juntada: primero hay que sacarla de esos gastos';
  end if;
  delete from public.juntada_attendees where juntada_id = p_juntada_id and member_id = p_member;
end $$;

-- 5.5 Anular juntada (creadora o admin) solo si no tiene transferencias registradas.
create function public.void_juntada(p_juntada_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.juntadas; v_before jsonb;
begin
  select * into v from public.juntadas where id = p_juntada_id for update;
  if not found or v.status <> 'active' then raise exception 'La juntada no existe o ya está anulada'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.created_by = auth.uid())) then
    raise exception 'Solo quien creó la juntada o una admin puede anularla' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo de la anulación'; end if;
  if exists (select 1 from public.settlements where juntada_id = p_juntada_id and status = 'active') then
    raise exception 'La juntada tiene transferencias registradas. Deshacelas antes de anularla.';
  end if;
  v_before := public.juntada_snapshot(p_juntada_id);
  update public.juntadas set status = 'void', void_reason = trim(p_reason), updated_at = now() where id = p_juntada_id;
  update public.expenses set status = 'void', void_reason = 'Juntada anulada', updated_at = now() where juntada_id = p_juntada_id and status = 'active';
  perform public.write_audit('juntadas', p_juntada_id, 'juntada_voided', v_before, public.juntada_snapshot(p_juntada_id), p_reason);
end $$;

-- 5.6 Validaciones comunes de un gasto.
create function public.validate_gasto(
  p_juntada uuid, p_category uuid, p_subcategory uuid, p_currency char(3), p_paid_by uuid, p_members uuid[]
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.juntadas where id = p_juntada and status = 'active') then
    raise exception 'La juntada no existe o está anulada';
  end if;
  if not exists (select 1 from public.categories where id = p_category and parent_id is null and kind = 'gasto') then
    raise exception 'Categoría de gasto inválida';
  end if;
  if p_subcategory is not null and not exists (select 1 from public.categories where id = p_subcategory and parent_id = p_category) then
    raise exception 'La subcategoría no corresponde a la categoría';
  end if;
  if p_currency <> (select currency from public.juntadas where id = p_juntada) then
    raise exception 'Todos los gastos de una juntada van en la misma moneda';
  end if;
  if not exists (select 1 from public.currencies where code = p_currency and enabled) then raise exception 'Moneda no habilitada'; end if;
  perform public.assert_members(p_members || p_paid_by);
end $$;
revoke execute on function public.validate_gasto(uuid, uuid, uuid, char, uuid, uuid[]) from public, anon, authenticated;

-- 5.7 Agregar un gasto a una juntada (cualquier integrante activa).
create function public.create_expense(
  p_juntada_id    uuid,
  p_title         text,
  p_category_id   uuid,
  p_amount_cents  bigint,
  p_paid_by       uuid,
  p_participants  uuid[]            default null,
  p_split_type    public.split_type default 'equal',
  p_custom_shares jsonb             default null,
  p_subcategory_id uuid             default null,
  p_description   text              default null,
  p_currency      char(3)           default 'ARS',
  p_fx_rate       numeric           default null,
  p_fx_rate_date  date              default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_members uuid[]; v_fx record; v_date date;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden cargar gastos' using errcode = '42501'; end if;
  create temp table _shares on commit drop as
    select * from public.compute_shares(p_amount_cents, p_split_type, p_participants, p_custom_shares);
  select array_agg(member_id) into v_members from _shares;
  perform public.validate_gasto(p_juntada_id, p_category_id, p_subcategory_id, p_currency, p_paid_by, v_members);
  select occurred_on into v_date from public.juntadas where id = p_juntada_id;
  select * into v_fx from public.resolve_fx(p_currency, p_amount_cents, p_fx_rate, p_fx_rate_date, v_date);

  insert into public.expenses (juntada_id, title, occurred_on, category_id, subcategory_id, description, amount_cents, currency,
    base_currency, fx_rate, fx_rate_date, base_amount_cents, paid_by, created_by, split_type)
  values (p_juntada_id, trim(p_title), v_date, p_category_id, p_subcategory_id, nullif(trim(p_description), ''), p_amount_cents, p_currency,
    v_fx.base_currency, v_fx.fx_rate, v_fx.fx_rate_date, v_fx.base_amount_cents, p_paid_by, auth.uid(), p_split_type)
  returning id into v_id;
  insert into public.expense_shares (expense_id, member_id, amount_cents) select v_id, member_id, amount_cents from _shares;
  -- Quienes participan pasan a ser asistentes.
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select p_juntada_id, m, auth.uid() from unnest(v_members) m on conflict do nothing;

  perform public.write_audit('expenses', v_id, 'expense_created', null, public.expense_snapshot(v_id));
  drop table _shares;
  return v_id;
end $$;

-- 5.8 Editar un gasto (quien lo cargó o una admin).
create function public.update_expense(
  p_expense_id    uuid,
  p_title         text,
  p_category_id   uuid,
  p_amount_cents  bigint,
  p_paid_by       uuid,
  p_participants  uuid[]            default null,
  p_split_type    public.split_type default 'equal',
  p_custom_shares jsonb             default null,
  p_subcategory_id uuid             default null,
  p_description   text              default null,
  p_currency      char(3)           default 'ARS',
  p_fx_rate       numeric           default null,
  p_fx_rate_date  date              default null,
  p_reason        text              default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.expenses; v_before jsonb; v_members uuid[]; v_fx record;
begin
  select * into v from public.expenses where id = p_expense_id for update;
  if not found or v.status <> 'active' then raise exception 'El gasto no existe o está anulado'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.created_by = auth.uid())) then
    raise exception 'Solo quien cargó el gasto o una admin puede editarlo' using errcode = '42501';
  end if;
  create temp table _shares on commit drop as
    select * from public.compute_shares(p_amount_cents, p_split_type, p_participants, p_custom_shares);
  select array_agg(member_id) into v_members from _shares;
  perform public.validate_gasto(v.juntada_id, p_category_id, p_subcategory_id, p_currency, p_paid_by, v_members);
  select * into v_fx from public.resolve_fx(p_currency, p_amount_cents, p_fx_rate, p_fx_rate_date, v.occurred_on);

  v_before := public.expense_snapshot(p_expense_id);
  update public.expenses set title = trim(p_title), category_id = p_category_id, subcategory_id = p_subcategory_id,
    description = nullif(trim(p_description), ''), amount_cents = p_amount_cents, currency = p_currency,
    base_currency = v_fx.base_currency, fx_rate = v_fx.fx_rate, fx_rate_date = v_fx.fx_rate_date,
    base_amount_cents = v_fx.base_amount_cents, paid_by = p_paid_by, split_type = p_split_type, updated_at = now()
  where id = p_expense_id;
  -- Las partes se rehacen (los pagos ya no cuelgan de las partes, sino de la juntada).
  delete from public.expense_shares where expense_id = p_expense_id;
  insert into public.expense_shares (expense_id, member_id, amount_cents) select p_expense_id, member_id, amount_cents from _shares;
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select v.juntada_id, m, auth.uid() from unnest(v_members) m on conflict do nothing;

  perform public.write_audit('expenses', p_expense_id, 'expense_updated', v_before, public.expense_snapshot(p_expense_id), p_reason);
  drop table _shares;
end $$;

-- 5.9 Quitar un gasto (quien lo cargó o una admin). Queda anulado en el historial.
create function public.void_expense(p_expense_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.expenses; v_before jsonb;
begin
  select * into v from public.expenses where id = p_expense_id for update;
  if not found or v.status <> 'active' then raise exception 'El gasto no existe o ya está anulado'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.created_by = auth.uid())) then
    raise exception 'Solo quien cargó el gasto o una admin puede quitarlo' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo'; end if;
  v_before := public.expense_snapshot(p_expense_id);
  update public.expenses set status = 'void', void_reason = trim(p_reason), updated_at = now() where id = p_expense_id;
  perform public.write_audit('expenses', p_expense_id, 'expense_voided', v_before, public.expense_snapshot(p_expense_id), p_reason);
end $$;

-- 5.10 Registrar una transferencia sugerida ("Pagado"). Debe coincidir EXACTO con
--      la sugerencia vigente. Solo quien paga, quien recibe o una admin.
create function public.settle_transfer(
  p_juntada_id uuid, p_from uuid, p_to uuid, p_amount_cents bigint, p_alias text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.juntadas; v_id uuid;
begin
  -- Bloqueo de la juntada: dos "Pagado" simultáneos se ordenan (sin duplicados).
  select * into v from public.juntadas where id = p_juntada_id for update;
  if not found or v.status <> 'active' then raise exception 'La juntada no existe o está anulada'; end if;
  if not (public.is_admin() or (public.is_active_member() and auth.uid() in (p_from, p_to))) then
    raise exception 'Solo quien transfiere o quien recibe pueden registrar este pago' using errcode = '42501';
  end if;
  if not exists (select 1 from public.juntada_transfers(p_juntada_id) t
                 where t.from_member = p_from and t.to_member = p_to and t.amount_cents = p_amount_cents) then
    raise exception 'Esta transferencia ya no está pendiente (las cuentas cambiaron). Actualizá la pantalla.';
  end if;
  insert into public.settlements (juntada_id, from_member, to_member, amount_cents, currency, paid_on, alias, created_by)
  values (p_juntada_id, p_from, p_to, p_amount_cents, v.currency, public.today_ar(), nullif(trim(p_alias), ''), auth.uid())
  returning id into v_id;
  perform public.write_audit('settlements', v_id, 'settlement_created', null, (select to_jsonb(s) from public.settlements s where s.id = v_id));
  return v_id;
end $$;

-- 5.11 Deshacer una transferencia (quien pagó, quien recibió, quien la registró o una admin).
create function public.void_settlement(p_settlement_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.settlements;
begin
  select * into v from public.settlements where id = p_settlement_id for update;
  if not found or v.status <> 'active' then raise exception 'La transferencia no existe o ya fue deshecha'; end if;
  if not (public.is_admin() or (public.is_active_member() and auth.uid() in (v.from_member, v.to_member, v.created_by))) then
    raise exception 'No podés deshacer esta transferencia' using errcode = '42501';
  end if;
  update public.settlements set status = 'void', void_reason = nullif(trim(p_reason), ''), voided_by = auth.uid(), voided_at = now()
  where id = p_settlement_id;
  perform public.write_audit('settlements', p_settlement_id, 'settlement_voided', to_jsonb(v),
    (select to_jsonb(s) from public.settlements s where s.id = p_settlement_id), p_reason);
end $$;

-- 5.12 Fotos: ahora se registran en la juntada (misma lógica de carpetas).
create function public.add_photo(
  p_juntada_id uuid, p_storage_path text, p_thumb_path text,
  p_width int, p_height int, p_size_bytes int, p_thumb_size_bytes int, p_mime_type text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_prefix text := p_juntada_id::text || '/' || auth.uid()::text || '/'; v_id uuid;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden subir fotos' using errcode = '42501'; end if;
  if not exists (select 1 from public.juntadas where id = p_juntada_id and status = 'active') then raise exception 'La juntada no existe o está anulada'; end if;
  if left(p_storage_path, length(v_prefix)) <> v_prefix or left(p_thumb_path, length(v_prefix)) <> v_prefix then raise exception 'Ruta de archivo inválida'; end if;
  if (select count(*) from storage.objects where bucket_id = 'photos' and name in (p_storage_path, p_thumb_path)) <> 2 then
    raise exception 'No se encontraron los archivos subidos';
  end if;
  insert into public.photos (juntada_id, uploaded_by, storage_path, thumb_path, width, height, size_bytes, thumb_size_bytes, mime_type)
  values (p_juntada_id, auth.uid(), p_storage_path, p_thumb_path, p_width, p_height, p_size_bytes, p_thumb_size_bytes, p_mime_type)
  returning id into v_id;
  return v_id;
end $$;

drop policy "subir fotos" on storage.objects;
create policy "subir fotos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and public.is_active_member()
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (select 1 from public.juntadas j where j.id::text = (storage.foldername(name))[1] and j.status = 'active')
  );

-- Permisos de ejecución
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_juntada(text, date, uuid, uuid[], text)',
    'public.update_juntada(uuid, text, date, uuid, text, text)',
    'public.join_juntada(uuid)',
    'public.leave_juntada(uuid, uuid)',
    'public.void_juntada(uuid, text)',
    'public.create_expense(uuid, text, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date)',
    'public.update_expense(uuid, text, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date, text)',
    'public.void_expense(uuid, text)',
    'public.settle_transfer(uuid, uuid, uuid, bigint, text)',
    'public.void_settlement(uuid, text)',
    'public.add_photo(uuid, text, text, int, int, int, int, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 6. RLS de las tablas nuevas: leer integrantes activas; escribir solo vía funciones
-- -----------------------------------------------------------------------------
alter table public.juntadas          enable row level security;
alter table public.juntada_attendees enable row level security;
alter table public.settlements       enable row level security;

create policy "leer juntadas (encuentros)" on public.juntadas for select to authenticated using (public.is_active_member());
create policy "leer asistentes" on public.juntada_attendees for select to authenticated using (public.is_active_member());
create policy "leer transferencias" on public.settlements for select to authenticated using (public.is_active_member());

revoke insert, update, delete, truncate on public.juntadas, public.juntada_attendees, public.settlements from anon, authenticated;
revoke all on public.juntadas, public.juntada_attendees, public.settlements from anon;
revoke all on public.v_juntada_member_balances, public.v_juntada_status, public.v_pending_transfers, public.v_member_balances, public.v_photo_stats from anon;

-- La tabla de pagos por parte queda solo como historial (de solo lectura). Se suelta
-- su referencia a las partes, porque al editar un gasto las partes se rehacen.
alter table public.payments drop constraint payments_share_id_fkey;
comment on table public.payments is 'Histórico (modelo anterior a 0007). Los pagos nuevos van en settlements.';


-- -----------------------------------------------------------------------------
-- 7. VERIFICACIÓN: los saldos deben quedar exactamente iguales
--    Antes: cada parte con deuda (deudora → pagadora, + reintegros al revés).
--    Ahora: saldo neto de cada integrante en cada juntada.
-- -----------------------------------------------------------------------------
do $$
declare v_diff int;
begin
  with antes as (
    -- deuda vieja por integrante y juntada (la pagadora recibe la suma de lo que le deben)
    select a.expense_id as juntada_id, a.member_id, -a.outstanding_cents as net from _antes a
    union all
    select a.expense_id, e.paid_by, a.outstanding_cents from _antes a join public.expenses e on e.id = a.expense_id
  ), antes_sum as (
    select juntada_id, member_id, sum(net) as net from antes group by 1, 2 having sum(net) <> 0
  ), ahora as (
    select juntada_id, member_id, net_cents as net from public.v_juntada_member_balances where net_cents <> 0
  )
  select count(*) into v_diff from (
    (select * from antes_sum except select * from ahora)
    union all
    (select * from ahora except select * from antes_sum)
  ) d;
  if v_diff > 0 then
    raise exception 'Verificación fallida: % saldos no coinciden con los anteriores. No se aplicó ningún cambio.', v_diff;
  end if;
  raise notice 'Verificación OK: todos los saldos coinciden con los anteriores.';
end $$;

drop table _antes;
drop table _tipo;

commit;

-- Fin de la migración 0007.
