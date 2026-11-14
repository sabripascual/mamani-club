# Base de datos (Supabase)

- `migrations/` — SQL versionado. Se corren **en orden** en Supabase → SQL Editor, una sola vez cada una.
- `scripts/` — consultas puntuales (p. ej. `primera-admin.sql`).
- `tests/` — pruebas de permisos y reglas. Se corren contra un Postgres local con
  `tests/_stub_supabase.sql`, que simula `auth` y `storage`.

## Migraciones aplicadas en producción

| Archivo | Contenido | Aplicada |
|---|---|---|
| 0001_fundamentos.sql | Perfiles, roles, aprobación, monedas, configuración, auditoría, avatares | ✅ |
| 0002_contrasena_temporal.sql | Contraseña temporal generada por admin (auditada) | ✅ |
| 0003_gastos_y_pagos.sql | Categorías, juntadas, partes, pagos, saldos y funciones financieras | ✅ |
| 0004_recuerdos.sql | Fotos por juntada, likes, comentarios, moderación y bucket privado | ✅ |
| 0005_notificaciones.sql | Dispositivos para push y registro de envíos | ✅ |
| 0006_solicitudes_contrasena.sql | Pedidos de contraseña nueva aprobados por admins | ✅ |
| 0007_juntadas_multigasto.sql | Juntadas con varios gastos, asistentes, transferencias netas, tipos de juntada | ✅ |
| 0008_perfil_alias_y_reglas.sql | Fecha de nacimiento, alias (hasta 5), juntada saldada sin gastos nuevos, subcategoría obligatoria | ✅ |
| 0009_calendario_y_notificaciones.sql | Eventos y asistencia, feriados, ubicación, borrar categorías sin uso, mensajes de notificación | ✅ |
| 0010_invitadas.sql | Invitadas en los gastos (nombre + responsable del club) | ✅ |
| 0011_invitadas_pagan_y_avisos.sql | Las invitadas pagan lo suyo, alias de devolución por gasto, aviso de evento nuevo | ✅ |
| 0012_quien_pago_y_frases.sql | Quien pagó puede editar y quitar su gasto; frases de evento nuevo sin repetir | ✅ |
| 0013_eventos_horario.sql | Eventos de todo el día y con hora de fin | ✅ |
| 0014_roedor.sql | Cantidad de avisos de deuda enviados por integrante (ranking "El roedor") | ✅ |
| 0015_eventos_desde_hasta_y_cron.sql | Eventos desde/hasta (varios días) y registro de corridas del cron | ✅ |
| 0016_cuotitas.sql | Las Cuotitas: compras con tarjeta en cuotas y préstamos, tarjetas (solo marca) | ⏳ |

## Correr las pruebas localmente

Con un Postgres 16 disponible (en CI se corren solas en cada PR). Cada prueba corre con
las migraciones hasta su número; si existe `NNNN_x.seed.sql`, se carga antes de aplicar
esa migración (sirve para probar migraciones que transforman datos).

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```

## Scripts de mantenimiento (`supabase/scripts/`)

| Script | Para qué |
|---|---|
| `borrar-datos-de-prueba.sql` | Borra juntadas, gastos, eventos, fotos (registros), notificaciones y auditoría. Conserva usuarias, alias, dispositivos, categorías y configuración. Después vaciar el bucket `photos` desde Storage. |
| `categorias-de-gasto-nuevas.sql` | Reemplaza las categorías de gasto por Bebida, Comida, Entradas, Transporte, Golosinas y Otro (sin subcategorías). Correr después del anterior. |
