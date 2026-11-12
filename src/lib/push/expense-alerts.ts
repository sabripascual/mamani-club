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
 * a quien lo cargó.
 */
export async function notifyGastoLoaded(gastoId: string, juntadaId: string, memberIds: string[], actorId: string) {
  const targets = [...new Set(memberIds)].filter((m) => m !== actorId);
  if (!pushConfigured() || targets.length === 0) return;
  const admin = createAdminClient();
  const [{ data: g }, { data: j }, { data: shares }, { data: transfers }, { data: subs }, actor] = await Promise.all([
    admin.from("expenses").select("title, amount_cents, currency").eq("id", gastoId).single(),
    admin.from("juntadas").select("title").eq("id", juntadaId).single(),
    admin.from("expense_shares").select("member_id, amount_cents").eq("expense_id", gastoId).in("member_id", targets),
    admin.rpc("juntada_transfers", { p_juntada: juntadaId }),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", targets),
    nameOf(admin, actorId),
  ]);
  if (!g || !j) return;
  const owed = new Map<string, number>();
  for (const t of (transfers ?? []) as { from_member: string; amount_cents: number }[]) {
    owed.set(t.from_member, (owed.get(t.from_member) ?? 0) + Number(t.amount_cents));
  }
  const money = (c: number) => formatMoney(c, g.currency, { round: true });
  await Promise.all(
    (shares ?? []).map((s) => {
      const mine = ((subs ?? []) as Sub[]).filter((x) => x.member_id === s.member_id);
      if (mine.length === 0) return 0;
      const debt = owed.get(s.member_id) ?? 0;
      return sendToMember(s.member_id, {
        title: "¡Poniendo estaba la gansa!",
        body: `${actor} cargó ${g.title} (${money(Number(g.amount_cents))}) en ${j.title}. Tu parte: ${money(Number(s.amount_cents))}${debt > 0 ? ` · Debés ${money(debt)}` : ""}`,
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
