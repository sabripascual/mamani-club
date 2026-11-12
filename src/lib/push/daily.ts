import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money/format";
import { planNotifications, type LogEntry, type PendingDebt } from "./plan";
import { sendToMember } from "./send";

const AR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

/** Corrida diaria (10:00 AR): calcula y manda las notificaciones de deudas. */
export async function runDailyNotifications(today = AR.format(new Date())) {
  const admin = createAdminClient();

  const [{ data: balances }, { data: subs }, { data: log }] = await Promise.all([
    admin.from("v_share_balances").select("expense_id, member_id, paid_by, currency, outstanding_cents, is_payer").gt("outstanding_cents", 0),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth"),
    admin.from("notification_log").select("kind, member_id, expense_id, sent_on").gte("sent_on", new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  const pending = (balances ?? []).filter((b) => !b.is_payer);
  if (pending.length === 0) return { planned: 0, sent: 0 };

  const ids = [...new Set(pending.map((b) => b.expense_id as string))];
  const [{ data: expenses }, { data: members }] = await Promise.all([
    admin.from("expenses").select("id, title, created_at").in("id", ids),
    admin.from("profiles").select("id").eq("status", "active"),
  ]);
  const exp = new Map((expenses ?? []).map((e) => [e.id as string, e]));
  const active = new Set((members ?? []).map((m) => m.id as string));

  const debts: PendingDebt[] = pending
    .filter((b) => exp.has(b.expense_id))
    .map((b) => ({
      expense_id: b.expense_id,
      title: exp.get(b.expense_id)!.title,
      created_on: AR.format(new Date(exp.get(b.expense_id)!.created_at)),
      debtor_id: b.member_id,
      creditor_id: b.paid_by,
      outstanding_cents: Number(b.outstanding_cents),
      currency: b.currency,
    }));

  const subsByMember = new Map<string, typeof subs>();
  for (const s of subs ?? []) subsByMember.set(s.member_id, [...(subsByMember.get(s.member_id) ?? []), s]);

  const plan = planNotifications(
    today,
    debts,
    (log ?? []) as LogEntry[],
    (m) => active.has(m) && (subsByMember.get(m)?.length ?? 0) > 0,
    (c, cur) => formatMoney(c, cur, { round: true }),
  );

  let sent = 0;
  for (const p of plan) {
    // 1) Reservar el envío (índice único por día): si el cron corre dos veces, no duplica.
    const { data: row, error } = await admin
      .from("notification_log")
      .insert({ kind: p.kind, member_id: p.member_id, expense_id: p.expense_id, step: p.step, sent_on: today, title: p.title, body: p.body })
      .select("id")
      .single();
    if (error || !row) continue;
    // 2) Enviar. Si no llegó a ningún dispositivo, se libera para no adelantar la secuencia.
    const delivered = await sendToMember(p.member_id, { title: p.title, body: p.body, url: p.url, tag: p.tag }, subsByMember.get(p.member_id) ?? []);
    if (delivered === 0) await admin.from("notification_log").delete().eq("id", row.id);
    else {
      await admin.from("notification_log").update({ devices: delivered }).eq("id", row.id);
      sent++;
    }
  }
  return { planned: plan.length, sent };
}
