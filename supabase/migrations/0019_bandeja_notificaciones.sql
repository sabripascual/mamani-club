-- =============================================================================
-- MAMANÍ CLUB · Migración 0019 · Bandeja de notificaciones (la campanita)
--
-- Cada push que manda el servidor también queda guardado acá, para verlo después
-- desde la campanita del inicio. Solo lo escribe el servidor (clave secreta); cada
-- integrante ve y marca como leídas únicamente las suyas.
-- =============================================================================
begin;

create table if not exists public.member_notifications (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  body        text not null check (length(body) <= 1000),
  url         text not null default '/' check (url ~ '^/'),
  tag         text check (tag is null or length(tag) <= 100),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists member_notifications_member_idx on public.member_notifications (member_id, created_at desc);

alter table public.member_notifications enable row level security;
revoke all on public.member_notifications from anon, authenticated;
grant select on public.member_notifications to authenticated;

drop policy if exists member_notifications_select on public.member_notifications;
create policy member_notifications_select on public.member_notifications
  for select to authenticated using (member_id = auth.uid());

-- Marca todas mis notificaciones como leídas y limpia las de hace más de 90 días.
create or replace function public.mark_notifications_read()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  update public.member_notifications set read_at = now() where member_id = auth.uid() and read_at is null;
  delete from public.member_notifications where member_id = auth.uid() and created_at < now() - interval '90 days';
end $$;
revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

commit;

-- Fin de la migración 0019.
