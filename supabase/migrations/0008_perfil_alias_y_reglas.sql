-- =============================================================================
-- MAMANÍ CLUB · Migración 0008 · Fecha de nacimiento, alias y reglas de gastos
--
--  1. Fecha de nacimiento en el perfil (se pide al registrarse; se puede editar).
--  2. Alias para transferir: hasta 5 por integrante, uno principal.
--  3. Una juntada SALDADA no admite gastos nuevos.
--  4. Si la categoría del gasto tiene subcategorías, elegir una es obligatorio.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. FECHA DE NACIMIENTO
-- -----------------------------------------------------------------------------
alter table public.profiles add column birth_date date
  check (birth_date is null or birth_date between date '1900-01-01' and current_date);

-- El alta toma la fecha del formulario de registro (si viene y es válida).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_birth date;
begin
  begin
    v_birth := nullif(meta->>'birth_date', '')::date;
  exception when others then
    v_birth := null;
  end;
  insert into public.profiles (id, first_name, last_name, username, nickname, avatar_path, birth_date)
  values (
    new.id,
    trim(meta->>'first_name'),
    trim(meta->>'last_name'),
    lower(trim(meta->>'username')),
    nullif(trim(meta->>'nickname'), ''),
    nullif(meta->>'avatar_path', ''),
    v_birth
  );
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. ALIAS PARA TRANSFERIR
-- Formato de alias bancario argentino: 6 a 20 caracteres, letras, números, punto o guion.
-- -----------------------------------------------------------------------------
create table public.member_aliases (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id),
  alias       text not null check (alias ~ '^[a-z0-9.\-]{6,20}$'),
  label       text check (label is null or length(trim(label)) between 1 and 30),
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (member_id, alias)
);

-- Uno solo principal por integrante.
create unique index member_aliases_one_primary on public.member_aliases (member_id) where is_primary;

-- Máximo 5 por integrante; el alias se guarda en minúsculas.
create function public.guard_member_alias()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.alias := lower(trim(new.alias));
  if tg_op = 'INSERT' and (select count(*) from public.member_aliases where member_id = new.member_id) >= 5 then
    raise exception 'Podés tener hasta 5 alias';
  end if;
  return new;
end $$;

create trigger guard_member_alias before insert or update on public.member_aliases
  for each row execute function public.guard_member_alias();

-- Marcar un alias como principal (desmarca el anterior en la misma transacción).
create function public.set_primary_alias(p_alias_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.member_aliases where id = p_alias_id and member_id = auth.uid()) then
    raise exception 'Ese alias no es tuyo' using errcode = '42501';
  end if;
  update public.member_aliases set is_primary = false where member_id = auth.uid() and is_primary;
  update public.member_aliases set is_primary = true where id = p_alias_id;
end $$;
revoke execute on function public.set_primary_alias(uuid) from public, anon;
grant execute on function public.set_primary_alias(uuid) to authenticated;

alter table public.member_aliases enable row level security;

-- Todas las integrantes activas ven los alias (hace falta para transferir).
create policy "leer alias" on public.member_aliases
  for select to authenticated using (public.is_active_member() or member_id = auth.uid());
create policy "cargar mis alias" on public.member_aliases
  for insert to authenticated with check (member_id = auth.uid());
create policy "editar mis alias" on public.member_aliases
  for update to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy "borrar mis alias" on public.member_aliases
  for delete to authenticated using (member_id = auth.uid());
revoke all on public.member_aliases from anon;


-- -----------------------------------------------------------------------------
-- 3 y 4. REGLAS DE GASTOS
-- -----------------------------------------------------------------------------
create or replace function public.validate_gasto(
  p_juntada uuid, p_category uuid, p_subcategory uuid, p_currency char(3), p_paid_by uuid, p_members uuid[]
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.juntadas where id = p_juntada and status = 'active') then
    raise exception 'La juntada no existe o está anulada';
  end if;
  if not exists (select 1 from public.categories where id = p_category and parent_id is null and kind = 'gasto') then
    raise exception 'Categoría de gasto inválida';
  end if;
  if p_subcategory is null
     and exists (select 1 from public.categories where parent_id = p_category and not archived) then
    raise exception 'Elegí la subcategoría del gasto';
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

-- ¿Está saldada? (tiene gastos y todas están a mano)
create function public.juntada_is_settled(p_juntada uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.expenses where juntada_id = p_juntada and status = 'active')
     and not exists (select 1 from public.v_juntada_member_balances where juntada_id = p_juntada and net_cents <> 0);
$$;

create or replace function public.create_expense(
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
  -- Bloqueo de la juntada para que nadie salde mientras se agrega un gasto.
  perform 1 from public.juntadas where id = p_juntada_id for update;
  if public.juntada_is_settled(p_juntada_id) then
    raise exception 'La juntada ya está saldada: no se pueden agregar más gastos';
  end if;
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
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select p_juntada_id, m, auth.uid() from unnest(v_members) m on conflict do nothing;

  perform public.write_audit('expenses', v_id, 'expense_created', null, public.expense_snapshot(v_id));
  drop table _shares;
  return v_id;
end $$;

commit;

-- Fin de la migración 0008.
