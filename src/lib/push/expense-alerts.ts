import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money/format";
import { pushConfigured, sendToMember } from "./send";

/**
 * "¡Poniendo estaba la gansa!": avisa a quienes fueron agregadas a un gasto y,
 * con las cuentas de la juntada, quedan debiendo. Se excluye a quien hizo el cambio.
 */
export async function notifyAddedToJuntada(juntadaId: string, memberIds: string[], actorId: string) {
  const targets = [...new Set(memberIds)].filter((m) => m !== actorId);
  if (!pushConfigured() || targets.length === 0) return;
  const admin = createAdminClient();
  const [{ data: j }, { data: transfers }, { data: subs }] = await Promise.all([
    admin.from("juntadas").select("title, currency").eq("id", juntadaId).single(),
    admin.rpc("juntada_transfers", { p_juntada: juntadaId }),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", targets),
  ]);
  if (!j) return;
  const owed = new Map<string, number>();
  for (const t of (transfers ?? []) as { from_member: string; amount_cents: number }[]) {
    owed.set(t.from_member, (owed.get(t.from_member) ?? 0) + Number(t.amount_cents));
  }
  await Promise.all(
    targets.map((m) => {
      const amount = owed.get(m) ?? 0;
      const mine = (subs ?? []).filter((s) => s.member_id === m);
      if (amount <= 0 || mine.length === 0) return 0;
      return sendToMember(m, {
        title: "¡Poniendo estaba la gansa!",
        body: `Debés ${formatMoney(amount, j.currency, { round: true })} de la juntada ${j.title}`,
        url: `/gastos/${juntadaId}`,
        tag: `deuda-${juntadaId}`,
      }, mine);
    }),
  );
}
