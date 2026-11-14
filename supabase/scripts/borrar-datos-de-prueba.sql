-- =============================================================================
-- MAMANÍ CLUB · Borrar todos los datos cargados (empezar las pruebas de cero)
--
-- SE BORRA: juntadas, gastos, partes e invitadas, transferencias, pagos viejos,
--           eventos y respuestas, fotos (registros), likes y comentarios,
--           cuotitas y sus cuotas, historial de notificaciones, corridas del cron,
--           pedidos de cambio de contraseña y auditoría.
-- SE CONSERVA: usuarias (cuentas, perfiles, roles, cumpleaños y fotos de perfil),
--           sus alias, sus tarjetas, sus dispositivos con notificaciones activadas,
--           categorías, tipos de juntada, monedas, feriados, configuración y frases
--           de notificaciones.
--
-- ⚠️  NO SE PUEDE DESHACER. Si querés, antes hacé un backup (Database → Backups).
-- ⚠️  Los ARCHIVOS de las fotos de las juntadas no se borran por SQL (Supabase no lo
--     permite): después de correr esto, entrá a Storage → bucket "photos" →
--     seleccioná todo → Delete. El bucket "avatars" (fotos de perfil) no se toca.
--
-- Uso: pegar TODO en el SQL Editor de Supabase y ejecutar. Sirve aunque alguna
-- migración nueva (por ejemplo, la de Las Cuotitas) todavía no esté corrida.
-- =============================================================================

begin;

do $$
declare
  -- Orden: primero lo que depende de otras tablas. Las que no existan se saltean.
  wanted text[] := array[
    'cuotita_installments', 'cuotita_parts', 'cuotitas',
    'photo_comments', 'photo_likes', 'photos',
    'settlements', 'payments', 'expense_shares', 'expenses',
    'juntada_attendees', 'event_rsvps', 'events', 'juntadas',
    'notification_log', 'cron_runs', 'password_reset_requests', 'audit_log'
  ];
  existing text;
begin
  select string_agg(format('public.%I', t), ', ' order by ord)
    into existing
  from unnest(wanted) with ordinality as w(t, ord)
  where to_regclass(format('public.%I', t)) is not null;
  -- TRUNCATE no dispara la auditoría fila por fila. Sin CASCADE: si alguna otra tabla
  -- dependiera de estas, falla en vez de borrar de más (y no se borra nada).
  execute 'truncate table ' || existing || ' restart identity';
end $$;

-- Las frases de notificaciones vuelven a "nunca usadas".
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notification_messages' and column_name = 'last_sent_at') then
    update public.notification_messages set last_sent_at = null;
  end if;
end $$;

-- Control: datos en cero, usuarias intactas.
select 'juntadas' as que, count(*) as cantidad from public.juntadas
union all select 'gastos', count(*) from public.expenses
union all select 'eventos', count(*) from public.events
union all select 'fotos', count(*) from public.photos
union all select 'usuarias (se conservan)', count(*) from public.profiles
union all select 'alias (se conservan)', count(*) from public.member_aliases;

commit;
