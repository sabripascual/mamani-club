-- =============================================================================
-- MAMANÍ CLUB · Migración 0012 · Quien pagó maneja su gasto + frases sin repetir
--
-- 1. Si otra persona cargó un gasto a tu nombre (vos pagaste), podés editarlo,
--    quitarlo y elegir el alias de devolución (esto último ya se podía).
-- 2. Frases de "evento nuevo": se guarda cuándo se usó cada una, para no repetir la
--    misma en dos eventos seguidos.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. QUIEN PAGÓ PUEDE EDITAR Y QUITAR SU GASTO
-- -----------------------------------------------------------------------------
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
          or (public.is_active_member() and (v.created_by = auth.uid() or v.paid_by = auth.uid()
              or exists (select 1 from public.expense_shares s where s.expense_id = p_expense_id and s.guest_name is not null and s.member_id = auth.uid())))) then
    raise exception 'Solo quien pagó o cargó el gasto, la responsable de una invitada o una admin puede editarlo' using errcode = '42501';
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

create or replace function public.void_expense(p_expense_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.expenses; v_before jsonb;
begin
  select * into v from public.expenses where id = p_expense_id for update;
  if not found or v.status <> 'active' then raise exception 'El gasto no existe o ya está anulado'; end if;
  if not (public.is_admin() or (public.is_active_member() and auth.uid() in (v.created_by, v.paid_by))) then
    raise exception 'Solo quien pagó o cargó el gasto, o una admin, puede quitarlo' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo'; end if;
  v_before := public.expense_snapshot(p_expense_id);
  update public.expenses set status = 'void', void_reason = trim(p_reason), updated_at = now() where id = p_expense_id;
  perform public.write_audit('expenses', p_expense_id, 'expense_voided', v_before, public.expense_snapshot(p_expense_id), p_reason);
end $$;

-- -----------------------------------------------------------------------------
-- 2. FRASES SIN REPETIR
-- -----------------------------------------------------------------------------
alter table public.notification_messages add column last_sent_at timestamptz;

commit;

-- Fin de la migración 0012.
