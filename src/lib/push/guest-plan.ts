/**
 * Recordatorios de invitadas que no pagaron: le llegan a su RESPONSABLE (la invitada no
 * tiene la app). Desde el día siguiente a cargar el gasto y después cada 2 días, hasta
 * que la responsable o una admin marquen que pagó.
 */
export type GuestDebt = {
  share_id: string;
  juntada_id: string;
  juntada_title: string;
  guest_name: string;
  responsible_id: string;
  creditor_name: string;
  amount_cents: number;
  currency: string;
  created_on: string; // AAAA-MM-DD (hora AR)
};

export type GuestReminder = {
  kind: "guest_debt"; member_id: string; juntada_id: string; ref_id: string; title: string; body: string; url: string; tag: string;
};

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function planGuestReminders(
  today: string, debts: GuestDebt[], canNotify: (memberId: string) => boolean, money: (cents: number, currency: string) => string,
): GuestReminder[] {
  return debts
    .filter((d) => d.amount_cents > 0 && canNotify(d.responsible_id))
    .filter((d) => { const n = days(d.created_on, today); return n >= 1 && (n - 1) % 2 === 0; })
    .map((d) => ({
      kind: "guest_debt",
      member_id: d.responsible_id,
      juntada_id: d.juntada_id,
      ref_id: d.share_id,
      title: `Tu invitada ${d.guest_name} sigue debiendo 🐀`,
      body: `Le debe ${money(d.amount_cents, d.currency)} a ${d.creditor_name} por ${d.juntada_title}. Cuando pague, marcalo en la juntada.`,
      url: `/gastos/${d.juntada_id}`,
      tag: `invitada-${d.share_id}`,
    }));
}
