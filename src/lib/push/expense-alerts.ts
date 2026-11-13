import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money/format";
import { pushConfigured, sendToMember } from "./send";

type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };

async function nameOf(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await admin.from("profiles").select("first_name, nickname").eq("id", id).maybeSingle();
  return data ? data.nickname || data.first_name : "Alguien";
}

/**
 * "¡Poniendo estaba la gansa!": avisa a cada participante de un gasto que se lo
 * cargaron (con su parte y, si corresponde, lo que debe en la juntada). No le llega
 * a quien lo cargó. A la responsable de una invitada le avisa que su invitada debe
 * su parte a quien pagó el gasto (la invitada paga lo suyo).
 */
export async function notifyGastoLoaded(gastoId: string, juntadaId: string, memberIds: string[], actorId: string) {
  if (!pushConfigured()) return;
  const admin = createAdminClient();
  await notifyPayerOfGasto(admin, gastoId, juntadaId, actorId);
  const targets = [...new Set(memberIds)].filter((m) => m !== actorId);
  if (targets.length === 0) return;
  const [{ data: g }, { data: j }, { data: shares }, { data: transfers }, { data: subs }, actor] = await Promise.all([
    admin.from("expenses").select("title, amount_cents, currency, paid_by").eq("id", gastoId).single(),
    admin.from("juntadas").select("title").eq("id", juntadaId).single(),
    admin.from("expense_shares").select("member_id, amount_cents, guest_name").eq("expense_id", gastoId).in("member_id", targets),
    admin.rpc("juntada_transfers", { p_juntada: juntadaId }),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", targets),
    nameOf(admin, actorId),
  ]);
  if (!g || !j) return;
  const payer = g.paid_by === actorId ? actor : await nameOf(admin, g.paid_by);
  const owed = new Map<string, number>();
  for (const t of (transfers ?? []) as { from_member: string; amount_cents: number }[]) {
    owed.set(t.from_member, (owed.get(t.from_member) ?? 0) + Number(t.amount_cents));
  }
  const money = (c: number) => formatMoney(c, g.currency, { round: true });
  // Una integrante puede tener su parte y la de sus invitadas: un solo aviso por persona.
  const byMember = new Map<string, { own: number | null; guests: { name: string; cents: number }[] }>();
  for (const s of (shares ?? []) as { member_id: string; amount_cents: number; guest_name: string | null }[]) {
    const e = byMember.get(s.member_id) ?? { own: null, guests: [] };
    if (s.guest_name) e.guests.push({ name: s.guest_name, cents: Number(s.amount_cents) });
    else e.own = Number(s.amount_cents);
    byMember.set(s.member_id, e);
  }
  await Promise.all(
    [...byMember].map(([memberId, e]) => {
      const mine = ((subs ?? []) as Sub[]).filter((x) => x.member_id === memberId);
      if (mine.length === 0) return 0;
      const debt = owed.get(memberId) ?? 0;
      const parts = [
        ...(e.own !== null ? [`Tu parte: ${money(e.own)}`] : []),
        ...e.guests.map((x) => `${x.name} (tu invitada) le debe ${money(x.cents)} a ${memberId === g.paid_by ? "vos" : payer}`),
      ];
      return sendToMember(memberId, {
        title: e.own === null ? "¡Tu invitada está en un gasto!" : "¡Poniendo estaba la gansa!",
        body: `${actor} cargó ${g.title} (${money(Number(g.amount_cents))}) en ${j.title}. ${parts.join(" · ")}${debt > 0 ? ` · Debés ${money(debt)}` : ""}`,
        url: `/gastos/${juntadaId}/gasto/${gastoId}`,
        tag: `gasto-${gastoId}`,
      }, mine);
    }),
  );
}

/**
 * "¡Te pagaron, perrita!": a quien recibe una transferencia (si no la registró ella).
 * Si la registró quien cobra, le avisamos a quien pagó que quedó confirmado.
 */
export async function notifyPaid(juntadaId: string, fromId: string, toId: string, amountCents: number, actorId: string) {
  if (!pushConfigured()) return;
  if (toId === actorId) return notifyPaymentConfirmed(juntadaId, fromId, toId, amountCents);
  const admin = createAdminClient();
  const [{ data: j }, { data: subs }, from] = await Promise.all([
    admin.from("juntadas").select("title, currency").eq("id", juntadaId).single(),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").eq("member_id", toId),
    nameOf(admin, fromId),
  ]);
  if (!j || !subs?.length) return;
  await sendToMember(toId, {
    title: "¡Te pagaron, perrita!",
    body: `${from} te transfirió ${formatMoney(amountCents, j.currency, { round: true })} por ${j.title}`,
    url: `/gastos/${juntadaId}`,
    tag: `pago-${juntadaId}`,
  }, subs as Sub[]);
}

/** Quien cobró marcó "Pagado": se lo confirmamos a quien transfirió. */
async function notifyPaymentConfirmed(juntadaId: string, fromId: string, toId: string, amountCents: number) {
  const admin = createAdminClient();
  const [{ data: j }, { data: subs }, to] = await Promise.all([
    admin.from("juntadas").select("title, currency").eq("id", juntadaId).single(),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").eq("member_id", fromId),
    nameOf(admin, toId),
  ]);
  if (!j || !subs?.length) return;
  await sendToMember(fromId, {
    title: "¡Pago confirmado!",
    body: `${to} confirmó que le transferiste ${formatMoney(amountCents, j.currency, { round: true })} por ${j.title}`,
    url: `/gastos/${juntadaId}`,
    tag: `pago-${juntadaId}`,
  }, subs as Sub[]);
}

/**
 * Una invitada pagó su parte (lo marcó su responsable o una admin): "¡Te pagaron,
 * perrita!" a quien pagó el gasto, salvo que lo haya marcado ella misma.
 */
export async function notifyGuestPaid(shareId: string, actorId: string) {
  if (!pushConfigured()) return;
  const admin = createAdminClient();
  const { data: d } = await admin.from("v_guest_debts").select("juntada_id, currency, guest_name, responsible_id, creditor_id, amount_cents").eq("share_id", shareId).maybeSingle();
  if (!d || d.creditor_id === actorId) return;
  const [{ data: j }, { data: subs }, responsible] = await Promise.all([
    admin.from("juntadas").select("title").eq("id", d.juntada_id).single(),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").eq("member_id", d.creditor_id),
    nameOf(admin, d.responsible_id),
  ]);
  if (!j || !subs?.length) return;
  await sendToMember(d.creditor_id, {
    title: "¡Te pagaron, perrita!",
    body: `${d.guest_name} (invitada de ${responsible}) te pagó ${formatMoney(Number(d.amount_cents), d.currency, { round: true })} por ${j.title}`,
    url: `/gastos/${d.juntada_id}`,
    tag: `pago-invitada-${shareId}`,
  }, subs as Sub[]);
}

/** Si otra persona cargó un gasto que pagaste vos: aviso para que lo revises (podés editarlo y elegir tu alias). */
async function notifyPayerOfGasto(admin: ReturnType<typeof createAdminClient>, gastoId: string, juntadaId: string, actorId: string) {
  const { data: g } = await admin.from("expenses").select("title, amount_cents, currency, paid_by").eq("id", gastoId).maybeSingle();
  if (!g || g.paid_by === actorId) return;
  const [{ data: j }, { data: subs }, actor] = await Promise.all([
    admin.from("juntadas").select("title").eq("id", juntadaId).single(),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").eq("member_id", g.paid_by),
    nameOf(admin, actorId),
  ]);
  if (!j || !subs?.length) return;
  await sendToMember(g.paid_by, {
    title: "Cargaron un gasto a tu nombre",
    body: `${actor} cargó que pagaste ${g.title} (${formatMoney(Number(g.amount_cents), g.currency, { round: true })}) en ${j.title}. Revisalo y elegí a qué alias te devuelven.`,
    url: `/gastos/${juntadaId}/gasto/${gastoId}`,
    tag: `gasto-pagado-${gastoId}`,
  }, subs as Sub[]);
}

/**
 * "Terminé de cargar": avisa a todas las de la juntada (asistentes, participantes y quienes
 * pagaron), menos a quien cargó, que ya están los gastos y cuánto debe cada una.
 */
export async function notifyLoadFinished(juntadaId: string, actorId: string) {
  if (!pushConfigured()) return;
  const admin = createAdminClient();
  const [{ data: j }, { data: att }, { data: gastos }, { data: transfers }, actor] = await Promise.all([
    admin.from("juntadas").select("title, currency").eq("id", juntadaId).single(),
    admin.from("juntada_attendees").select("member_id").eq("juntada_id", juntadaId),
    admin.from("expenses").select("id, paid_by, amount_cents, created_by").eq("juntada_id", juntadaId).eq("status", "active"),
    admin.rpc("juntada_transfers", { p_juntada: juntadaId }),
    nameOf(admin, actorId),
  ]);
  if (!j || !gastos?.length) return;
  const { data: shares } = await admin.from("expense_shares").select("member_id").is("guest_name", null).in("expense_id", gastos.map((g) => g.id));
  const people = new Set([...(att ?? []).map((a) => a.member_id as string), ...(shares ?? []).map((s) => s.member_id as string), ...gastos.map((g) => g.paid_by as string)]);
  people.delete(actorId);
  if (people.size === 0) return;
  const { data: subs } = await admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", [...people]);
  const owe = new Map<string, number>();
  for (const t of (transfers ?? []) as { from_member: string; amount_cents: number }[]) owe.set(t.from_member, (owe.get(t.from_member) ?? 0) + Number(t.amount_cents));
  const money = (c: number) => formatMoney(c, j.currency);
  const mine = gastos.filter((g) => g.created_by === actorId);
  const loaded = mine.length === 1 ? "un gasto" : `${mine.length} gastos`;
  const total = mine.reduce((a, g) => a + Number(g.amount_cents), 0);
  await Promise.all([...people].map((m) => {
    const s = ((subs ?? []) as Sub[]).filter((x) => x.member_id === m);
    if (s.length === 0) return 0;
    const debt = owe.get(m) ?? 0;
    return sendToMember(m, {
      title: `${actor} cargó ${loaded} 🧾`,
      body: `${j.title}: ${money(total)}.${debt > 0 ? ` Debés ${money(debt)}, transferí desde la juntada.` : " Revisá cuánto te toca."}`,
      url: debt > 0 ? `/gastos/${juntadaId}#saldar` : `/gastos/${juntadaId}`,
      tag: `carga-${juntadaId}`,
    }, s);
  }));
}
