# Flujo de trabajo con Git

## Ramas

| Rama | Para qué | Quién escribe |
|---|---|---|
| `main` | **Producción.** Lo que está acá es lo que ven las integrantes en `mamani-club.vercel.app`. Siempre estable. | Solo mediante Pull Request aprobado |
| `feat/<tema>` · `claude/<…>` | Una funcionalidad o fase (ej. `feat/fase-1-fundamentos`) | Desarrollo |
| `fix/<tema>` | Corrección de un error | Desarrollo |
| `docs/<tema>` | Solo documentación | Desarrollo |

Modelo **trunk-based**: no hay rama `develop`. Cada rama nace de `main`, vive poco y vuelve a
`main` con un Pull Request. Para un equipo chico es lo más simple y Vercel ya da un entorno
de prueba por cada rama.

## Ciclo de una funcionalidad

1. Crear la rama desde `main` actualizado.
2. Commits chicos con mensajes en formato *Conventional Commits*:
   `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `db:` (migraciones).
3. Push → **Vercel crea un Preview Deployment** con URL propia para probar desde el celular.
4. Abrir Pull Request hacia `main`. El CI (GitHub Actions) corre lint, typecheck y tests.
5. Revisión y aprobación por la dueña del repo → *Squash and merge*.
6. Vercel despliega `main` a producción automáticamente.

## Base de datos

- Cada cambio de esquema es una migración nueva en `supabase/migrations/` (nunca se edita
  una migración ya aplicada en producción).
- Las migraciones se aplican a producción después del merge, antes o junto con el deploy.

## Protección de `main` (configurar en GitHub)

Settings → Branches → Add branch ruleset → `main`:
- Require a pull request before merging.
- Require status checks to pass (cuando exista el CI).
- Block force pushes.
