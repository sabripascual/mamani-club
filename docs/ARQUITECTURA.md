# MAMANÍ CLUB — Arquitectura y decisiones técnicas

> "La cuenta de nuestras juntadas."
> Documento vivo. Cada decisión importante se registra acá (sección 9, ADRs).

## 1. Estado inicial

Repositorio vacío (sin commits). Se define el stack desde cero.

## 2. Restricción principal: costo cero

| Servicio | Plan | Qué usamos | Límites relevantes (plan gratuito) |
|---|---|---|---|
| **Vercel** | Hobby | Hosting Next.js, HTTPS, funciones serverless, 1 cron diario | Uso no comercial (grupo privado: OK). Cron máx. 1 vez/día. |
| **Supabase** | Free | Postgres, Auth, Storage, RLS, funciones SQL (RPC) | 500 MB de base, **1 GB de archivos**, 5 GB de egress/mes, **pausa tras 7 días sin actividad** |
| **GitHub** | Free | Repo, CI con GitHub Actions | 2.000 min/mes de Actions en repos privados |
| **Web Push (VAPID)** | Estándar abierto | Notificaciones push PWA | Gratis; en iOS solo con la app instalada (iOS 16.4+) |
| **SMTP (Gmail con contraseña de aplicación)** | Gratis | Emails de recuperación de contraseña | ~500 emails/día |

### Cómo esquivamos los límites

- **Fotos (el límite más ajustado: 1 GB).** Se comprimen *en el navegador* antes de subirse:
  versión grande (~1600 px, WebP/JPEG, ~250–400 KB) + miniatura (~400 px, ~30 KB).
  Estimación: ~2.500–3.500 fotos en 1 GB. La transformación de imágenes de Supabase
  es de pago, por eso se hace del lado del cliente.
  El almacenamiento queda detrás de una interfaz (`StorageProvider`) para poder mover
  las fotos a **Cloudflare R2** (10 GB gratis, sin costo de egress) si el álbum crece.
- **Egress (5 GB/mes).** Galerías y carrusel usan miniaturas y carga diferida (lazy loading).
  Las URLs firmadas se cachean en el cliente mientras siguen vigentes.
- **Pausa por inactividad.** Un cron diario de Vercel llama a un endpoint que hace una
  consulta liviana a la base, y así el proyecto nunca llega a 7 días sin actividad.
- **Emails.** El SMTP por defecto de Supabase solo envía a direcciones del equipo del
  proyecto. Como la aprobación del admin ya es la barrera de acceso, la **confirmación de
  email queda desactivada** y se configura Gmail SMTP solo para "olvidé mi contraseña".

## 3. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Server Components y Server Actions: la lógica sensible corre en el servidor; deploy nativo en Vercel |
| Estilos | **Tailwind CSS** + componentes propios basados en **shadcn/ui** (Radix) | Control total de la estética editorial; accesibilidad de Radix |
| Tipografías | **Fraunces** (títulos editoriales) + **Manrope** (interfaz) vía `next/font` | Personalidad sin perder legibilidad; sin requests externos |
| Iconos | **Lucide** | Iconografía lineal |
| Animaciones | **Framer Motion** (Motion) | Microinteracciones y slides del Wrapped |
| Gráficos | **Recharts** | Livianos, personalizables con la paleta |
| Carrusel | **Embla Carousel** | Gestos táctiles fluidos |
| Validación | **Zod** | Esquemas compartidos entre formulario y servidor |
| Formularios | **React Hook Form** | |
| Datos | **Supabase** (`@supabase/ssr`) | Auth + Postgres + Storage en un solo servicio gratuito |
| PWA | **Serwist** (sucesor de next-pwa) | Service worker y manifest con soporte de App Router |
| Exportación del Wrapped | **html-to-image** (PNG por slide) + **jsPDF** | Se genera en el cliente, sin costo de servidor |
| Tests unitarios | **Vitest** | Lógica financiera pura (división, saldos, simplificación) |
| Tests de base | **pgTAP** con Supabase CLI local (Docker) | RLS, triggers y funciones transaccionales |
| Tests E2E | **Playwright** | Flujos completos y validación responsive/PWA |

## 4. Principios de diseño del backend

1. **La base es la fuente de verdad de permisos.** Todas las tablas tienen RLS. El frontend
   oculta botones por UX, pero aunque alguien llame la API directamente, Postgres rechaza
   la operación.
2. **Operaciones financieras = funciones SQL transaccionales** (`SECURITY DEFINER`, con
   validación interna de rol y estado). Crear o editar un gasto, registrar o anular un pago:
   cada una es una sola transacción que valida, escribe, recalcula y audita.
   El cliente no puede escribir directamente en `expense_shares` ni en `payments`.
3. **Dinero en enteros.** Importes en centavos (`bigint`). Nunca `float`. Los tipos de
   cambio son `numeric(18,8)`.
4. **Los estados derivados se calculan, no se guardan a mano.** El estado de liquidación
   sale de una vista que compara obligaciones contra pagos.
5. **Nada se borra físicamente si tiene historia.** Gastos anulados, pagos anulados,
   integrantes desactivados y fotos moderadas usan *soft delete* + auditoría.
6. **Auditoría por triggers.** Un trigger genérico escribe en `audit_log` con valores
   anteriores y posteriores en JSONB. La tabla no tiene permisos de UPDATE/DELETE para
   ningún rol de la aplicación.

## 5. Modelo de datos (borrador)

```
profiles            id (=auth.users.id), first_name, last_name, username (único), nickname,
                    avatar_path, role ('admin'|'member'), status ('pending'|'active'|'inactive'|'rejected'),
                    joined_at, created_at

categories          id, parent_id (null = categoría principal), name, icon, color, sort_order, archived

currencies          code ('ARS','USD','EUR',…), name, symbol, decimals
fx_rates            id, from_currency, to_currency, rate, rate_date, source ('manual'|proveedor), created_by
                    → preparado para un proveedor automático de cotizaciones

expenses            id, title, occurred_on (date, obligatorio), category_id, subcategory_id, description,
(= juntadas)        amount_cents, currency, base_currency ('ARS'), fx_rate, fx_rate_date, base_amount_cents,
                    paid_by, created_by, split_type ('equal'|'custom'), status ('active'|'void'),
                    created_at, updated_at

expense_shares      expense_id, member_id, amount_cents (en moneda del gasto)
(obligaciones)      → una fila por participante. Si el pagador participa, su fila es su
                      consumo propio (no genera deuda consigo misma).
                    → si el pagador NO participa, no tiene fila: no hay consumo a su nombre.

payments            id, expense_id, from_member, to_member, amount_cents, currency, paid_on,
                    method ('transferencia'|'efectivo'|'mercadopago'|…), note,
                    idempotency_key (único), status ('active'|'void'), void_reason, created_by, created_at

photos              id, expense_id, uploaded_by, storage_path, thumb_path, width, height, size_bytes,
                    mime_type, taken_at, created_at, deleted_at, deleted_by, moderation_reason
photo_likes         photo_id, member_id, created_at          PK (photo_id, member_id)  → un like por persona
photo_comments      id, photo_id, author_id, body, created_at, deleted_at, deleted_by

audit_log           id, actor_id, occurred_at, entity, entity_id, action, old_values jsonb,
                    new_values jsonb, reason     → solo INSERT (vía trigger)

notifications       id, recipient_id, type, payload jsonb, read_at, created_at
notification_prefs  member_id, type, push_enabled, in_app_enabled
push_subscriptions  id, member_id, endpoint, keys jsonb, user_agent, created_at
```

### Vistas calculadas

- `v_expense_settlement`: por gasto y participante → asignado, pagado, pendiente y estado
  (`pendiente` / `parcial` / `saldado`).
- `v_member_balances`: por integrante y moneda → adelantado, consumo propio, le deben,
  debe y recibido.
- Estadísticas y rankings: funciones SQL con filtros (año, mes, rango, categoría,
  integrante) que cuentan **una participación por juntada** desde `expense_shares`.

### Reglas financieras clave

- **División igualitaria con resto:** $100.000 / 3 = 33.333,33 × 3 = 99.999,99. El centavo
  sobrante se asigna de forma determinística (por orden de ID) para que la suma sea exacta.
- **División personalizada:** la función rechaza el gasto si `Σ shares ≠ amount_cents`.
- **Deuda:** cada participante distinto del pagador debe `share − pagos activos` al pagador.
- **Sobrepago:** rechazado salvo que se marque explícitamente como crédito (ver pregunta 3).
- **Pago duplicado:** `idempotency_key` único por envío de formulario (protege contra
  doble clic o reintentos de red) + verificación de que el pago no supere lo pendiente.
- **Edición de un gasto con pagos:** se recalculan los shares dentro de la transacción, se
  guarda un snapshot antes/después en auditoría y, si a alguien le queda un pago mayor que
  su nuevo share, se marca la diferencia como saldo a favor.

### Simplificación de deudas

Algoritmo greedy sobre saldos netos por moneda (el que más debe le paga al que más le deben)
→ como máximo *n−1* transferencias. Es **solo una sugerencia** calculada al vuelo: no
modifica gastos, obligaciones ni pagos.

## 6. Seguridad

- RLS en todas las tablas: función `is_active_member()` como condición base de lectura;
  `is_admin()` para la gestión.
- Usuarios `pending`, `rejected` o `inactive` no leen nada salvo su propio perfil. El
  middleware de Next los redirige a "Tu solicitud está en revisión".
- Un integrante no puede cambiar su propio `role` ni su `status` (lo bloquea un trigger,
  además de RLS).
- Storage: bucket `photos` **privado**; lectura solo con URLs firmadas de vida corta, que
  se generan solo para miembros activos. Las políticas de Storage replican las de la tabla.
  Formatos permitidos: JPEG, PNG, WebP y HEIC (convertido en el cliente); tamaño máximo
  validado en el cliente y en la política del bucket.
- La `service_role` key vive solo en variables de entorno de Vercel (servidor). En el
  frontend solo va la clave pública (anon/publishable).

## 7. Estructura del proyecto (prevista)

```
app/
  (auth)/login, registro, pendiente
  (app)/inicio, gastos, gastos/[id], gastos/nuevo, rankings, perfil, perfil/[username],
        recuerdos/[expenseId], wrapped/[year]
  (app)/admin/solicitudes, integrantes, categorias, auditoria, configuracion
  api/cron/keepalive, api/push/...
components/ui/      primitivas (botón, tarjeta, avatar, sheet…)
components/…        componentes de dominio (ExpenseCard, BalanceList, PhotoCarousel…)
lib/money/          división, formateo y simplificación (puras y testeadas)
lib/supabase/       clientes server/browser y tipos generados
supabase/migrations/   SQL versionado
supabase/tests/        pgTAP
tests/e2e/             Playwright
```

## 8. Plan por fases

Se sigue el plan del prompt maestro, con un ajuste: **la auditoría se construye en la Fase 1
y en la Fase 2** (no en la 5), porque tiene que existir desde el primer gasto real.

| Fase | Entregable | Pruebas que la cierran |
|---|---|---|
| 1 | Next + Supabase, auth, registro → pending, aprobación, roles, RLS base, auditoría base, diseño, navegación y PWA instalable | Casos 1–5, 8, 38–42 |
| 2 | Gastos, categorías, división, multidivisa manual, pagos, balances, simplificación, perfil financiero | Casos 6, 7, 9–18, 22 |
| 3 | Dashboard, gráficos, rankings, filtros | Casos 19–21 |
| 4 | Álbum, subida comprimida, carrusel "Así la pasamos", likes, comentarios, moderación, notificaciones | Casos 23–32 |
| 5 | Wrapped, exportación, hardening de seguridad, QA responsive y PWA | Casos 33–37 + regresión completa |

## 9. Registro de decisiones (ADR)

- **ADR-001** Next.js + Supabase + Vercel, en planes gratuitos.
- **ADR-002** Lógica financiera en funciones SQL transaccionales; el cliente no escribe en
  tablas financieras.
- **ADR-003** Importes en centavos (`bigint`).
- **ADR-004** Compresión de imágenes en el cliente; almacenamiento abstraído para poder
  migrar a R2.
- **ADR-005** Confirmación de email desactivada; la aprobación del admin es el control de
  acceso.
- **ADR-006** Zona horaria `America/Argentina/Buenos_Aires`: `occurred_on` es `date` (sin
  hora); los timestamps son `timestamptz` y se muestran en hora de Buenos Aires.

## 10. Riesgos y ambigüedades

Ver la sección "Preguntas abiertas" en el issue o en el chat de planificación. Las respuestas
se incorporan acá como ADR.
