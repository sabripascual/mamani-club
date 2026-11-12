import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money/format";
import { pushConfigured, sendToMember } from "./send";

/**
 * "¡Poniendo estaba la gansa!": avisa a quienes fueron agregadas a una juntada y le
 * deben a quien pagó. Se excluye a quien hizo el cambio (ya sabe).
 */
export async function notifyAddedToExpense(expenseId: string, memberIds: string[], actorId: string) {
  const targets = memberIds.filter((m) => m !== actorId);
  if (!pushConfigured() || targets.length === 0) return;
  const admin = createAdminClient();
  const [{ data: exp }, { data: shares }, { data: subs }] = await Promise.all([
    admin.from("expenses").select("title").eq("id", expenseId).single(),
    admin.from("v_share_balances").select("member_id, outstanding_cents, currency, is_payer").eq("expense_id", expenseId).in("member_id", targets),
    admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", targets),
  ]);
  if (!exp) return;
  await Promise.all(
    (shares ?? [])
      .filter((s) => !s.is_payer && Number(s.outstanding_cents) > 0)
      .map((s) => {
        const mine = (subs ?? []).filter((x) => x.member_id === s.member_id);
        if (mine.length === 0) return 0;
        return sendToMember(s.member_id, {
          title: "¡Poniendo estaba la gansa!",
          body: `Debés ${formatMoney(Number(s.outstanding_cents), s.currency, { round: true })} de la juntada ${exp.title}`,
          url: `/gastos/${expenseId}`,
          tag: `deuda-${expenseId}`,
        }, mine);
      }),
  );
}
