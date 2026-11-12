import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money/format";
import { planNotifications, type LogEntry, type PendingDebt } from "./plan";
import { sendToMember } from "./send";

const AR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

/** Corrida diaria (10:00 AR): calcula y manda las notificaciones de deudas. */
export async function runDailyNotifications(today = AR.format(new Date())) {
  const admin = createAdminClient();

  // Deudas = transferencias pendientes de cada juntada (pago neto, estilo Tricount).
  const [{ data: transfers }, { data: subs }, { data: log }] = await Promise.all([
    admin.from("v_pending_transfers").select("juntada_id, currency, from_member, to_member, amount_cents"),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth"),
    admin.from("notification_log").select("kind, member_id, juntada_id, sent_on").gte("sent_on", new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  if (!transfers || transfers.length === 0) return { planned: 0, sent: 0 };

  const ids = [...new Set(transfers.map((t) => t.juntada_id as string))];
  const [{ data: juntadas }, { data: members }, { data: guestShares }] = await Promise.all([
    admin.from("juntadas").select("id, title, created_at").in("id", ids),
    admin.from("profiles").select("id").eq("status", "active"),
    // Partes de invitadas en esas juntadas: se menciona en el aviso a su responsable.
    admin.from("expense_shares").select("member_id, guest_name, expenses!inner(juntada_id, status)")
      .not("guest_name", "is", null).in("expenses.juntada_id", ids).eq("expenses.status", "active"),
  ]);
  const guestsOf = new Map<string, Set<string>>(); // "juntada:integrante" → nombres de sus invitadas
  for (const s of (guestShares ?? []) as unknown as { member_id: string; guest_name: string; expenses: { juntada_id: string } }[]) {
    const k = `${s.expenses.juntada_id}:${s.member_id}`;
    guestsOf.set(k, (guestsOf.get(k) ?? new Set()).add(s.guest_name));
  }
  const guestNote = (juntadaId: string, memberId: string) => {
    const names = [...(guestsOf.get(`${juntadaId}:${memberId}`) ?? [])];
    if (names.length === 0) return "";
    return names.length === 1 ? `\nIncluye la parte de tu invitada ${names[0]}` : `\nIncluye la parte de tus invitadas ${names.join(", ")}`;
  };
  const jById = new Map((juntadas ?? []).map((j) => [j.id as string, j]));
  const active = new Set((members ?? []).map((m) => m.id as string));

  const debts: PendingDebt[] = transfers
    .filter((t) => jById.has(t.juntada_id))
    .map((t) => ({
      expense_id: t.juntada_id,
      title: jById.get(t.juntada_id)!.title,
      created_on: AR.format(new Date(jById.get(t.juntada_id)!.created_at)),
      debtor_id: t.from_member,
      creditor_id: t.to_member,
      outstanding_cents: Number(t.amount_cents),
      currency: t.currency,
    }));
  // Una deudora puede deberle a dos personas en la misma juntada: una sola notificación por juntada.
  const merged = new Map<string, PendingDebt>();
  for (const d of debts) {
    const k = `${d.expense_id}:${d.debtor_id}`;
    const prev = merged.get(k);
    merged.set(k, prev ? { ...prev, outstanding_cents: prev.outstanding_cents + d.outstanding_cents } : d);
  }
  const debtorDebts = [...merged.values()];

  const subsByMember = new Map<string, typeof subs>();
  for (const s of subs ?? []) subsByMember.set(s.member_id, [...(subsByMember.get(s.member_id) ?? []), s]);

  const logEntries = (log ?? []).map((l) => ({ kind: l.kind, member_id: l.member_id, expense_id: l.juntada_id, sent_on: l.sent_on })) as LogEntry[];
  // Deudoras: una por juntada (montos sumados). Quien cobra: resumen con todas las transferencias.
  const plan = [
    ...planNotifications(today, debtorDebts, logEntries, (m) => active.has(m) && (subsByMember.get(m)?.length ?? 0) > 0, (c, cur) => formatMoney(c, cur, { round: true }))
      .filter((p) => p.kind === "debtor")
      .map((p) => ({ ...p, body: p.body + guestNote(p.expense_id ?? "", p.member_id) })),
    ...planNotifications(today, debts, logEntries, (m) => active.has(m) && (subsByMember.get(m)?.length ?? 0) > 0, (c, cur) => formatMoney(c, cur, { round: true }))
      .filter((p) => p.kind === "creditor"),
  ];

  let sent = 0;
  for (const p of plan) {
    // 1) Reservar el envío (índice único por día): si el cron corre dos veces, no duplica.
    const { data: row, error } = await admin
      .from("notification_log")
      .insert({ kind: p.kind, member_id: p.member_id, juntada_id: p.expense_id, step: p.step, sent_on: today, title: p.title, body: p.body })
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
