# Fase 5 — Notificaciones push de deudas

Especificación acordada con la dueña del producto. Se implementa después de la Fase 4.

## Reglas

- Solo **push en el celular** (PWA). Sin emails.
- Horario: **10:00 hora Argentina** (13:00 UTC; Argentina no tiene horario de verano).
  > En el plan gratuito de Vercel el cron diario puede ejecutarse en cualquier momento
  > dentro de esa hora (10:00–10:59).
- Siempre asociadas a una **juntada con deuda**. Se cortan cuando esa deuda se salda
  ("Marcar como pagado").
- La secuencia de una juntada **arranca al día siguiente de cargarla**.
- El último mensaje de cada secuencia **se repite** hasta que se salde.
- Formato: título (el sistema lo muestra en negrita) + texto debajo + ícono de la app.
  Al tocarla, abre la juntada.

### Deudoras — 1 por día, **una notificación por cada juntada** en la que deben

| Día | Título | Texto |
|---|---|---|
| 1 | Perrita deudora! | No te olvides de transferir tu parte de la juntada: *{nombre de la juntada}* |
| 2 | Rata inmunda, animal rastrero… | Tu deuda te sigue esperando |
| 3 | URA SECA PAGAAAAA! | Estás a un día de que mandemos el sicario… |
| 4 | DEJÁ DE MOSTRAR LA HILACHA! | Hasta a mí me da vergüenza…… |
| 5+ | SI TODAVÍA NO TENÉS VERGÜENZA | Buscate un 8 hs!!!!! |

### Quien adelantó la plata — 1 cada 2 días, **resumida** (una sola aunque le deban en varias)

Nombra la juntada pendiente más vieja y cuántas más tiene sin saldar.

| Envío | Título | Texto |
|---|---|---|
| 1 | Viejitaaa! Todavía te deben | La plata no vuelve sola… |
| 2 | APURÁ ESAS RATONAS! | Tirá un mensajito al grupo… |
| 3+ | NOSOTRAS TE AVISAMOS! | Si no les hacés acordar… ¡a llorar al campito! |

## Detalle de implementación

- A partir del mensaje 2 de deudoras, el texto agrega una segunda línea con la juntada y
  el monto ("Asado · $ 25.000"), porque llega una notificación por juntada.
- El resumen de cobros agrega: "{juntada más vieja} y N juntadas más · te deben $X".
- Si una integrante no tiene dispositivos activados, no se le manda nada y su secuencia
  no avanza (empieza por el mensaje 1 cuando las active).
- La secuencia de cobros se reinicia si en algún momento quedó todo saldado.

## Decisiones técnicas

- Web Push estándar con claves VAPID (gratis). La clave privada va solo en Vercel.
- En iPhone requiere la app instalada en la pantalla de inicio (iOS 16.4+) y que la
  integrante active las notificaciones con un botón (Apple exige un toque explícito).
- Tablas: suscripciones por dispositivo y registro de envíos (para la secuencia y para
  no duplicar envíos el mismo día).
- Un solo cron diario a las 10:00 que también mantiene activo Supabase.
