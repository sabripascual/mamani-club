-- =============================================================================
-- MAMANÍ CLUB · Migración 0003 · Gastos (juntadas), divisiones y pagos
--
-- Conceptos (no mezclarlos):
--   expenses        → la juntada: cuánto costó y QUIÉN ADELANTÓ la plata (paid_by).
--   expense_shares  → el CONSUMO de cada participante (su parte).
--   payments        → las DEVOLUCIONES posteriores (deudora → quien adelantó)
--                     y, si una edición dejó a alguien pagando de más, los
--                     REINTEGROS (quien adelantó → deudora).
--
-- Lo que se debe nunca se guarda: se calcula = parte − pagos + reintegros.
-- Las tablas no se escriben directo desde la app: todo pasa por funciones que
-- validan, escriben y auditan en una sola transacción.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. CATEGORÍAS Y SUBCATEGORÍAS
-- Una sola tabla: si parent_id es null es categoría; si no, es subcategoría.
-- "code" es un identificador fijo que usan los rankings (no cambia si se renombra).
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id),
  code        text unique check (code ~ '^[a-z_]+$'),
  name        text not null check (length(trim(name)) between 1 and 40),
  icon        text,                       -- nombre de ícono Lucide (p. ej. 'utensils')
  sort_order  int  not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (parent_id, name)
);

-- Solo se permite un nivel: una subcategoría no puede tener hijas.
create function public.guard_category_depth()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.parent_id is not null and exists (
    select 1 from public.categories where id = new.parent_id and parent_id is not null
  ) then
    raise exception 'Las subcategorías no pueden tener subcategorías';
  end if;
  return new;
end $$;

create trigger guard_category_depth before insert or update on public.categories
  for each row execute function public.guard_category_depth();

create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function public.audit_row();

-- Datos iniciales.
with cats(code, name, icon, ord, subs) as (values
  ('comida',        'Comida',                      'utensils',       1, array['Asados','Delivery','Restaurantes','Picadas','Snacks','Desayunos y meriendas']),
  ('bebidas',       'Bebidas',                     'wine',           2, array['Alcohol','Fernet','Cerveza','Vino','Gaseosas y agua','Hielo']),
  ('fiestas',       'Fiestas y salidas',           'party-popper',   3, array['Entradas','Boliches','Eventos','Bares','After','Mesas y reservas']),
  ('deportes',      'Deportes y terceros tiempos', 'trophy',         4, array['Tercer tiempo','Inscripciones','Canchas','Árbitros','Torneos','Equipamiento']),
  ('transporte',    'Transporte',                  'car',            5, array['Combustible','Uber y taxis','Estacionamiento','Peajes','Traslados']),
  ('celebraciones', 'Celebraciones',               'cake',           6, array['Cumpleaños','Regalos','Despedidas','Festejos','Organización de eventos']),
  ('viajes',        'Viajes y escapadas',          'plane',          7, array['Alojamiento','Alquileres','Excursiones','Compras grupales']),
  ('compras',       'Compras grupales',            'shopping-bag',   8, array['Supermercado','Decoración','Artículos compartidos','Otros'])
),
parents as (
  insert into public.categories (code, name, icon, sort_order)
  select code, name, icon, ord from cats
  returning id, code
)
insert into public.categories (parent_id, name, sort_order, code)
select p.id, s.name, s.ord,
       case when s.name = 'Tercer tiempo' then 'tercer_tiempo' end
from parents p
join cats c on c.code = p.code
cross join lateral unnest(c.subs) with ordinality as s(name, ord);


-- -----------------------------------------------------------------------------
-- 2. TABLAS FINANCIERAS
-- Importes en CENTAVOS (bigint): $120.000,50 se guarda como 12000050.
-- -----------------------------------------------------------------------------
create type public.split_type     as enum ('equal', 'custom');
create type public.record_status  as enum ('active', 'void');
create type public.payment_kind   as enum ('payment', 'refund');

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (length(trim(title)) between 1 and 80),
  occurred_on       date not null,                       -- cuándo fue la juntada
  category_id       uuid not null references public.categories(id),
  subcategory_id    uuid references public.categories(id),
  description       text check (description is null or length(description) <= 500),
  amount_cents      bigint not null check (amount_cents between 1 and 10000000000000),
  currency          char(3) not null references public.currencies(code),
  -- Multidivisa: siempre se guarda el equivalente en moneda base y la cotización usada.
  base_currency     char(3) not null references public.currencies(code),
  fx_rate           numeric(18,8) not null check (fx_rate > 0),
  fx_rate_date      date not null,
  base_amount_cents bigint not null check (base_amount_cents > 0),
  paid_by           uuid not null references public.profiles(id),   -- quién adelantó
  created_by        uuid not null references public.profiles(id),   -- quién lo cargó
  split_type        public.split_type not null default 'equal',
  status            public.record_status not null default 'active',
  void_reason       text,
  created_at        timestamptz not null default now(),             -- cuándo se cargó
  updated_at        timestamptz not null default now()
);

create index expenses_occurred_idx on public.expenses (occurred_on desc) where status = 'active';
create index expenses_category_idx on public.expenses (category_id);
create index expenses_paid_by_idx  on public.expenses (paid_by);

create table public.expense_shares (
  id            uuid primary key default gen_random_uuid(),
  expense_id    uuid not null references public.expenses(id),
  member_id     uuid not null references public.profiles(id),
  amount_cents  bigint not null check (amount_cents >= 0),
  -- false = la sacaron de la juntada después de haber pagado: se conserva la fila
  -- para no perder los pagos, con parte 0 (el sistema calcula el reintegro).
  is_participant boolean not null default true,
  unique (expense_id, member_id)
);

create index expense_shares_member_idx on public.expense_shares (member_id);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  share_id      uuid not null references public.expense_shares(id),
  expense_id    uuid not null references public.expenses(id),
  kind          public.payment_kind not null default 'payment',
  from_member   uuid not null references public.profiles(id),
  to_member     uuid not null references public.profiles(id),
  amount_cents  bigint not null check (amount_cents > 0),
  currency      char(3) not null references public.currencies(code),
  paid_on       date not null,
  method        text check (method is null or length(method) <= 40),
  note          text check (note is null or length(note) <= 200),
  status        public.record_status not null default 'active',
  void_reason   text,
  voided_by     uuid references public.profiles(id),
  voided_at     timestamptz,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  check (from_member <> to_member)
);

create index payments_share_idx   on public.payments (share_id) where status = 'active';
create index payments_expense_idx on public.payments (expense_id);


-- -----------------------------------------------------------------------------
-- 3. VISTAS DE SALDOS (se calculan siempre, nunca se guardan)
-- security_invoker = true → la vista respeta las reglas RLS de quien consulta.
-- -----------------------------------------------------------------------------

-- Una fila por parte: cuánto le tocaba, cuánto devolvió y cuánto falta.
create view public.v_share_balances with (security_invoker = true) as
select
  s.id              as share_id,
  s.expense_id,
  s.member_id,
  e.paid_by,
  e.currency,
  s.amount_cents,
  s.is_participant,
  (s.member_id = e.paid_by) as is_payer,
  coalesce(sum(p.amount_cents) filter (where p.kind = 'payment'), 0) as paid_cents,
  coalesce(sum(p.amount_cents) filter (where p.kind = 'refund'),  0) as refunded_cents,
  case when s.member_id = e.paid_by then 0
       else s.amount_cents
            - coalesce(sum(p.amount_cents) filter (where p.kind = 'payment'), 0)
            + coalesce(sum(p.amount_cents) filter (where p.kind = 'refund'),  0)
  end as outstanding_cents          -- > 0: debe · < 0: le tienen que reintegrar · 0: saldado
from public.expense_shares s
join public.expenses e on e.id = s.expense_id and e.status = 'active'
left join public.payments p on p.share_id = s.id and p.status = 'active'
group by s.id, e.id;

-- Estado de cada juntada: pendiente / parcial / saldado.
create view public.v_expense_status with (security_invoker = true) as
select
  e.id as expense_id,
  coalesce(sum(b.amount_cents) filter (where not b.is_payer), 0)               as owed_cents,
  coalesce(sum(abs(b.outstanding_cents)), 0)                                   as outstanding_cents,
  coalesce(sum(b.paid_cents), 0)                                               as paid_cents,
  count(*) filter (where b.is_participant)                                     as participants,
  case
    when coalesce(sum(abs(b.outstanding_cents)), 0) = 0 then 'settled'
    when coalesce(sum(b.paid_cents), 0) > 0             then 'partial'
    else 'pending'
  end as settlement_status
from public.expenses e
left join public.v_share_balances b on b.expense_id = e.id
where e.status = 'active'
group by e.id;

-- Quién le debe a quién (sumando todas las juntadas), por moneda.
create view public.v_debts with (security_invoker = true) as
select
  case when outstanding_cents > 0 then member_id else paid_by end as debtor_id,
  case when outstanding_cents > 0 then paid_by else member_id end as creditor_id,
  currency,
  sum(abs(outstanding_cents))::bigint as amount_cents
from public.v_share_balances
where outstanding_cents <> 0
group by 1, 2, 3;

-- Resumen por integrante y moneda. Adelantado, consumido y deudas van SEPARADOS.
create view public.v_member_balances with (security_invoker = true) as
with adv as (
  select paid_by as member_id, currency, sum(amount_cents) as advanced_cents, count(*) as times_paid
  from public.expenses where status = 'active' group by 1, 2
), cons as (
  select member_id, currency, sum(amount_cents) as consumed_cents,
         count(*) filter (where is_participant) as expenses_participated
  from public.v_share_balances group by 1, 2
), owed_to as (
  select creditor_id as member_id, currency, sum(amount_cents) as owed_to_me_cents
  from public.v_debts group by 1, 2
), owes as (
  select debtor_id as member_id, currency, sum(amount_cents) as i_owe_cents
  from public.v_debts group by 1, 2
), rec as (
  select to_member as member_id, currency, sum(amount_cents) as received_cents
  from public.payments where status = 'active' and kind = 'payment' group by 1, 2
), sent as (
  select from_member as member_id, currency, sum(amount_cents) as sent_cents
  from public.payments where status = 'active' and kind = 'payment' group by 1, 2
), keys as (
  select member_id, currency from adv union select member_id, currency from cons
)
select
  k.member_id, k.currency,
  coalesce(adv.advanced_cents, 0)        as advanced_cents,     -- plata que puso por el grupo
  coalesce(adv.times_paid, 0)            as times_paid,
  coalesce(cons.consumed_cents, 0)       as consumed_cents,     -- su consumo personal
  coalesce(cons.expenses_participated,0) as expenses_participated,
  coalesce(owed_to.owed_to_me_cents, 0)  as owed_to_me_cents,   -- lo que le deben hoy
  coalesce(owes.i_owe_cents, 0)          as i_owe_cents,        -- lo que debe hoy
  coalesce(rec.received_cents, 0)        as received_cents,     -- devoluciones recibidas
  coalesce(sent.sent_cents, 0)           as sent_cents          -- devoluciones hechas
from keys k
left join adv     using (member_id, currency)
left join cons    using (member_id, currency)
left join owed_to using (member_id, currency)
left join owes    using (member_id, currency)
left join rec     using (member_id, currency)
left join sent    using (member_id, currency);


-- -----------------------------------------------------------------------------
-- 4. FUNCIONES INTERNAS DE APOYO (no las llama la app directamente)
-- -----------------------------------------------------------------------------

-- Escribe en la auditoría. Solo la usan otras funciones.
create function public.write_audit(
  p_entity text, p_entity_id uuid, p_action text, p_old jsonb, p_new jsonb, p_reason text default null
) returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (actor_id, entity, entity_id, action, old_values, new_values, reason)
  values (auth.uid(), p_entity, p_entity_id::text, p_action, p_old, p_new, nullif(p_reason, ''));
$$;

-- Foto completa de una juntada (con sus partes) para guardar antes/después.
create function public.expense_snapshot(p_expense uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select to_jsonb(e) || jsonb_build_object(
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', s.member_id, 'amount_cents', s.amount_cents, 'is_participant', s.is_participant)
             order by s.member_id)
      from public.expense_shares s where s.expense_id = e.id
    ), '[]'::jsonb))
  from public.expenses e where e.id = p_expense;
$$;

revoke execute on function public.write_audit(text, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.expense_snapshot(uuid) from public, anon, authenticated;

-- Hoy en Buenos Aires.
create function public.today_ar() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- Calcula las partes (member_id → centavos) y valida todo lo que no depende de
-- si la juntada es nueva o editada. Devuelve una tabla temporal en memoria.
create function public.compute_shares(
  p_amount_cents bigint,
  p_split        public.split_type,
  p_participants uuid[],
  p_custom       jsonb
) returns table (member_id uuid, amount_cents bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_n int;
  v_sum bigint;
begin
  if p_split = 'equal' then
    select count(distinct x) into v_n from unnest(p_participants) x;
    if coalesce(v_n, 0) = 0 then raise exception 'Elegí al menos una participante'; end if;
    if v_n <> cardinality(p_participants) then raise exception 'Hay participantes repetidas'; end if;
    -- División igualitaria: cociente para todas y los centavos sobrantes, de a uno,
    -- a las primeras en orden fijo (por id). Así la suma da exacto y es reproducible.
    return query
      select x, p_amount_cents / v_n + case when rn <= p_amount_cents % v_n then 1 else 0 end
      from (select x, row_number() over (order by x) as rn from unnest(p_participants) x) t;
  else
    if p_custom is null or jsonb_typeof(p_custom) <> 'array' or jsonb_array_length(p_custom) = 0 then
      raise exception 'Cargá cuánto le toca a cada participante';
    end if;
    select count(distinct (c->>'member_id')), sum((c->>'amount_cents')::bigint)
      into v_n, v_sum from jsonb_array_elements(p_custom) c;
    if v_n <> jsonb_array_length(p_custom) then raise exception 'Hay participantes repetidas'; end if;
    if exists (select 1 from jsonb_array_elements(p_custom) c where (c->>'amount_cents')::bigint < 0) then
      raise exception 'Ninguna parte puede ser negativa';
    end if;
    if v_sum <> p_amount_cents then
      raise exception 'Las partes suman % pero el total es %', v_sum, p_amount_cents;
    end if;
    return query
      select (c->>'member_id')::uuid, (c->>'amount_cents')::bigint from jsonb_array_elements(p_custom) c;
  end if;
end $$;

revoke execute on function public.compute_shares(bigint, public.split_type, uuid[], jsonb) from public, anon, authenticated;

-- Validaciones comunes de los datos de cabecera.
create function public.validate_expense_header(
  p_category uuid, p_subcategory uuid, p_currency char(3), p_paid_by uuid, p_members uuid[]
) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.categories where id = p_category and parent_id is null) then
    raise exception 'Categoría inválida';
  end if;
  if p_subcategory is not null and not exists (
    select 1 from public.categories where id = p_subcategory and parent_id = p_category
  ) then
    raise exception 'La subcategoría no corresponde a la categoría';
  end if;
  if not exists (select 1 from public.currencies where code = p_currency and enabled) then
    raise exception 'Moneda no habilitada';
  end if;
  -- Pagadora y participantes: integrantes aprobadas (activas o desactivadas, para
  -- poder cargar juntadas pasadas con quienes ya no están).
  if exists (
    select 1 from unnest(p_members || p_paid_by) m
    where not exists (select 1 from public.profiles where id = m and status in ('active', 'inactive'))
  ) then
    raise exception 'Hay integrantes inválidas';
  end if;
end $$;

revoke execute on function public.validate_expense_header(uuid, uuid, char, uuid, uuid[]) from public, anon, authenticated;

-- Resuelve la conversión a moneda base. Sin cotización inventada: si la moneda no
-- es la base, la cotización y su fecha son obligatorias.
create function public.resolve_fx(
  p_currency char(3), p_amount bigint, p_rate numeric, p_rate_date date, p_occurred date,
  out base_currency char(3), out fx_rate numeric, out fx_rate_date date, out base_amount_cents bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  select g.base_currency into base_currency from public.group_settings g where id = 1;
  if p_currency = base_currency then
    fx_rate := 1; fx_rate_date := p_occurred; base_amount_cents := p_amount;
  else
    if p_rate is null or p_rate <= 0 or p_rate_date is null then
      raise exception 'Para gastos en % hay que indicar la cotización y su fecha', p_currency;
    end if;
    fx_rate := p_rate; fx_rate_date := p_rate_date;
    base_amount_cents := round(p_amount * p_rate)::bigint;
  end if;
end $$;

revoke execute on function public.resolve_fx(char, bigint, numeric, date, date) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 5. FUNCIONES QUE USA LA APP
-- -----------------------------------------------------------------------------

-- 5.1 Crear una juntada.
create function public.create_expense(
  p_title          text,
  p_occurred_on    date,
  p_category_id    uuid,
  p_amount_cents   bigint,
  p_paid_by        uuid,
  p_participants   uuid[]        default null,   -- para división igualitaria
  p_split_type     public.split_type default 'equal',
  p_custom_shares  jsonb         default null,   -- [{"member_id": "...", "amount_cents": 123}]
  p_subcategory_id uuid          default null,
  p_description    text          default null,
  p_currency       char(3)       default 'ARS',
  p_fx_rate        numeric       default null,
  p_fx_rate_date   date          default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_members uuid[];
  v_fx record;
begin
  if not public.is_active_member() then
    raise exception 'Solo integrantes activas pueden cargar gastos' using errcode = '42501';
  end if;
  if p_occurred_on is null then raise exception 'La fecha de la juntada es obligatoria'; end if;
  if p_occurred_on > public.today_ar() + 1 then raise exception 'La fecha no puede ser futura'; end if;

  create temp table _shares on commit drop as
    select * from public.compute_shares(p_amount_cents, p_split_type, p_participants, p_custom_shares);
  select array_agg(member_id) into v_members from _shares;

  perform public.validate_expense_header(p_category_id, p_subcategory_id, p_currency, p_paid_by, v_members);
  select * into v_fx from public.resolve_fx(p_currency, p_amount_cents, p_fx_rate, p_fx_rate_date, p_occurred_on);

  insert into public.expenses (
    title, occurred_on, category_id, subcategory_id, description, amount_cents, currency,
    base_currency, fx_rate, fx_rate_date, base_amount_cents, paid_by, created_by, split_type
  ) values (
    trim(p_title), p_occurred_on, p_category_id, p_subcategory_id, nullif(trim(p_description), ''),
    p_amount_cents, p_currency, v_fx.base_currency, v_fx.fx_rate, v_fx.fx_rate_date,
    v_fx.base_amount_cents, p_paid_by, auth.uid(), p_split_type
  ) returning id into v_id;

  insert into public.expense_shares (expense_id, member_id, amount_cents)
  select v_id, member_id, amount_cents from _shares;

  perform public.write_audit('expenses', v_id, 'expense_created', null, public.expense_snapshot(v_id));
  drop table _shares;
  return v_id;
end $$;

-- 5.2 Editar una juntada (solo quien la creó o una admin).
create function public.update_expense(
  p_expense_id     uuid,
  p_title          text,
  p_occurred_on    date,
  p_category_id    uuid,
  p_amount_cents   bigint,
  p_paid_by        uuid,
  p_participants   uuid[]        default null,
  p_split_type     public.split_type default 'equal',
  p_custom_shares  jsonb         default null,
  p_subcategory_id uuid          default null,
  p_description    text          default null,
  p_currency       char(3)       default 'ARS',
  p_fx_rate        numeric       default null,
  p_fx_rate_date   date          default null,
  p_reason         text          default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.expenses;
  v_before jsonb;
  v_has_payments boolean;
  v_members uuid[];
  v_fx record;
begin
  -- "for update" bloquea la fila: si dos personas editan a la vez, la segunda espera.
  select * into v_old from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'La juntada no existe'; end if;
  if not (public.is_admin() or (public.is_active_member() and v_old.created_by = auth.uid())) then
    raise exception 'Solo quien cargó la juntada o una admin puede editarla' using errcode = '42501';
  end if;
  if v_old.status <> 'active' then raise exception 'La juntada está anulada'; end if;
  if p_occurred_on is null then raise exception 'La fecha de la juntada es obligatoria'; end if;
  if p_occurred_on > public.today_ar() + 1 then raise exception 'La fecha no puede ser futura'; end if;

  v_has_payments := exists (select 1 from public.payments where expense_id = p_expense_id and status = 'active');
  if v_has_payments and p_paid_by <> v_old.paid_by then
    raise exception 'No se puede cambiar quién pagó porque ya hay pagos registrados. Deshacelos primero.';
  end if;
  if v_has_payments and p_currency <> v_old.currency then
    raise exception 'No se puede cambiar la moneda porque ya hay pagos registrados.';
  end if;

  create temp table _shares on commit drop as
    select * from public.compute_shares(p_amount_cents, p_split_type, p_participants, p_custom_shares);
  select array_agg(member_id) into v_members from _shares;

  perform public.validate_expense_header(p_category_id, p_subcategory_id, p_currency, p_paid_by, v_members);
  select * into v_fx from public.resolve_fx(p_currency, p_amount_cents, p_fx_rate, p_fx_rate_date, p_occurred_on);

  v_before := public.expense_snapshot(p_expense_id);

  update public.expenses set
    title = trim(p_title), occurred_on = p_occurred_on, category_id = p_category_id,
    subcategory_id = p_subcategory_id, description = nullif(trim(p_description), ''),
    amount_cents = p_amount_cents, currency = p_currency, base_currency = v_fx.base_currency,
    fx_rate = v_fx.fx_rate, fx_rate_date = v_fx.fx_rate_date, base_amount_cents = v_fx.base_amount_cents,
    paid_by = p_paid_by, split_type = p_split_type, updated_at = now()
  where id = p_expense_id;

  -- Recalcular partes:
  --   · sigue participando → nuevo importe
  --   · ya no participa y tuvo movimientos → parte 0 (se conserva por los pagos)
  --   · ya no participa y nunca tuvo movimientos → se borra
  --   · nueva participante → se agrega
  update public.expense_shares s
     set amount_cents = n.amount_cents, is_participant = true
    from _shares n
   where s.expense_id = p_expense_id and s.member_id = n.member_id;

  update public.expense_shares s
     set amount_cents = 0, is_participant = false
   where s.expense_id = p_expense_id
     and s.member_id <> all (v_members)
     and exists (select 1 from public.payments p where p.share_id = s.id);

  delete from public.expense_shares s
   where s.expense_id = p_expense_id
     and s.member_id <> all (v_members)
     and not exists (select 1 from public.payments p where p.share_id = s.id);

  insert into public.expense_shares (expense_id, member_id, amount_cents)
  select p_expense_id, n.member_id, n.amount_cents from _shares n
  where not exists (select 1 from public.expense_shares s where s.expense_id = p_expense_id and s.member_id = n.member_id);

  perform public.write_audit('expenses', p_expense_id, 'expense_updated', v_before,
                             public.expense_snapshot(p_expense_id), p_reason);
  drop table _shares;
end $$;

-- 5.3 Anular una juntada (no se borra: queda en el historial como anulada).
create function public.void_expense(p_expense_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.expenses;
  v_before jsonb;
begin
  select * into v_old from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'La juntada no existe'; end if;
  if not (public.is_admin() or (public.is_active_member() and v_old.created_by = auth.uid())) then
    raise exception 'Solo quien cargó la juntada o una admin puede anularla' using errcode = '42501';
  end if;
  if v_old.status = 'void' then raise exception 'La juntada ya estaba anulada'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo de la anulación'; end if;
  if exists (select 1 from public.payments where expense_id = p_expense_id and status = 'active') then
    raise exception 'La juntada tiene pagos registrados. Deshacelos antes de anularla.';
  end if;

  v_before := public.expense_snapshot(p_expense_id);
  update public.expenses set status = 'void', void_reason = trim(p_reason), updated_at = now()
   where id = p_expense_id;
  perform public.write_audit('expenses', p_expense_id, 'expense_voided', v_before,
                             public.expense_snapshot(p_expense_id), p_reason);
end $$;

-- 5.4 "Marcar como pagado": registra exactamente lo que falta (ni más ni menos).
--     Si una edición dejó a alguien pagando de más, el mismo botón registra el
--     reintegro de quien adelantó hacia ella.
create function public.mark_share_paid(
  p_share_id uuid,
  p_method   text default null,
  p_note     text default null,
  p_paid_on  date default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.expense_shares;
  v_exp public.expenses;
  v_outstanding bigint;
  v_id uuid;
  v_kind public.payment_kind;
begin
  -- Bloquear la parte: dos clics simultáneos no pueden generar dos pagos.
  select * into v_share from public.expense_shares where id = p_share_id for update;
  if not found then raise exception 'La parte no existe'; end if;
  select * into v_exp from public.expenses where id = v_share.expense_id;

  if v_exp.status <> 'active' then raise exception 'La juntada está anulada'; end if;
  if v_share.member_id = v_exp.paid_by then
    raise exception 'Quien adelantó la plata no se debe a sí misma';
  end if;
  if not (public.is_admin()
          or (public.is_active_member() and auth.uid() in (v_share.member_id, v_exp.paid_by))) then
    raise exception 'Solo la deudora, quien adelantó o una admin pueden registrar este pago' using errcode = '42501';
  end if;

  select outstanding_cents into v_outstanding from public.v_share_balances where share_id = p_share_id;
  if v_outstanding = 0 then raise exception 'Esta parte ya está saldada'; end if;
  v_kind := case when v_outstanding > 0 then 'payment' else 'refund' end;

  insert into public.payments (
    share_id, expense_id, kind, from_member, to_member, amount_cents, currency,
    paid_on, method, note, created_by
  ) values (
    p_share_id, v_exp.id, v_kind,
    case when v_kind = 'payment' then v_share.member_id else v_exp.paid_by end,
    case when v_kind = 'payment' then v_exp.paid_by else v_share.member_id end,
    abs(v_outstanding), v_exp.currency, coalesce(p_paid_on, public.today_ar()),
    nullif(trim(p_method), ''), nullif(trim(p_note), ''), auth.uid()
  ) returning id into v_id;

  perform public.write_audit('payments', v_id,
    case when v_kind = 'payment' then 'payment_created' else 'refund_created' end,
    null, (select to_jsonb(p) from public.payments p where id = v_id));
  return v_id;
end $$;

-- 5.5 Deshacer un pago (queda anulado y auditado, nunca se borra).
create function public.void_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.payments;
begin
  select * into v_old from public.payments where id = p_payment_id for update;
  if not found then raise exception 'El pago no existe'; end if;
  if v_old.status = 'void' then raise exception 'El pago ya estaba anulado'; end if;
  if not (public.is_admin()
          or (public.is_active_member() and auth.uid() in (v_old.from_member, v_old.to_member, v_old.created_by))) then
    raise exception 'No podés deshacer este pago' using errcode = '42501';
  end if;

  update public.payments
     set status = 'void', void_reason = nullif(trim(p_reason), ''), voided_by = auth.uid(), voided_at = now()
   where id = p_payment_id;

  perform public.write_audit('payments', p_payment_id, 'payment_voided', to_jsonb(v_old),
    (select to_jsonb(p) from public.payments p where id = p_payment_id), p_reason);
end $$;

-- Permisos de ejecución.
revoke execute on function public.create_expense(text, date, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date) from public, anon;
revoke execute on function public.update_expense(uuid, text, date, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date, text) from public, anon;
revoke execute on function public.void_expense(uuid, text) from public, anon;
revoke execute on function public.mark_share_paid(uuid, text, text, date) from public, anon;
revoke execute on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.create_expense(text, date, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date) to authenticated;
grant execute on function public.update_expense(uuid, text, date, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date, text) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.mark_share_paid(uuid, text, text, date) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- Lectura: integrantes activas. Escritura directa: NADIE (solo vía funciones).
-- -----------------------------------------------------------------------------
alter table public.categories     enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_shares enable row level security;
alter table public.payments       enable row level security;

create policy "leer categorías" on public.categories
  for select to authenticated using (public.is_active_member());
create policy "admins crean categorías" on public.categories
  for insert to authenticated with check (public.is_admin());
create policy "admins editan categorías" on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "leer juntadas" on public.expenses
  for select to authenticated using (public.is_active_member());
create policy "leer partes" on public.expense_shares
  for select to authenticated using (public.is_active_member());
create policy "leer pagos" on public.payments
  for select to authenticated using (public.is_active_member());

revoke insert, update, delete, truncate on public.expenses, public.expense_shares, public.payments from anon, authenticated;
revoke delete, truncate on public.categories from anon, authenticated;
revoke all on public.categories, public.expenses, public.expense_shares, public.payments from anon;
revoke all on public.v_share_balances, public.v_expense_status, public.v_debts, public.v_member_balances from anon;

-- Fin de la migración 0003.
