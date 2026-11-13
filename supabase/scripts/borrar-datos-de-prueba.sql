-- =============================================================================
-- MAMANÍ CLUB · Borrar todos los datos cargados (nuevo ciclo de prueba limpio)
--
-- SE BORRA: juntadas, gastos, partes e invitadas, transferencias, pagos viejos,
--           eventos y respuestas, fotos (registros), likes y comentarios,
--           historial de notificaciones, pedidos de cambio de contraseña y auditoría.
-- SE CONSERVA: usuarias registradas (auth + perfiles, roles y estados), sus alias,
--           sus dispositivos con notificaciones activadas, categorías, tipos de
--           juntada, monedas, feriados, configuración y frases de notificaciones.
--
-- ⚠️  NO SE PUEDE DESHACER. Antes, si querés, hacé un backup (Database → Backups).
-- ⚠️  Los ARCHIVOS de las fotos no se borran por SQL (Supabase no lo permite):
--     después de correr esto, entrá a Storage → bucket "photos" → seleccioná todo → Delete.
--     (El bucket "avatars" no se toca: son las fotos de perfil.)
--
-- Uso: pegar TODO en el SQL Editor de Supabase y ejecutar.
-- =============================================================================

begin;

-- TRUNCATE no dispara los triggers de auditoría por fila y deja las tablas vacías.
-- Sin CASCADE: si alguna otra tabla dependiera de estas, falla en vez de borrar de más.
truncate table
  public.photo_comments,
  public.photo_likes,
  public.photos,
  public.settlements,
  public.payments,
  public.expense_shares,
  public.expenses,
  public.juntada_attendees,
  public.event_rsvps,
  public.events,
  public.juntadas,
  public.notification_log,
  public.password_reset_requests,
  public.audit_log
restart identity;

-- Las frases vuelven a "nunca usadas".
update public.notification_messages set last_sent_at = null;

-- Control: todo en cero.
select 'juntadas' as tabla, count(*) from public.juntadas
union all select 'gastos', count(*) from public.expenses
union all select 'eventos', count(*) from public.events
union all select 'fotos', count(*) from public.photos
union all select 'usuarias (se conservan)', count(*) from public.profiles;

commit;
