-- =============================================================================
-- MAMANÍ CLUB · Migración 0010 · Invitadas en los gastos
--
-- A un gasto se puede sumar una persona que NO es del club, solo con su nombre,
-- y una RESPONSABLE del club que se hace cargo de su parte.
--   - La parte de la invitada se guarda como una parte más del gasto, a nombre de la
--     responsable (member_id) y con guest_name = nombre de la invitada.
--   - Para las cuentas, la debe la responsable (se suma a su saldo en la juntada).
--   - NO cuenta como asistencia ni como consumo de la responsable (las estadísticas
--     la excluyen); sí cuenta en el total gastado de la juntada.
--   - Pueden editar ese gasto: quien lo cargó, una admin o la responsable de una
--     invitada del gasto.
-- =============================================================================

begin;

alter table public.expense_shares add column guest_name text
  check (guest_name is null or length(trim(guest_name)) between 1 and 40);

-- Ahora una integrante puede tener su parte y además la de su(s) invitada(s).
alter table public.expense_shares drop constraint expense_shares_expense_id_member_id_key;
create unique index expense_shares_unique_part
  on public.expense_shares (expense_id, member_id, coalesce(lower(guest_name), ''));

-- La foto de auditoría incluye a las invitadas.
create or replace function public.expense_snapshot(p_expense uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(e) || jsonb_build_object(
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', s.member_id, 'amount_cents', s.amount_cents, 'is_participant', s.is_participant, 'guest_name', s.guest_name)
             order by s.member_id, s.guest_name nulls first)
      from public.expense_shares s where s.expense_id = e.id
    ), '[]'::jsonb))
  from public.expenses e where e.id = p_expense;
$$;

-- Partes de un gasto con invitadas.
--   p_participants: integrantes (división igualitaria)
--   p_guests:       [{"name": "Lu", "responsible_id": "<uuid>"}]
--   p_custom:       [{"member_id": "...", "amount_cents": 1, "guest_name": "Lu"?}] (personalizada)
create function public.compute_shares_v2(
  p_amount_cents bigint, p_split public.split_type, p_participants uuid[], p_custom jsonb, p_guests jsonb
) returns table (member_id uuid, guest_name text, amount_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_n int; v_sum bigint; v_dups int; v_m uuid[]; v_g text[];
begin
  if p_split = 'equal' then
    -- "Unidades" de la división: cada integrante + cada invitada (a nombre de su responsable).
    select array_agg(m), array_agg(g) into v_m, v_g from (
      select x as m, null::text as g from unnest(coalesce(p_participants, '{}'::uuid[])) x
      union all
      select (gg->>'responsible_id')::uuid, trim(gg->>'name') from jsonb_array_elements(coalesce(p_guests, '[]'::jsonb)) gg
    ) s;
    v_n := coalesce(cardinality(v_m), 0);
    if v_n = 0 then raise exception 'Elegí al menos una participante'; end if;
    select count(*) - count(distinct (m, coalesce(lower(g), ''))) into v_dups from unnest(v_m, v_g) as u(m, g);
    if v_dups > 0 then raise exception 'Hay participantes o invitadas repetidas'; end if;
    if exists (select 1 from unnest(v_g) g where g is not null and (g = '' or length(g) > 40)) then
      raise exception 'El nombre de la invitada tiene que tener entre 1 y 40 caracteres';
    end if;
    return query
      select u.m, u.g, p_amount_cents / v_n + case when rn <= p_amount_cents % v_n then 1 else 0 end
      from (select m, g, row_number() over (order by m, g nulls first) as rn from unnest(v_m, v_g) as x(m, g)) u;
  else
    if p_custom is null or jsonb_typeof(p_custom) <> 'array' or jsonb_array_length(p_custom) = 0 then
      raise exception 'Cargá cuánto le toca a cada participante';
    end if;
    select count(*) - count(distinct ((c->>'member_id'), coalesce(lower(trim(c->>'guest_name')), ''))),
           sum((c->>'amount_cents')::bigint)
      into v_dups, v_sum from jsonb_array_elements(p_custom) c;
    if v_dups > 0 then raise exception 'Hay participantes o invitadas repetidas'; end if;
    if exists (select 1 from jsonb_array_elements(p_custom) c where (c->>'amount_cents')::bigint < 0) then
      raise exception 'Ninguna parte puede ser negativa';
    end if;
    if v_sum <> p_amount_cents then raise exception 'Las partes suman % pero el total es %', v_sum, p_amount_cents; end if;
    return query
      select (c->>'member_id')::uuid, nullif(trim(c->>'guest_name'), ''), (c->>'amount_cents')::bigint
      from jsonb_array_elements(p_custom) c;
  end if;
end $$;
revoke execute on function public.compute_shares_v2(bigint, public.split_type, uuid[], jsonb, jsonb) from public, anon, authenticated;

-- Nueva versión de create_expense / update_expense con invitadas.
drop function public.create_expense(uuid, text, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date);
drop function public.update_expense(uuid, text, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date, text);

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
  p_fx_rate_date  date              default null,
  p_guests        jsonb             default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_members uuid[]; v_fx record; v_date date;
begin
  if not public.is_active_member() then raise exception 'Solo integrantes activas pueden cargar gastos' using errcode = '42501'; end if;
  perform 1 from public.juntadas where id = p_juntada_id for update;
  if public.juntada_is_settled(p_juntada_id) then
    raise exception 'La juntada ya está saldada: no se pueden agregar más gastos';
  end if;
  create temp table _shares on commit drop as
    select * from public.compute_shares_v2(p_amount_cents, p_split_type, p_participants, p_custom_shares, p_guests);
  select array_agg(distinct member_id) into v_members from _shares;
  perform public.validate_gasto(p_juntada_id, p_category_id, p_subcategory_id, p_currency, p_paid_by, v_members);
  select occurred_on into v_date from public.juntadas where id = p_juntada_id;
  select * into v_fx from public.resolve_fx(p_currency, p_amount_cents, p_fx_rate, p_fx_rate_date, v_date);

  insert into public.expenses (juntada_id, title, occurred_on, category_id, subcategory_id, description, amount_cents, currency,
    base_currency, fx_rate, fx_rate_date, base_amount_cents, paid_by, created_by, split_type)
  values (p_juntada_id, trim(p_title), v_date, p_category_id, p_subcategory_id, nullif(trim(p_description), ''), p_amount_cents, p_currency,
    v_fx.base_currency, v_fx.fx_rate, v_fx.fx_rate_date, v_fx.base_amount_cents, p_paid_by, auth.uid(), p_split_type)
  returning id into v_id;
  insert into public.expense_shares (expense_id, member_id, guest_name, amount_cents)
  select v_id, member_id, guest_name, amount_cents from _shares;
  -- Asistentes: solo las integrantes que consumieron (las invitadas no suman presencia a su responsable).
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select distinct p_juntada_id, member_id, auth.uid() from _shares where guest_name is null on conflict do nothing;

  perform public.write_audit('expenses', v_id, 'expense_created', null, public.expense_snapshot(v_id));
  drop table _shares;
  return v_id;
end $$;

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
  p_reason        text              default null,
  p_guests        jsonb             default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.expenses; v_before jsonb; v_members uuid[]; v_fx record;
begin
  select * into v from public.expenses where id = p_expense_id for update;
  if not found or v.status <> 'active' then raise exception 'El gasto no existe o está anulado'; end if;
  if not (public.is_admin()
          or (public.is_active_member() and (v.created_by = auth.uid()
              or exists (select 1 from public.expense_shares s where s.expense_id = p_expense_id and s.guest_name is not null and s.member_id = auth.uid())))) then
    raise exception 'Solo quien cargó el gasto, la responsable de una invitada o una admin puede editarlo' using errcode = '42501';
  end if;
  create temp table _shares on commit drop as
    select * from public.compute_shares_v2(p_amount_cents, p_split_type, p_participants, p_custom_shares, p_guests);
  select array_agg(distinct member_id) into v_members from _shares;
  perform public.validate_gasto(v.juntada_id, p_category_id, p_subcategory_id, p_currency, p_paid_by, v_members);
  select * into v_fx from public.resolve_fx(p_currency, p_amount_cents, p_fx_rate, p_fx_rate_date, v.occurred_on);

  v_before := public.expense_snapshot(p_expense_id);
  update public.expenses set title = trim(p_title), category_id = p_category_id, subcategory_id = p_subcategory_id,
    description = nullif(trim(p_description), ''), amount_cents = p_amount_cents, currency = p_currency,
    base_currency = v_fx.base_currency, fx_rate = v_fx.fx_rate, fx_rate_date = v_fx.fx_rate_date,
    base_amount_cents = v_fx.base_amount_cents, paid_by = p_paid_by, split_type = p_split_type, updated_at = now()
  where id = p_expense_id;
  delete from public.expense_shares where expense_id = p_expense_id;
  insert into public.expense_shares (expense_id, member_id, guest_name, amount_cents)
  select p_expense_id, member_id, guest_name, amount_cents from _shares;
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select distinct v.juntada_id, member_id, auth.uid() from _shares where guest_name is null on conflict do nothing;

  perform public.write_audit('expenses', p_expense_id, 'expense_updated', v_before, public.expense_snapshot(p_expense_id), p_reason);
  drop table _shares;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_expense(uuid, text, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date, jsonb)',
    'public.update_expense(uuid, text, uuid, bigint, uuid, uuid[], public.split_type, jsonb, uuid, text, char, numeric, date, text, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

-- Fin de la migración 0010.
