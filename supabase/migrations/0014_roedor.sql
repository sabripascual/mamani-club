-- =============================================================================
-- MAMANÍ CLUB · Migración 0014 · Datos para el ranking "El roedor"
--
-- "El roedor" = quién acumuló más notificaciones de deuda enviadas. El historial de
-- notificaciones solo lo ven las admins, así que esta función expone ÚNICAMENTE
-- (integrante, día) de cada aviso de deuda enviado, sin títulos ni textos.
-- =============================================================================

begin;

create function public.debt_reminders_sent()
returns table (member_id uuid, sent_on date)
language sql stable security definer set search_path = '' as $$
  select l.member_id, l.sent_on
  from public.notification_log l
  where l.kind = 'debtor' and l.devices > 0 and public.is_active_member();
$$;
revoke execute on function public.debt_reminders_sent() from public, anon;
grant execute on function public.debt_reminders_sent() to authenticated;

commit;

-- Fin de la migración 0014.
