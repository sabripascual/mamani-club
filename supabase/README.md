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
| 0003_gastos_y_pagos.sql | Categorías, juntadas, partes, pagos, saldos y funciones financieras | ⏳ |

## Correr las pruebas localmente

Con un Postgres 16 disponible (en CI se corren solas en cada PR):

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```
