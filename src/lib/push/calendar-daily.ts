import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/utils";
import { planBirthdays, planEventReminders, planWeekly, type Msg, type Planned } from "./calendar-plan";
import { sendToMember } from "./send";

const AR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const ARTIME = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });
type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };

const pickRandom = (msgs: Msg[]) => (msgs.length ? msgs[Math.floor(Math.random() * msgs.length)] : undefined);

/** Reserva cada envío (único por día) y lo manda; si no llegó a ningún dispositivo, lo libera. */
async function deliver(plan: Planned[], today: string) {
  if (plan.length === 0) return 0;
  const admin = createAdminClient();
  const ids = [...new Set(plan.map((p) => p.member_id))];
  const { data: subs } = await admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", ids);
  const byMember = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byMember.set(s.member_id, [...(byMember.get(s.member_id) ?? []), s]);
  let sent = 0;
  for (const p of plan) {
    const mine = byMember.get(p.member_id);
    if (!mine?.length) continue;
    const { data: row, error } = await admin.from("notification_log")
      .insert({ kind: p.kind, member_id: p.member_id, ref_id: p.ref_id || null, step: 1, sent_on: today, title: p.title, body: p.body })
      .select("id").single();
    if (error || !row) continue;
    const n = await sendToMember(p.member_id, { title: p.title, body: p.body, url: p.url, tag: p.tag }, mine);
    if (n === 0) await admin.from("notification_log").delete().eq("id", row.id);
    else { await admin.from("notification_log").update({ devices: n }).eq("id", row.id); sent++; }
  }
  return sent;
}

async function eventInfos(fromDay: string, toDay: string) {
  const admin = createAdminClient();
  const { data: events } = await admin.from("events").select("id, title, starts_at, location").eq("status", "active")
    .gte("starts_at", `${fromDay}T00:00:00-03:00`).lte("starts_at", `${toDay}T23:59:59-03:00`);
  const ids = (events ?? []).map((e) => e.id as string);
  const { data: rsvps } = ids.length
    ? await admin.from("event_rsvps").select("event_id, member_id, response").in("event_id", ids).in("response", ["going", "maybe"])
    : { data: [] };
  return (events ?? []).map((e) => ({
    id: e.id as string, title: e.title as string, day: AR.format(new Date(e.starts_at)), time: ARTIME.format(new Date(e.starts_at)),
    location: e.location as string | null, attendees: (rsvps ?? []).filter((r) => r.event_id === e.id).map((r) => r.member_id as string),
  }));
}

/** 8:00 AR: cumpleaños (semana antes y día), frase de los lunes y eventos de hoy. */
export async function runMorning(today = AR.format(new Date())) {
  const admin = createAdminClient();
  const [{ data: people }, { data: messages }] = await Promise.all([
    admin.from("profiles").select("id, first_name, nickname, birth_date").eq("status", "active"),
    admin.from("notification_messages").select("id, kind, title, body").eq("active", true),
  ]);
  const recipients = (people ?? []).map((p) => p.id as string);
  const persons = (people ?? []).map((p) => ({ id: p.id as string, name: displayName(p as { first_name: string; nickname: string | null }), birth_date: p.birth_date as string | null }));
  const byKind = (k: string) => (messages ?? []).filter((m) => m.kind === k) as Msg[];
  const plan = [
    ...planBirthdays(today, persons, recipients, pickRandom, { week: byKind("birthday_week"), day: byKind("birthday") }),
    ...planWeekly(today, recipients, byKind("weekly"), pickRandom),
    ...planEventReminders(today, await eventInfos(today, today), "day"),
  ];
  return { planned: plan.length, sent: await deliver(plan, today) };
}

/** 10:00 AR: recordatorio de los eventos de mañana. */
export async function runEventEve(today = AR.format(new Date())) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);
  const plan = planEventReminders(today, await eventInfos(tomorrow, tomorrow), "eve");
  return { planned: plan.length, sent: await deliver(plan, today) };
}

/** Envío manual desde el panel de admin (referencia única por envío). */
export async function sendBroadcast(recipients: string[], title: string, body: string, url: string) {
  const ref = crypto.randomUUID();
  const today = AR.format(new Date());
  const plan: Planned[] = recipients.map((r) => ({ kind: "broadcast", member_id: r, ref_id: ref, title, body, url, tag: `aviso-${ref.slice(0, 8)}` }));
  return deliver(plan, today);
}
