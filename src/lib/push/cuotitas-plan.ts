/**
 * Recordatorios de Las Cuotitas (función pura, testeable).
 *  - Deudora: del 1 al 5 de cada mes, una por cuotita con cuotas impagas (la del mes y
 *    las atrasadas). Después del 5, cada 3 días hasta que pague.
 *  - Quien cobra: el 1 ("este mes te tienen que pagar…") y desde el 5, cada 3 días, con
 *    quiénes todavía no pagaron.
 */
export type DueInstallment = {
  cuotita_id: string;
  title: string;
  debtor_id: string;
  creditor_id: string;
  creditor_name: string;
  debtor_name: string;
  number: number;
  installments: number;
  due_month: string; // AAAA-MM-01
  amount_cents: number;
};

export type CuotitaReminder = {
  kind: "cuotita" | "cuotita_cobro"; member_id: string; ref_id: string | null; title: string; body: string; url: string; tag: string;
};

const DAY_TITLES = ["¡Llegó la cuotita, perrita! 💳", "La cuotita no se paga sola 🐀", "Acordate de la cuotita 💸", "Tu amiga espera la cuotita 🙏", "Último aviso del mes… o no 👀"];

/** ¿Toca avisar hoy? Del 1 al 5 todos los días; después, cada 3 días (8, 11, 14…). */
export const remindsOn = (day: number) => day <= 5 || (day - 5) % 3 === 0;

export function planCuotitaReminders(
  today: string, due: DueInstallment[], canNotify: (memberId: string) => boolean, money: (cents: number) => string,
): CuotitaReminder[] {
  const day = Number(today.slice(8, 10));
  const month = `${today.slice(0, 7)}-01`;
  const pending = due.filter((d) => d.due_month <= month && d.amount_cents > 0);
  const out: CuotitaReminder[] = [];

  if (remindsOn(day)) {
    // Deudoras: una por cuotita.
    const byDebt = new Map<string, DueInstallment[]>();
    for (const d of pending) {
      const k = `${d.debtor_id}|${d.cuotita_id}`;
      byDebt.set(k, [...(byDebt.get(k) ?? []), d]);
    }
    for (const list of byDebt.values()) {
      const d = list[0];
      if (!canNotify(d.debtor_id)) continue;
      const total = list.reduce((a, x) => a + x.amount_cents, 0);
      const late = list.some((x) => x.due_month < month);
      const title = late && day > 5 ? "Cuotita atrasada 🐀" : DAY_TITLES[Math.min(day, 5) - 1];
      const body = list.length === 1
        ? `Cuota ${d.number} de ${d.installments} de ${d.title}: ${money(total)} para ${d.creditor_name}.`
        : `Tenés ${list.length} cuotas de ${d.title} sin pagar: ${money(total)} para ${d.creditor_name}.`;
      out.push({ kind: "cuotita", member_id: d.debtor_id, ref_id: d.cuotita_id, title, body, url: `/cuotitas/${d.cuotita_id}`, tag: `cuotita-${d.cuotita_id}` });
    }
  }

  // Quien cobra: el 1, aviso del mes; desde el 5, quiénes faltan.
  if (day === 1 || (day >= 5 && remindsOn(day))) {
    const byCreditor = new Map<string, DueInstallment[]>();
    for (const d of pending) byCreditor.set(d.creditor_id, [...(byCreditor.get(d.creditor_id) ?? []), d]);
    for (const [creditor, list] of byCreditor) {
      if (!canNotify(creditor)) continue;
      const total = list.reduce((a, x) => a + x.amount_cents, 0);
      const names = [...new Set(list.map((x) => x.debtor_name))];
      const who = names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} y ${names.length - 2} más`;
      const msg = day === 1
        ? { title: "Este mes te tienen que pagar cuotitas 💳", body: `${money(total)} entre ${who}. Te avisamos si se olvidan.` }
        : { title: "Todavía te deben la cuotita 🐀", body: `${who} ${names.length === 1 ? "no te pagó" : "no te pagaron"}: ${money(total)} en total.` };
      out.push({ kind: "cuotita_cobro", member_id: creditor, ref_id: null, ...msg, url: "/cuotitas", tag: "cuotitas-cobro" });
    }
  }
  return out;
}
