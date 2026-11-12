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
  const targets = [...new Set(memberIds)].filter((m) => m !== actorId);
  if (!pushConfigured() || targets.length === 0) return;
  const admin = createAdminClient();
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
        url: `/gastos/${juntadaId}`,
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
