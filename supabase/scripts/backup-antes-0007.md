# Backup antes de correr la migración 0007

La migración 0007 transforma los datos (cada gasto pasa a ser una juntada). Corre en
una sola transacción y verifica los saldos al final: si algo no coincide, **no aplica
ningún cambio**. Igual, como el plan gratuito de Supabase no permite volver a un punto
anterior, hacé este backup antes.

## Opción rápida: exportar las tablas a CSV (5 minutos)

En Supabase → **Table Editor**, para cada tabla de esta lista:
abrila → botón **…** (o "Export") arriba a la derecha → **Export table as CSV**.

1. `profiles`
2. `expenses`
3. `expense_shares`
4. `payments`
5. `categories`
6. `photos`
7. `photo_likes`
8. `photo_comments`
9. `audit_log`
10. `notification_log`
11. `push_subscriptions`
12. `password_reset_requests`

Guardá los archivos en una carpeta con la fecha (por ejemplo `backup-mamani-2026-11-12`).
Las fotos no hace falta descargarlas: la migración no toca los archivos de Storage.

## Después de correr la migración

Tiene que aparecer el mensaje:
`Verificación OK: todos los saldos coinciden con los anteriores.`

Si aparece un error, no se aplicó nada: mandá una captura del mensaje.
