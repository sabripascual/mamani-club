-- =============================================================================
-- MAMANÍ CLUB · Migración 0011 · Las invitadas pagan lo suyo, alias por gasto
--                                y aviso de evento nuevo
--
-- 1. Invitadas: cada invitada paga SU parte directo a quien pagó el gasto. La
--    responsable ya no la debe: solo la acompaña y, junto con una admin, puede
--    marcar "pagado" a la invitada.
--      - Saldos netos de las integrantes: sin las partes de invitadas (a quien pagó
--        el gasto se le descuenta lo que le deben las invitadas, aparte).
--      - Estado de la juntada: pendiente mientras alguna invitada no pagó.
-- 2. Alias de devolución por gasto: quien paga elige a qué alias le devuelven.
-- 3. Evento nuevo: aviso a todo el grupo con una frase al azar (editable en el panel).
--
-- IMPORTANTE: correr el archivo ENTERO (los ALTER TYPE van fuera de la transacción).
-- =============================================================================

alter type public.notification_kind add value if not exists 'event_new';
alter type public.notification_kind add value if not exists 'guest_debt';

begin;

-- -----------------------------------------------------------------------------
-- 1. INVITADAS QUE PAGAN LO SUYO
-- -----------------------------------------------------------------------------
alter table public.expense_shares
  add column guest_paid_at timestamptz,
  add column guest_paid_by uuid references public.profiles(id);
alter table public.expense_shares add constraint expense_shares_guest_paid_only_guests
  check (guest_paid_at is null or guest_name is not null);

-- Saldo neto por juntada e integrante, SIN las invitadas.
--   paid      = lo que pagó en gastos
--   consumed  = sus partes (no las de sus invitadas)
--   guests    = lo que le deben invitadas en los gastos que pagó (se cobra aparte)
--   net       = paid − consumed − guests + sent − received
create or replace view public.v_juntada_member_balances with (security_invoker = true) as
with movs as (
  select e.juntada_id, e.paid_by as member_id, e.amount_cents as paid, 0::bigint as consumed, 0::bigint as sent, 0::bigint as received, 0::bigint as guests
  from public.expenses e where e.status = 'active'
  union all
  select e.juntada_id, s.member_id, 0, s.amount_cents, 0, 0, 0
  from public.expense_shares s join public.expenses e on e.id = s.expense_id and e.status = 'active'
  where s.guest_name is null
  union all
  select e.juntada_id, e.paid_by, 0, 0, 0, 0, s.amount_cents
  from public.expense_shares s join public.expenses e on e.id = s.expense_id and e.status = 'active'
  where s.guest_name is not null
  union all
  select t.juntada_id, t.from_member, 0, 0, t.amount_cents, 0, 0 from public.settlements t where t.status = 'active'
  union all
  select t.juntada_id, t.to_member, 0, 0, 0, t.amount_cents, 0 from public.settlements t where t.status = 'active'
)
select m.juntada_id, m.member_id, j.currency,
       sum(m.paid)::bigint     as paid_cents,
       sum(m.consumed)::bigint as consumed_cents,
       sum(m.sent)::bigint     as sent_cents,
       sum(m.received)::bigint as received_cents,
       (sum(m.paid) - sum(m.consumed) - sum(m.guests) + sum(m.sent) - sum(m.received))::bigint as net_cents,
       sum(m.guests)::bigint   as guests_cents
from movs m
join public.juntadas j on j.id = m.juntada_id and j.status = 'active'
group by m.juntada_id, m.member_id, j.currency;

-- Deudas de invitadas (una por parte), con quién cobra y quién responde por ella.
create view public.v_guest_debts with (security_invoker = true) as
select s.id as share_id, e.juntada_id, e.id as expense_id, j.currency, s.guest_name, s.member_id as responsible_id,
       e.paid_by as creditor_id, s.amount_cents, s.guest_paid_at, s.guest_paid_by, e.created_at
from public.expense_shares s
join public.expenses e on e.id = s.expense_id and e.status = 'active'
join public.juntadas j on j.id = e.juntada_id and j.status = 'active'
where s.guest_name is not null;
revoke all on public.v_guest_debts from anon;

-- Estado de la juntada: también cuentan las invitadas que no pagaron.
create or replace view public.v_juntada_status with (security_invoker = true) as
select j.id as juntada_id,
  coalesce((select sum(e.amount_cents) from public.expenses e where e.juntada_id = j.id and e.status = 'active'), 0)::bigint as total_cents,
  coalesce((select sum(e.base_amount_cents) from public.expenses e where e.juntada_id = j.id and e.status = 'active'), 0)::bigint as total_base_cents,
  (select count(*) from public.expenses e where e.juntada_id = j.id and e.status = 'active') as expenses_count,
  (select count(*) from public.juntada_attendees a where a.juntada_id = j.id) as attendees_count,
  (coalesce((select sum(-b.net_cents) from public.v_juntada_member_balances b where b.juntada_id = j.id and b.net_cents < 0), 0)
   + coalesce((select sum(g.amount_cents) from public.v_guest_debts g where g.juntada_id = j.id and g.guest_paid_at is null), 0))::bigint as pending_cents,
  case
    when not exists (select 1 from public.expenses e where e.juntada_id = j.id and e.status = 'active') then 'empty'
    when not exists (select 1 from public.v_juntada_member_balances b where b.juntada_id = j.id and b.net_cents <> 0)
     and not exists (select 1 from public.v_guest_debts g where g.juntada_id = j.id and g.guest_paid_at is null and g.amount_cents > 0) then 'settled'
    when exists (select 1 from public.settlements t where t.juntada_id = j.id and t.status = 'active')
      or exists (select 1 from public.v_guest_debts g where g.juntada_id = j.id and g.guest_paid_at is not null) then 'partial'
    else 'pending'
  end as settlement_status
from public.juntadas j
where j.status = 'active';

create or replace function public.juntada_is_settled(p_juntada uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.expenses where juntada_id = p_juntada and status = 'active')
     and not exists (select 1 from public.v_juntada_member_balances where juntada_id = p_juntada and net_cents <> 0)
     and not exists (select 1 from public.v_guest_debts where juntada_id = p_juntada and guest_paid_at is null and amount_cents > 0);
$$;

-- Marcar (o desmarcar) que una invitada pagó: su responsable o una admin.
create function public.set_guest_paid(p_share_id uuid, p_paid boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.expense_shares; v_before jsonb; v_juntada uuid;
begin
  select * into v from public.expense_shares where id = p_share_id for update;
  if not found or v.guest_name is null then raise exception 'Esa parte no es de una invitada'; end if;
  select e.juntada_id into v_juntada from public.expenses e join public.juntadas j on j.id = e.juntada_id
  where e.id = v.expense_id and e.status = 'active' and j.status = 'active';
  if v_juntada is null then raise exception 'El gasto no existe o está anulado'; end if;
  if not (public.is_admin() or (public.is_active_member() and v.member_id = auth.uid())) then
    raise exception 'Solo la responsable de la invitada o una admin puede marcar su pago' using errcode = '42501';
  end if;
  v_before := public.expense_snapshot(v.expense_id);
  update public.expense_shares
     set guest_paid_at = case when p_paid then now() end,
         guest_paid_by = case when p_paid then auth.uid() end
   where id = p_share_id;
  perform public.write_audit('expenses', v.expense_id, case when p_paid then 'guest_paid' else 'guest_unpaid' end,
    v_before, public.expense_snapshot(v.expense_id));
end $$;
revoke execute on function public.set_guest_paid(uuid, boolean) from public, anon;
grant execute on function public.set_guest_paid(uuid, boolean) to authenticated;

-- La foto de auditoría incluye si la invitada pagó.
create or replace function public.expense_snapshot(p_expense uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(e) || jsonb_build_object(
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', s.member_id, 'amount_cents', s.amount_cents, 'is_participant', s.is_participant,
               'guest_name', s.guest_name, 'guest_paid_at', s.guest_paid_at)
             order by s.member_id, s.guest_name nulls first)
      from public.expense_shares s where s.expense_id = e.id
    ), '[]'::jsonb))
  from public.expenses e where e.id = p_expense;
$$;

-- Editar un gasto conserva el "pagó" de cada invitada si su parte, su responsable y
-- quien cobra no cambiaron.
create or replace function public.update_expense(
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

  create temp table _guest_paid on commit drop as
    select member_id, lower(guest_name) as g, amount_cents, guest_paid_at, guest_paid_by
    from public.expense_shares where expense_id = p_expense_id and guest_paid_at is not null;

  v_before := public.expense_snapshot(p_expense_id);
  update public.expenses set title = trim(p_title), category_id = p_category_id, subcategory_id = p_subcategory_id,
    description = nullif(trim(p_description), ''), amount_cents = p_amount_cents, currency = p_currency,
    base_currency = v_fx.base_currency, fx_rate = v_fx.fx_rate, fx_rate_date = v_fx.fx_rate_date,
    base_amount_cents = v_fx.base_amount_cents, paid_by = p_paid_by, split_type = p_split_type, updated_at = now()
  where id = p_expense_id;
  delete from public.expense_shares where expense_id = p_expense_id;
  insert into public.expense_shares (expense_id, member_id, guest_name, amount_cents, guest_paid_at, guest_paid_by)
  select p_expense_id, s.member_id, s.guest_name, s.amount_cents,
         case when p_paid_by = v.paid_by then gp.guest_paid_at end, case when p_paid_by = v.paid_by then gp.guest_paid_by end
  from _shares s
  left join _guest_paid gp on s.guest_name is not null and gp.member_id = s.member_id and gp.g = lower(s.guest_name) and gp.amount_cents = s.amount_cents;
  insert into public.juntada_attendees (juntada_id, member_id, added_by)
  select distinct v.juntada_id, member_id, auth.uid() from _shares where guest_name is null on conflict do nothing;

  perform public.write_audit('expenses', p_expense_id, 'expense_updated', v_before, public.expense_snapshot(p_expense_id), p_reason);
  drop table _shares;
  drop table _guest_paid;
end $$;

-- Sacar una asistente: su invitada no la ata a la juntada.
create or replace function public.leave_juntada(p_juntada_id uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.juntadas;
begin
  select * into v from public.juntadas where id = p_juntada_id;
  if not found then raise exception 'La juntada no existe'; end if;
  if not (public.is_admin() or (public.is_active_member() and auth.uid() in (p_member, v.created_by))) then
    raise exception 'No podés sacar a esta asistente' using errcode = '42501';
  end if;
  if exists (select 1 from public.expense_shares s join public.expenses e on e.id = s.expense_id
             where e.juntada_id = p_juntada_id and e.status = 'active' and s.member_id = p_member and s.is_participant and s.guest_name is null)
     or exists (select 1 from public.expenses e where e.juntada_id = p_juntada_id and e.status = 'active' and e.paid_by = p_member) then
    raise exception 'Está en algún gasto de la juntada: primero hay que sacarla de esos gastos';
  end if;
  delete from public.juntada_attendees where juntada_id = p_juntada_id and member_id = p_member;
end $$;

-- -----------------------------------------------------------------------------
-- 2. ALIAS DE DEVOLUCIÓN POR GASTO
-- -----------------------------------------------------------------------------
alter table public.expenses add column refund_alias text check (refund_alias is null or length(refund_alias) between 6 and 20);

-- Lo elige quien pagó (o quien cargó el gasto / una admin) entre los alias de quien pagó.
create function public.set_expense_refund_alias(p_expense_id uuid, p_alias text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.expenses; v_alias text := lower(nullif(trim(p_alias), ''));
begin
  select * into v from public.expenses where id = p_expense_id for update;
  if not found or v.status <> 'active' then raise exception 'El gasto no existe o está anulado'; end if;
  if not (public.is_admin() or (public.is_active_member() and auth.uid() in (v.paid_by, v.created_by))) then
    raise exception 'No podés elegir el alias de este gasto' using errcode = '42501';
  end if;
  if v_alias is not null and not exists (select 1 from public.member_aliases where member_id = v.paid_by and alias = v_alias) then
    raise exception 'Ese alias no es de quien pagó el gasto';
  end if;
  update public.expenses set refund_alias = v_alias where id = p_expense_id;
end $$;
revoke execute on function public.set_expense_refund_alias(uuid, text) from public, anon;
grant execute on function public.set_expense_refund_alias(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. AVISO DE EVENTO NUEVO (frases al azar, editables en el panel)
-- -----------------------------------------------------------------------------
alter table public.notification_messages drop constraint notification_messages_kind_check;
alter table public.notification_messages add constraint notification_messages_kind_check
  check (kind in ('weekly', 'birthday', 'birthday_week', 'event_new'));

-- {evento} = nombre del evento, {fecha} = día y hora.
insert into public.notification_messages (kind, title, body) values
  ('event_new', 'Se armó la juntada reinas 🍸', '{evento} · {fecha}'),
  ('event_new', 'Se vienen cositasss', '{evento} · {fecha}'),
  ('event_new', 'Agendá, así después no te hacés la boluda!!!', '{evento} · {fecha}'),
  ('event_new', 'Atención manga de ocupadas 📢', '{evento} · {fecha}'),
  ('event_new', 'Cancelá todo viejita, hay plan', '{evento} · {fecha}'),
  ('event_new', 'Se viene un nuevo gasto irresponsableee', '{evento} · {fecha}');

commit;

-- Fin de la migración 0011.
