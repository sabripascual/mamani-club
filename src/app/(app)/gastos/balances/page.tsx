import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Scale, Sparkles } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getMemberBalances, getMembers, getPendingTransfers } from "@/lib/expenses/queries";
import { simplifyDebts } from "@/lib/money/simplify";
import { formatMoney } from "@/lib/money/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GastosTabs } from "@/components/expenses/gastos-tabs";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";

export const metadata: Metadata = { title: "Balances · MAMANÍ CLUB" };

export default async function BalancesPage() {
  const { profile } = await requireActiveMember();
  const me = profile.id;
  const [transfers, balances, { byId }] = await Promise.all([getPendingTransfers(), getMemberBalances(), getMembers()]);
  // Quién le debe a quién: suma de las transferencias pendientes de todas las juntadas.
  const pairs = new Map<string, { debtor_id: string; creditor_id: string; currency: string; amount_cents: number; juntadas: number }>();
  for (const t of transfers) {
    const k = `${t.from_member}>${t.to_member}>${t.currency}`;
    const p = pairs.get(k) ?? { debtor_id: t.from_member, creditor_id: t.to_member, currency: t.currency, amount_cents: 0, juntadas: 0 };
    p.amount_cents += t.amount_cents;
    p.juntadas += 1;
    pairs.set(k, p);
  }
  const debts = [...pairs.values()];
  const currencies = [...new Set([...debts.map((d) => d.currency), ...balances.map((b) => b.currency)])].sort();

  if (balances.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Gastos" title="Balances" />
        <GastosTabs />
        <EmptyState icon={Scale} title="Todavía no hay movimientos">Cuando carguen juntadas, acá ves quién le debe a quién.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Gastos" title="Balances" />
      <GastosTabs />

      {currencies.map((cur) => {
        const curDebts = debts.filter((d) => d.currency === cur).sort((a, b) => b.amount_cents - a.amount_cents);
        const suggested = simplifyDebts(curDebts.map((d) => ({ from: d.debtor_id, to: d.creditor_id, amount: d.amount_cents })));
        const curBalances = balances.filter((b) => b.currency === cur).sort((a, b) => b.advanced_cents - a.advanced_cents);
        const mine = curBalances.find((b) => b.member_id === me);
        const pendingTotal = curDebts.reduce((a, d) => a + d.amount_cents, 0);

        return (
          <section key={cur} className="mb-10">
            {currencies.length > 1 && <h2 className="mb-3 font-display text-2xl">{cur}</h2>}

            <div className="mb-6 grid grid-cols-2 gap-3">
              <Card className="bg-rose/20">
                <p className="text-sm text-graphite/65">Debés</p>
                <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(mine?.i_owe_cents ?? 0, cur)}</p>
              </Card>
              <Card className="bg-powder/45">
                <p className="text-sm text-graphite/65">Te deben</p>
                <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(mine?.owed_to_me_cents ?? 0, cur)}</p>
              </Card>
            </div>

            <h3 className="mb-1 font-display text-xl">Quién le debe a quién</h3>
            <p className="mb-3 text-sm text-graphite/55">
              {curDebts.length === 0 ? "¡Todo saldado! 🎉" : `Pendiente total del grupo: ${formatMoney(pendingTotal, cur)}`}
            </p>
            {curDebts.length > 0 && (
              <ul className="mb-6 flex flex-col gap-2">
                {curDebts.map((d) => {
                  const involved = d.debtor_id === me || d.creditor_id === me;
                  return (
                    <li key={`${d.debtor_id}-${d.creditor_id}`}>
                      <Link
                        href={`/gastos?integrante=${d.debtor_id}`}
                        className={`flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white ${involved ? "bg-white ring-1 ring-rose/40" : "bg-white/55"}`}
                      >
                        <MemberAvatar m={byId.get(d.debtor_id)} />
                        <ArrowRight className="size-4 text-graphite/35" />
                        <MemberAvatar m={byId.get(d.creditor_id)} />
                        <p className="min-w-0 flex-1 truncate text-sm">
                          <strong>{memberName(byId.get(d.debtor_id), me)}</strong> {d.debtor_id === me ? "le debés" : "le debe"} a{" "}
                          <strong>{memberName(byId.get(d.creditor_id), me)}</strong>
                        </p>
                        <span className="text-right">
                          <span className="block font-semibold tabular-nums">{formatMoney(d.amount_cents, cur)}</span>
                          <span className="text-[11px] text-graphite/50">{d.juntadas} {d.juntadas === 1 ? "juntada" : "juntadas"}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {suggested.length > 0 && suggested.length < curDebts.length && (
              <Card className="mb-6 bg-blush/50">
                <p className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-rose-dark" /> Transferencias sugeridas</p>
                <p className="mt-1 mb-3 text-xs text-graphite/60">
                  Con {suggested.length} transferencias en vez de {curDebts.length} quedaría todo saldado. Es solo una sugerencia:
                  las transferencias se registran dentro de cada juntada.
                </p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {suggested.map((s) => (
                    <li key={`${s.from}-${s.to}`} className="flex items-center justify-between gap-2">
                      <span>{memberName(byId.get(s.from), me)} → {memberName(byId.get(s.to), me)}</span>
                      <strong className="tabular-nums">{formatMoney(s.amount, cur)}</strong>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <h3 className="mb-3 font-display text-xl">Por integrante</h3>
            <div className="overflow-x-auto rounded-[var(--radius-card)] bg-white/60">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-graphite/55">
                    <th className="px-4 py-3 font-semibold">Integrante</th>
                    <th className="px-3 py-3 text-right font-semibold">Adelantó</th>
                    <th className="px-3 py-3 text-right font-semibold">Consumió</th>
                    <th className="px-3 py-3 text-right font-semibold">Le deben</th>
                    <th className="px-4 py-3 text-right font-semibold">Debe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-graphite/5">
                  {curBalances.map((b) => (
                    <tr key={b.member_id} className={b.member_id === me ? "bg-blush/30" : undefined}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2"><MemberAvatar m={byId.get(b.member_id)} />{memberName(byId.get(b.member_id), me)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(b.advanced_cents, cur)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(b.consumed_cents, cur)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{b.owed_to_me_cents ? formatMoney(b.owed_to_me_cents, cur) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{b.i_owe_cents ? formatMoney(b.i_owe_cents, cur) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-graphite/50">
              <strong>Adelantó</strong>: plata que puso por el grupo. <strong>Consumió</strong>: su parte en los gastos de los que participó.
            </p>
          </section>
        );
      })}
    </>
  );
}
