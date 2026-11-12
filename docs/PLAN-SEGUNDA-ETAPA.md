# MAMANÍ CLUB — Plan de la segunda etapa

Pedido de la dueña del producto, ordenado por tipo, con dudas abiertas y una
propuesta de etapas. **Nada de esto está implementado todavía.**

## 1. Errores a corregir

| # | Problema | Diagnóstico inicial |
|---|---|---|
| E1 | La foto de perfil no se guarda | El código de subida no tiene un error evidente; falta saber dónde falla (registro o perfil) y qué mensaje aparece para reproducirlo. |
| E2 | La push de "solicitud de acceso" llega sin texto y al tocarla no lleva a aprobar | Mismos síntomas que el service worker viejo (arreglado en el PR #8): el dispositivo puede seguir con la versión anterior. Verificar reabriendo la app; si persiste, investigar. |

## 2. Mejoras rápidas (sin cambios grandes de modelo)

| # | Pedido | Propuesta |
|---|---|---|
| M1 | Foto y nombre en la vista principal | Avatar + "Hola, {nombre}" en la cabecera de Inicio, al lado del logo. |
| M2 | Animación al pagar | Al tocar "Pagado": confetti/tilde rosa a pantalla completa con "¡Gracias perrita!" (~1,5 s). |
| M3 | Dashboard personal | Selector **Grupo / Yo** arriba del dashboard: los mismos indicadores y gráficos calculados solo con mis juntadas, mi consumo y mis adelantos. |
| M4 | Push al ser agregada a un gasto | Al crear o editar una juntada, a cada participante nueva que debe: **"¡Poniendo estaba la gansa!"** — "Debés $X de la juntada {juntada}". Abre la juntada. |

## 3. Transferencias: alias

| # | Pedido | Propuesta |
|---|---|---|
| T1 | Hasta 5 alias en el perfil | Lista de alias/CBU/CVU con etiqueta (ej. "Mercado Pago"), uno marcado como principal. |
| T2 | Elegir alias al cargar un gasto | Selector con los alias de **quien pagó** (el principal por defecto). |
| T3 | A quién y a qué alias transferir | En el detalle de la juntada y en Balances: "Transferile $X a Caro → alias `caro.mp`" con botón **Copiar**. También en la push de deuda. |

## 4. Calendario y eventos

| # | Pedido | Propuesta |
|---|---|---|
| C1 | Calendario con eventos y asistencia | Vista mensual + lista. Evento: título, fecha y hora, ubicación, descripción. Respuestas **Voy / Tal vez / No voy**. |
| C2 | Permisos | Solo la creadora (o una admin) edita. Eliminar solo si no tiene juntadas asociadas. |
| C3 | Convertir evento en juntada | Botón "Cargar gastos" que abre una juntada nueva prellenada (título, fecha, ubicación y las que dijeron "Voy" como participantes, editable) y queda vinculada al evento. |
| C4 | Ubicación + Google Maps | Campo de dirección/lugar en eventos y juntadas; botón "Abrir en Google Maps" (link de búsqueda, sin API paga). |
| C5 | Recordatorios push de eventos | Por definir cuándo (ver dudas). |
| C6 | Feriados argentinos | Cargados automáticamente una vez por año desde una API pública gratuita (ArgentinaDatos), editables por admins. |

## 5. Cumpleaños

| # | Pedido | Propuesta |
|---|---|---|
| B1 | Fecha de nacimiento en el alta | Campo en el registro; a las integrantes actuales se les pide completarla al entrar. |
| B2 | Evento fijo en el calendario | Cada cumpleaños aparece todos los años, automáticamente. |
| B3 | Mensaje en Inicio el día del cumple | Tarjeta festiva: "¡Hoy cumple @integrante!" |
| B4 | Push una semana antes | **"¡La semana que viene cumple años @integrante!"** (a todas menos la cumpleañera). |
| B5 | Push el día del cumple, 8:00 | **"¡Feliz cumple!"** — "@integrante cumple años hoy, saluden a la perrita!" |

## 6. Panel de notificaciones (admin)

| # | Pedido | Propuesta |
|---|---|---|
| N1 | Pool de mensajes aleatorios semanales | Lista editable de frases; una al azar por semana a todas. |
| N2 | Saludos de cumpleaños variados | Pool de saludos; se elige uno al azar cada vez. |
| N3 | Disparar desde admin | Formulario "Enviar notificación": título, texto, destinatarias (todas / algunas), link opcional. Queda registrado. |

## 7. Finanzas avanzadas (requieren definir el modelo)

| # | Pedido | Necesita |
|---|---|---|
| F1 | Gastos con tarjeta en cuotas + recordatorios del 1 al 5 de cada mes | Definir cómo se reparten las cuotas y qué se paga cada mes. Cambia el modelo de deudas (hoy cada deuda es un único pago exacto). |
| F2 | Préstamos y créditos | Definir qué es: ¿préstamo entre dos integrantes, con devolución en una o varias veces? |

## 8. Notas técnicas

- **Crons en Vercel gratis**: corren una vez por día, en cualquier minuto de la hora
  programada. Habría dos: 8:00 (cumpleaños, cuotas) y 10:00 (deudas, eventos). El envío
  semanal corre dentro del diario el día elegido.
- **Migraciones nuevas**: alias, eventos/asistencias, feriados, fecha de nacimiento,
  plantillas de notificaciones y, más adelante, cuotas y préstamos.
- **Privacidad**: la fecha de nacimiento se muestra como día y mes; el año queda
  oculto salvo que se decida lo contrario.

## 9. Decisiones tomadas

**Juntadas con varios gastos (estilo Tricount)**
- Una juntada es el encuentro y contiene uno o más **gastos**. Cada gasto tiene su
  pagadora, sus participantes, su división y su categoría/subcategoría.
- Cada una debe solo por los gastos en los que participó.
- **Pago neto por juntada**: la app compensa dentro de la juntada y sugiere
  "Caro → Ana $13.500 · alias ana.mp". Un "Pagado" salda todo lo de ese par en esa
  juntada; el detalle por gasto sigue visible.
- Estados de la juntada: Pendiente → Parcialmente saldado → **Saldado**.
- **Categorías**: la juntada tiene categoría (tipo de encuentro) y cada gasto también
  (tipo de gasto). Rankings de ambos. Nombres editables por admins.
- **"Estuvo"**: puso "Voy" en el evento o participa en al menos un gasto de la juntada.
  Una participación por juntada.
- Las juntadas existentes se migran a "juntada con un único gasto".

**Calendario**: todas ven todos los eventos y se pueden sumar. 1 evento = 1 juntada.
Recordatorios: día anterior 10:00 y 2 h antes (a "Voy" y "Tal vez").

**Cumpleaños**: día, mes y edad visibles. Aviso de la semana previa a todas menos la
cumpleañera.

**Alias**: solo alias (hasta 5, uno principal).

**Panel de notificaciones**: frases escritas por las admins, enviadas los lunes 8:00.
Envíos manuales desde el panel.

**Cuotas con tarjeta (créditos)**: se carga el total; se divide entre las deudoras y
ese monto en N cuotas mensuales. Recordatorios del 1 al 5 de cada mes a las deudoras y
a quien cobra, hasta saldar la cuota del mes. **Préstamos: fuera de alcance.**

## 10. Etapas

| Etapa | Contenido | Migración | Tamaño |
|---|---|---|---|
| **A** | E1, E2, M1, M2, M3, M4 | No | Chico |
| **B** | Juntadas con varios gastos, pago neto por juntada, categorías de juntada y de gasto | Sí | Grande |
| **C** | Alias de transferencia (T1–T3) | Sí | Chico-mediano |
| **D** | Calendario, eventos, ubicación, convertir en juntada, recordatorios (C1–C5) | Sí | Grande |
| **E** | Cumpleaños y feriados (B1–B5, C6) | Sí | Mediano |
| **F** | Panel de notificaciones (N1–N3) | Sí | Mediano |
| **G** | Gastos en cuotas con tarjeta (F1) | Sí | Grande |
