-- =============================================================================
-- MAMANÍ CLUB · Migración 0005 · Notificaciones push de deudas
--
-- push_subscriptions → un registro por dispositivo donde la integrante activó las
--                      notificaciones (lo genera el navegador; no tiene datos personales).
-- notification_log   → qué se mandó, a quién y qué día. Sirve para:
--                      · saber en qué mensaje de la secuencia va cada deuda;
--                      · no mandar dos veces lo mismo el mismo día.
-- El envío lo hace un cron diario del servidor (10:00 AR) con la clave secreta.
-- =============================================================================

create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.profiles(id),
  endpoint        text not null unique check (endpoint ~ '^https://'),
  p256dh          text not null,
  auth            text not null,
  user_agent      text check (user_agent is null or length(user_agent) <= 300),
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failed_count    int not null default 0
);

create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

create type public.notification_kind as enum ('debtor', 'creditor', 'test');

create table public.notification_log (
  id          bigint generated always as identity primary key,
  kind        public.notification_kind not null,
  member_id   uuid not null references public.profiles(id),
  expense_id  uuid references public.expenses(id),   -- null en el resumen de cobros
  step        int  not null check (step >= 1),
  sent_on     date not null,                          -- fecha (Argentina) del envío
  title       text not null,
  body        text not null,
  devices     int  not null default 0,                -- a cuántos dispositivos llegó
  created_at  timestamptz not null default now()
);

-- Un solo envío por tipo, integrante, juntada y día (aunque el cron corra dos veces).
create unique index notification_log_once_per_day
  on public.notification_log (kind, member_id, expense_id, sent_on) nulls not distinct;
create index notification_log_member_idx on public.notification_log (member_id, kind, sent_on desc);

-- RLS: cada una maneja SUS dispositivos y ve SU historial. El cron usa la clave
-- secreta (service_role), que saltea RLS.
alter table public.push_subscriptions enable row level security;
alter table public.notification_log   enable row level security;

create policy "ver mis dispositivos" on public.push_subscriptions
  for select to authenticated using (member_id = auth.uid());
create policy "activar en mi dispositivo" on public.push_subscriptions
  for insert to authenticated with check (member_id = auth.uid() and public.is_active_member());
create policy "desactivar mi dispositivo" on public.push_subscriptions
  for delete to authenticated using (member_id = auth.uid());

create policy "ver mis notificaciones" on public.notification_log
  for select to authenticated using (member_id = auth.uid());

revoke update, truncate on public.push_subscriptions from anon, authenticated;
revoke insert, update, delete, truncate on public.notification_log from anon, authenticated;
revoke all on public.push_subscriptions, public.notification_log from anon;

-- Fin de la migración 0005.
