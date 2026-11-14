import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money/format";
import { pushConfigured, sendToMember } from "./send";
import { planCuotitaReminders, type DueInstallment } from "./cuotitas-plan";
import { monthLabel } from "@/lib/cuotitas/types";

type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };
const AR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

async function names(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const { data } = await admin.from("profiles").select("id, first_name, nickname").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, (p.nickname as string | null) || (p.first_name as string)]));
}
async function subsFor(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const { data } = ids.length ? await admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", ids) : { data: [] };
  const by = new Map<string, Sub[]>();
  for (const s of (data ?? []) as Sub[]) by.set(s.member_id, [...(by.get(s.member_id) ?? []), s]);
  return by;
}

/** Cuotita nueva: a cada deudora, cuántas cuotas le tocan, de cuánto y desde cuándo. */
export async function notifyCuotitaCreated(cuotitaId: string, actorId: string) {
  if (!pushConfigured()) return;
  const admin = createAdminClient();
  const [{ data: c }, { data: inst }] = await Promise.all([
    admin.from("cuotitas").select("title, kind, paid_by, installments, first_month").eq("id", cuotitaId).single(),
    admin.from("cuotita_installments").select("member_id, amount_cents, number").eq("cuotita_id", cuotitaId),
  ]);
  if (!c) return;
  const debtors = [...new Set((inst ?? []).map((i) => i.member_id as string))].filter((m) => m !== actorId);
  if (debtors.length === 0) return;
  const [who, subs] = await Promise.all([names(admin, [c.paid_by, actorId]), subsFor(admin, debtors)]);
  await Promise.all(debtors.map((m) => {
    const mine = (inst ?? []).filter((i) => i.member_id === m);
    const first = Number(mine.find((i) => i.number === 1)?.amount_cents ?? 0);
    const s = subs.get(m);
    if (!s?.length) return 0;
    const cuotas = c.installments === 1 ? `una cuota de ${formatMoney(first)}` : `${c.installments} cuotas de ${formatMoney(first)}`;
    return sendToMember(m, {
      title: c.kind === "prestamo" ? "Mamaní te banca 💸" : "¡Nueva cuotita! 💳",
      body: `${who.get(c.paid_by) ?? "Alguien"} cargó ${c.title}: te tocan ${cuotas} desde ${monthLabel(c.first_month)}.`,
      url: `/cuotitas/${cuotitaId}`,
      tag: `cuotita-${cuotitaId}`,
    }, s);
  }));
}

/** Cuotas pagadas: a quien cobra (si la marcó la deudora) o a la deudora (si la marcó quien cobra). */
export async function notifyInstallmentsPaid(ids: string[], actorId: string) {
  if (!pushConfigured() || ids.length === 0) return;
  const admin = createAdminClient();
  const { data: inst } = await admin.from("cuotita_installments").select("cuotita_id, member_id, amount_cents, number").in("id", ids);
  if (!inst?.length) return;
  const { data: c } = await admin.from("cuotitas").select("id, title, paid_by").eq("id", inst[0].cuotita_id).single();
  if (!c) return;
  const debtor = inst[0].member_id as string;
  const total = inst.reduce((a, i) => a + Number(i.amount_cents), 0);
  const cuotas = inst.length === 1 ? `la cuota ${inst[0].number}` : `${inst.length} cuotas`;
  const [who, subs] = await Promise.all([names(admin, [debtor, c.paid_by]), subsFor(admin, [debtor, c.paid_by])]);
  const to = actorId === c.paid_by ? debtor : c.paid_by;
  const s = subs.get(to);
  if (!s?.length || to === actorId) return;
  await sendToMember(to, to === c.paid_by
    ? { title: "¡Te pagaron la cuotita, perrita! 🤑", body: `${who.get(debtor)} te pagó ${cuotas} de ${c.title}: ${formatMoney(total)}.`, url: `/cuotitas/${c.id}`, tag: `cuotita-pago-${c.id}` }
    : { title: "¡Cuotita confirmada!", body: `${who.get(c.paid_by)} confirmó que le pagaste ${cuotas} de ${c.title}: ${formatMoney(total)}.`, url: `/cuotitas/${c.id}`, tag: `cuotita-pago-${c.id}` },
  s);
}

/** Corrida diaria (10:00): recordatorios de cuotas del mes y atrasadas. */
export async function runCuotitaReminders(today = AR.format(new Date())) {
  const admin = createAdminClient();
  const month = `${today.slice(0, 7)}-01`;
  const { data: rows, error } = await admin.from("cuotita_installments")
    .select("cuotita_id, member_id, number, due_month, amount_cents, cuotitas!inner(title, paid_by, installments, status)")
    .is("paid_at", null).lte("due_month", month).eq("cuotitas.status", "active");
  if (error) throw new Error(`No se pudieron leer las cuotitas: ${error.message}`);
  type Row = { cuotita_id: string; member_id: string; number: number; due_month: string; amount_cents: number;
    cuotitas: { title: string; paid_by: string; installments: number } };
  const list = (rows ?? []) as unknown as Row[];
  if (list.length === 0) return { planned: 0, sent: 0 };
  const people = [...new Set(list.flatMap((r) => [r.member_id, r.cuotitas.paid_by]))];
  const [who, subs, { data: active }] = await Promise.all([
    names(admin, people), subsFor(admin, people), admin.from("profiles").select("id").eq("status", "active").in("id", people),
  ]);
  const activeSet = new Set((active ?? []).map((a) => a.id as string));
  const due: DueInstallment[] = list.map((r) => ({
    cuotita_id: r.cuotita_id, title: r.cuotitas.title, debtor_id: r.member_id, creditor_id: r.cuotitas.paid_by,
    creditor_name: who.get(r.cuotitas.paid_by) ?? "tu amiga", debtor_name: who.get(r.member_id) ?? "Alguien",
    number: r.number, installments: r.cuotitas.installments, due_month: r.due_month, amount_cents: Number(r.amount_cents),
  }));
  const plan = planCuotitaReminders(today, due, (m) => activeSet.has(m) && (subs.get(m)?.length ?? 0) > 0, (c) => formatMoney(c));
  let sent = 0;
  for (const p of plan) {
    // Una vez por día (índice único del registro): si el cron corre dos veces, no duplica.
    const { data: row, error: e } = await admin.from("notification_log")
      .insert({ kind: p.kind, member_id: p.member_id, ref_id: p.ref_id, step: 1, sent_on: today, title: p.title, body: p.body })
      .select("id").single();
    if (e || !row) continue;
    const n = await sendToMember(p.member_id, { title: p.title, body: p.body, url: p.url, tag: p.tag }, subs.get(p.member_id) ?? []);
    if (n === 0) await admin.from("notification_log").delete().eq("id", row.id);
    else { await admin.from("notification_log").update({ devices: n }).eq("id", row.id); sent++; }
  }
  return { planned: plan.length, sent };
}
