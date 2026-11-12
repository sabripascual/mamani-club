# Diseño — Etapa B: juntadas con varios gastos (estilo Tricount)

Estado: **propuesta para aprobar**. Nada implementado.

## 1. Cómo se ve

```
🎉 Asado en lo de Caro · sáb 14/3 · Tipo: Juntada en casa         Parcialmente saldado
   Asistentes: Ana, Bea, Caro, Dani

   GASTOS                                                        Total $94.000
   🥩 Carne         $60.000   pagó Ana    · Ana, Bea, Caro, Dani
   🍺 Bebidas       $30.000   pagó Bea    · Bea, Caro, Dani
   🧊 Hielo          $4.000   pagó Caro   · Ana, Bea, Caro, Dani
   [+ Agregar gasto]

   CÓMO SALDAMOS (sugerido)
   Dani → Ana    $26.000   alias ana.mp     [Pagado]
   Caro → Ana    $18.000   alias ana.mp     ✓ pagado el 15/3
   Caro → Bea    $ 4.000   alias bea.uala   [Pagado]

   Tu saldo en esta juntada: debés $26.000
```

Cuentas del ejemplo (cada una: lo que pagó − su consumo):

| | Pagó | Consumió | Neto |
|---|---|---|---|
| Ana | 60.000 | 15.000 + 1.000 = 16.000 | **+44.000** (le deben) |
| Bea | 30.000 | 15.000 + 10.000 + 1.000 = 26.000 | **+4.000** |
| Caro | 4.000 | 15.000 + 10.000 + 1.000 = 26.000 | **−22.000** (debe) |
| Dani | 0 | 15.000 + 10.000 + 1.000 = 26.000 | **−26.000** |

La app sugiere la menor cantidad de transferencias que dejan todo en cero.

## 2. Modelo de datos

| Tabla | Qué guarda |
|---|---|
| `juntadas` (nueva) | Nombre, fecha, **tipo de juntada**, descripción, (ubicación y evento en la etapa D), quién la creó, estado activa/anulada. |
| `juntada_attendees` (nueva) | **Asistentes**: quiénes estuvieron. Es lo que cuenta para "la más presente". Más adelante se completa con el "Voy" del evento. |
| `expenses` → **gastos** | Pasa a pertenecer a una juntada (`juntada_id`). Cada gasto: nombre, monto, **categoría/subcategoría de gasto**, quién pagó, participantes y división (igualitaria o personalizada, como hoy). |
| `expense_shares` | Sin cambios: la parte de cada participante en cada gasto. |
| `settlements` (nueva) | **Transferencias** registradas dentro de una juntada: de quién, a quién, cuánto, cuándo y a qué alias. Reemplaza los pagos por parte. |
| `categories` | Se agrega `kind`: **tipo de juntada** o **categoría de gasto**. Dos listas editables por admins. |

### Reglas
- Todas las participantes de un gasto son asistentes (si se elige a alguien que no estaba, se suma como asistente).
- Una juntada usa una sola moneda (hoy ARS).
- **Saldo neto** de cada una en la juntada = lo que pagó en gastos − su consumo ± transferencias registradas. Siempre se calcula, nunca se guarda.
- **Transferencias sugeridas**: algoritmo que minimiza la cantidad de transferencias dentro de la juntada (el mismo que ya usamos en Balances).
- **"Pagado"** registra exactamente la transferencia sugerida. Si después cambia un gasto, las sugerencias se recalculan sobre lo que falta (pueden aparecer reintegros).
- **Estados**: Pendiente (sin transferencias) → Parcialmente saldado → **Saldado** (todas en cero).
- **Permisos**:
  - Cualquier asistente agrega gastos.
  - Cada gasto lo edita quien lo cargó o una admin.
  - La juntada (nombre, fecha, tipo, asistentes) la edita quien la creó o una admin.
  - Anular una juntada solo si no tiene transferencias registradas.
  - Marcar "Pagado": quien transfiere, quien recibe o una admin.
- Todo pasa por funciones de la base, auditadas (como hoy).

## 3. Qué cambia en el resto de la app

| Área | Cambio |
|---|---|
| Navegación | "Gastos" pasa a **"Juntadas"** (lista de juntadas con estado). |
| Balances | "Quién le debe a quién" = suma de las transferencias pendientes de todas las juntadas. |
| Dashboard y rankings | Participación = asistencia a juntadas. Rankings **por tipo de juntada** (fiestera, tercer tiempo, deportista) y **por categoría de gasto** (en qué se gasta más). |
| Mi perfil / vista Yo | Mi consumo = suma de mis partes; adelantado = gastos que pagué. |
| Fotos | Se cuelgan de la juntada (no del gasto). |
| Notificaciones de deuda | Una por juntada en la que debés (la secuencia de 5 mensajes sigue igual). Quien cobra: resumen cada 2 días. |
| "¡Poniendo estaba la gansa!" | Cuando te agregan a un gasto y tu saldo en la juntada queda negativo. |

## 4. Migración de lo que ya existe (automática, en la migración 0007)

1. Cada gasto actual se convierte en **una juntada + un gasto** con el mismo nombre, fecha y categoría.
2. Las participantes pasan a ser asistentes.
3. Los pagos actuales (parte → pagadora) se convierten en transferencias de la juntada; los reintegros, en transferencias al revés.
4. Las fotos pasan a la juntada.
5. Las categorías actuales quedan como **categorías de gasto**, y se crean los **tipos de juntada**.
6. Los saldos tienen que quedar exactamente iguales: la migración se prueba con datos de ejemplo antes de entregarla, y verifica los totales al terminar.

**Antes de correrla: backup.** El plan gratuito de Supabase no tiene restauración a un punto en el tiempo, así que se exportan las tablas a CSV con las instrucciones que se van a entregar junto con la migración.

## 5. Tipos de juntada propuestos (editables)

Juntada en casa · Salida / boliche · Bar / restaurante · Cumpleaños / celebración ·
Deportes · Tercer tiempo · Viaje / escapada · Otro

Los rankings usan códigos fijos (no cambian si se renombra): *fiestera* = Salida/boliche,
*reina del tercer tiempo* = Tercer tiempo, *deportista* = Deportes + Tercer tiempo.

## 6. Dudas para aprobar

1. ¿La lista de tipos de juntada de la sección 5 está bien? ¿Agregarías o sacarías alguno?
2. ¿Cualquier asistente puede agregar gastos a una juntada? (propuesta: sí)
3. ¿La lista explícita de **asistentes** al crear la juntada está bien? Así "estuvo" queda claro aunque no haya gastos.
4. ¿Te cierra que "Tercer tiempo" sea un tipo propio y que "deportista" cuente Deportes + Tercer tiempo?

## 7. Entrega

Se entrega en un solo PR, por el tamaño del cambio de modelo:
- La migración 0007 con pruebas de saldos y de la migración de datos.
- Las pantallas nuevas.
- La adaptación de estadísticas y notificaciones.
- Las instrucciones de backup.
