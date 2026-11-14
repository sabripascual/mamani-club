-- =============================================================================
-- MAMANÍ CLUB · Migración 0018 · Performance de los saldos
--
-- Mismos resultados, menos trabajo:
--  1. v_pending_transfers calcula "quién le debe a quién" SOLO en las juntadas que
--     todavía tienen saldos (antes recorría todas, también las saldadas, que con el
--     tiempo son la mayoría).
--  2. v_member_balances calcula las transferencias pendientes UNA vez (antes dos).
--  3. Índices para las consultas más frecuentes.
-- =============================================================================

begin;

create or replace view public.v_pending_transfers with (security_invoker = true) as
with abiertas as (
  -- Juntadas con alguien que debe o a quien le deben (un solo recorrido de los saldos).
  select distinct b.juntada_id from public.v_juntada_member_balances b where b.net_cents <> 0
)
select j.id as juntada_id, j.currency, t.from_member, t.to_member, t.amount_cents
from public.juntadas j
join abiertas a on a.juntada_id = j.id
cross join lateral public.juntada_transfers(j.id) t
where j.status = 'active';

create or replace view public.v_member_balances with (security_invoker = true) as
with b as (
  select member_id, currency,
         sum(paid_cents) as advanced_cents, sum(consumed_cents) as consumed_cents,
         sum(sent_cents) as sent_cents, sum(received_cents) as received_cents
  from public.v_juntada_member_balances group by 1, 2
), pt as materialized (
  select * from public.v_pending_transfers
), owe as (
  select from_member as member_id, currency, sum(amount_cents) as i_owe_cents from pt group by 1, 2
), owed as (
  select to_member as member_id, currency, sum(amount_cents) as owed_to_me_cents from pt group by 1, 2
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

-- Índices para las búsquedas más frecuentes.
create index if not exists settlements_juntada_idx on public.settlements (juntada_id) where status = 'active';
create index if not exists expense_shares_member_idx on public.expense_shares (member_id);
create index if not exists juntada_attendees_member_idx on public.juntada_attendees (member_id);
create index if not exists juntadas_active_date_idx on public.juntadas (occurred_on desc, created_at desc) where status = 'active';
create index if not exists cuotita_installments_cuotita_idx on public.cuotita_installments (cuotita_id);

commit;

-- Fin de la migración 0018.
