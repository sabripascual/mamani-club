import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money/format";
import { planNotifications, type LogEntry, type PendingDebt } from "./plan";
import { planGuestReminders, type GuestDebt } from "./guest-plan";
import { sendToMember } from "./send";

const AR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

type Planned = { kind: string; member_id: string; juntada_id: string | null; ref_id?: string; step: number; title: string; body: string; url: string; tag: string };

/** Corrida diaria (10:00 AR): deudas entre integrantes y deudas de invitadas (a su responsable). */
export async function runDailyNotifications(today = AR.format(new Date())) {
  const admin = createAdminClient();

  // Deudas = transferencias pendientes de cada juntada (pago neto, estilo Tricount)
  // + partes de invitadas sin pagar (cada invitada le paga a quien pagó su gasto).
  const [{ data: transfers }, { data: guestDebts }, { data: subs }, { data: log }] = await Promise.all([
    admin.from("v_pending_transfers").select("juntada_id, currency, from_member, to_member, amount_cents"),
    admin.from("v_guest_debts").select("share_id, juntada_id, currency, guest_name, responsible_id, creditor_id, amount_cents, created_at").is("guest_paid_at", null),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth"),
    admin.from("notification_log").select("kind, member_id, juntada_id, sent_on").gte("sent_on", new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  if (!transfers?.length && !guestDebts?.length) return { planned: 0, sent: 0 };

  const ids = [...new Set([...(transfers ?? []), ...(guestDebts ?? [])].map((t) => t.juntada_id as string))];
  const [{ data: juntadas }, { data: members }] = await Promise.all([
    admin.from("juntadas").select("id, title, created_at").in("id", ids),
    admin.from("profiles").select("id, first_name, nickname").eq("status", "active"),
  ]);
  const jById = new Map((juntadas ?? []).map((j) => [j.id as string, j]));
  const active = new Set((members ?? []).map((m) => m.id as string));
  const nameOf = new Map((members ?? []).map((m) => [m.id as string, (m.nickname as string | null) || (m.first_name as string)]));

  const debts: PendingDebt[] = (transfers ?? [])
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

  const subsByMember = new Map<string, NonNullable<typeof subs>>();
  for (const s of subs ?? []) subsByMember.set(s.member_id, [...(subsByMember.get(s.member_id) ?? []), s]);
  const canNotify = (m: string) => active.has(m) && (subsByMember.get(m)?.length ?? 0) > 0;
  const money = (c: number, cur: string) => formatMoney(c, cur, { round: true });

  const logEntries = (log ?? []).map((l) => ({ kind: l.kind, member_id: l.member_id, expense_id: l.juntada_id, sent_on: l.sent_on })) as LogEntry[];
  // Deudoras: una por juntada (montos sumados). Quien cobra: resumen con todas las transferencias.
  const toPlanned = (p: ReturnType<typeof planNotifications>[number]): Planned => ({ ...p, juntada_id: p.expense_id });
  const guestPlan: Planned[] = planGuestReminders(
    today,
    (guestDebts ?? []).filter((g) => jById.has(g.juntada_id)).map((g): GuestDebt => ({
      share_id: g.share_id, juntada_id: g.juntada_id, juntada_title: jById.get(g.juntada_id)!.title, guest_name: g.guest_name,
      responsible_id: g.responsible_id, creditor_name: g.creditor_id === g.responsible_id ? "vos" : (nameOf.get(g.creditor_id) ?? "quien pagó"),
      amount_cents: Number(g.amount_cents), currency: g.currency, created_on: AR.format(new Date(g.created_at)),
    })),
    canNotify, money,
  ).map((r) => ({ ...r, step: 1 }));
  const plan: Planned[] = [
    ...planNotifications(today, debtorDebts, logEntries, canNotify, money).filter((p) => p.kind === "debtor").map(toPlanned),
    ...planNotifications(today, debts, logEntries, canNotify, money).filter((p) => p.kind === "creditor").map(toPlanned),
    ...guestPlan,
  ];

  let sent = 0;
  for (const p of plan) {
    // 1) Reservar el envío (índice único por día): si el cron corre dos veces, no duplica.
    const { data: row, error } = await admin
      .from("notification_log")
      .insert({ kind: p.kind, member_id: p.member_id, juntada_id: p.juntada_id, ref_id: p.ref_id ?? null, step: p.step, sent_on: today, title: p.title, body: p.body })
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
