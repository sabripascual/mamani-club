import { creditorMessage, debtorMessage } from "./messages";

/**
 * Planifica las notificaciones del día. Función pura (testeable):
 *  - Deudoras: 1 por día, una por cada juntada en la que deben.
 *  - Quien adelantó: 1 cada 2 días, resumida.
 *  - Arranca el día siguiente de cargar la juntada.
 *  - La secuencia avanza solo cuando el mensaje efectivamente se envió (si la
 *    integrante no tenía dispositivos, no "pierde" mensajes).
 *  - Se corta sola: si la deuda ya está saldada no aparece en `debts`.
 */

export type PendingDebt = {
  expense_id: string;
  title: string;
  created_on: string; // fecha (AR) en que se cargó la juntada
  debtor_id: string;
  creditor_id: string;
  outstanding_cents: number;
  currency: string;
};

export type LogEntry = { kind: "debtor" | "creditor" | "test"; member_id: string; expense_id: string | null; sent_on: string };

export type Planned = {
  kind: "debtor" | "creditor";
  member_id: string;
  expense_id: string | null;
  step: number;
  title: string;
  body: string;
  url: string;
  tag: string;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function planNotifications(
  today: string,
  debts: PendingDebt[],
  log: LogEntry[],
  hasDevice: (memberId: string) => boolean,
  money: (cents: number, currency: string) => string,
): Planned[] {
  const out: Planned[] = [];
  // Solo deudas de juntadas cargadas ANTES de hoy (arranca al día siguiente).
  const eligible = debts.filter((d) => d.outstanding_cents > 0 && d.created_on < today && d.debtor_id !== d.creditor_id);

  // --- Deudoras: una por juntada, todos los días ---
  for (const d of eligible) {
    if (!hasDevice(d.debtor_id)) continue;
    const previous = log.filter((l) => l.kind === "debtor" && l.member_id === d.debtor_id && l.expense_id === d.expense_id);
    if (previous.some((l) => l.sent_on === today)) continue;
    const step = previous.length + 1;
    const msg = debtorMessage(step, d.title, money(d.outstanding_cents, d.currency));
    out.push({ kind: "debtor", member_id: d.debtor_id, expense_id: d.expense_id, step, ...msg, url: `/gastos/${d.expense_id}`, tag: `deuda-${d.expense_id}` });
  }

  // --- Quien adelantó: una resumida cada 2 días ---
  const byCreditor = new Map<string, PendingDebt[]>();
  for (const d of eligible) byCreditor.set(d.creditor_id, [...(byCreditor.get(d.creditor_id) ?? []), d]);
  for (const [creditor, list] of byCreditor) {
    if (!hasDevice(creditor)) continue;
    // Agrupamos por juntada (varias deudoras en la misma juntada = una juntada).
    const byExpense = new Map<string, { title: string; created_on: string }>();
    for (const d of list) byExpense.set(d.expense_id, { title: d.title, created_on: d.created_on });
    const oldest = [...byExpense.values()].sort((a, b) => a.created_on.localeCompare(b.created_on))[0];

    // Secuencia del período de deuda actual: envíos desde que se cargó la juntada
    // pendiente más vieja (si en algún momento quedó todo saldado, vuelve a empezar).
    const previous = log
      .filter((l) => l.kind === "creditor" && l.member_id === creditor && l.sent_on >= oldest.created_on)
      .sort((a, b) => b.sent_on.localeCompare(a.sent_on));
    if (previous[0] && daysBetween(previous[0].sent_on, today) < 2) continue;

    const step = previous.length + 1;
    // Total por moneda; normalmente es una sola (ARS).
    const totals = new Map<string, number>();
    for (const d of list) totals.set(d.currency, (totals.get(d.currency) ?? 0) + d.outstanding_cents);
    const amount = [...totals].map(([c, v]) => money(v, c)).join(" + ");
    const msg = creditorMessage(step, oldest.title, byExpense.size - 1, amount);
    out.push({ kind: "creditor", member_id: creditor, expense_id: null, step, ...msg, url: "/gastos/balances", tag: "cobros" });
  }
  return out;
}
