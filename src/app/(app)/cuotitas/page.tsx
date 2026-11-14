import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CreditCard, HandCoins } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/expenses/queries";
import { listCuotitas } from "@/lib/cuotitas/queries";
import { cuotitaState, monthLabel, monthOf, type Cuotita, type Installment } from "@/lib/cuotitas/types";
import { getAliases } from "@/lib/profile/aliases";
import { formatMoney } from "@/lib/money/format";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ActionCard } from "@/components/ui/action-card";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";
import { CopyAlias } from "@/components/copy-alias";
import { PayInstallmentsButton } from "@/components/cuotitas/actions-client";

export const metadata: Metadata = { title: "Las Cuotitas · MAMANÍ CLUB" };

type Group = { cuotita: Cuotita; debtor: string; items: Installment[] };

function group(list: Installment[], byId: Map<string, Cuotita>) {
  const out = new Map<string, Group>();
  for (const i of list) {
    const k = `${i.cuotita_id}|${i.member_id}`;
    const g = out.get(k) ?? { cuotita: byId.get(i.cuotita_id)!, debtor: i.member_id, items: [] };
    g.items.push(i);
    out.set(k, g);
  }
  return [...out.values()];
}

/** Las Cuotitas: compras en cuotas y préstamos, aparte de las juntadas. */
export default async function CuotitasPage() {
  const { profile } = await requireActiveMember();
  const me = profile.id;
  const month = monthOf(todayAR());
  const [{ cuotitas, installments }, { byId: memberById }] = await Promise.all([listCuotitas(), getMembers()]);
  const byId = new Map(cuotitas.map((c) => [c.id, c]));
  const active = new Set(cuotitas.filter((c) => c.status === "active").map((c) => c.id));
  // Cuotas impagas del mes y atrasadas.
  const due = installments.filter((i) => active.has(i.cuotita_id) && !i.paid_at && i.due_month <= month);
  const toPay = group(due.filter((i) => i.member_id === me), byId);
  const toCollect = group(due.filter((i) => byId.get(i.cuotita_id)?.paid_by === me), byId);
  const aliasesBy = await getAliases([...new Set(toPay.map((g) => g.cuotita.paid_by))]);
  const sum = (list: Installment[]) => list.reduce((a, i) => a + i.amount_cents, 0);
  // Totales de todo lo que falta (no solo este mes).
  const unpaid = installments.filter((i) => active.has(i.cuotita_id) && !i.paid_at);
  const myDebt = unpaid.filter((i) => i.member_id === me);
  const comingBack = unpaid.filter((i) => byId.get(i.cuotita_id)?.paid_by === me);

  const states = { activa: [] as Cuotita[], terminada: [] as Cuotita[], anulada: [] as Cuotita[] };
  for (const c of cuotitas) states[cuotitaState(c, installments)].push(c);
  const progress = (c: Cuotita) => {
    const mine = installments.filter((i) => i.cuotita_id === c.id);
    return { paid: mine.filter((i) => i.paid_at).length, total: mine.length };
  };

  return (
    <>
      <PageHeader eyebrow="Mamaní te banca 💳" title="Las Cuotitas">
        Compras con tarjeta en cuotas y préstamos entre amigas. Te avisamos del 1 al 5 de cada mes.
      </PageHeader>
      <ActionCard href="/cuotitas/nueva" className="mb-6" title="Nueva cuotita" subtitle="Una compra en cuotas o un préstamo" />

      <div className="mb-2 grid grid-cols-2 gap-3">
        <Card className="bg-rose/20">
          <p className="text-sm font-semibold">Tu deuda cuotitera 🐀</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(sum(myDebt))}</p>
          <p className="mt-1 text-xs text-graphite/60">Lo que te falta pagar. Este mes: <strong className="tabular-nums">{formatMoney(sum(toPay.flatMap((g) => g.items)))}</strong></p>
        </Card>
        <Card className="bg-powder/45">
          <p className="text-sm font-semibold">Plata que vuelve 💸</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(sum(comingBack))}</p>
          <p className="mt-1 text-xs text-graphite/60">Lo que te falta recuperar. Este mes: <strong className="tabular-nums">{formatMoney(sum(toCollect.flatMap((g) => g.items)))}</strong></p>
        </Card>
      </div>
      <p className="mb-8 text-xs text-graphite/50">Las cuotitas van aparte: no suman al saldo de las juntadas.</p>

      {toPay.length > 0 && (
        <section className="mb-8 rounded-[var(--radius-card)] bg-rose/15 p-4 ring-1 ring-rose/30">
          <h2 className="mb-3 font-display text-xl">Tenés que transferir 🐀</h2>
          <ul className="flex flex-col gap-2">
            {toPay.map((g) => {
              const c = g.cuotita;
              const al = c.refund_alias ?? aliasesBy.get(c.paid_by)?.[0]?.alias ?? null;
              const late = g.items.some((i) => i.due_month < month);
              return (
                <li key={`${c.id}|${g.debtor}`} className="flex items-center gap-3 rounded-2xl bg-white p-3">
                  <MemberAvatar m={memberById.get(c.paid_by)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <Link href={`/cuotitas/${c.id}`} className="block truncate font-semibold">{c.title}</Link>
                    <p className="text-xs text-graphite/60">
                      {g.items.length === 1 ? `Cuota ${g.items[0].number} de ${c.installments}` : `${g.items.length} cuotas`} · a {memberName(memberById.get(c.paid_by))}
                      {late && <span className="font-semibold text-rose-dark"> · atrasada</span>}
                    </p>
                    <p className="font-semibold tabular-nums">{formatMoney(sum(g.items))}</p>
                    {al && <p className="mt-1 flex items-center gap-1.5 text-xs text-graphite/65">alias <span className="truncate font-mono font-semibold text-graphite">{al}</span><CopyAlias alias={al} label /></p>}
                  </div>
                  <PayInstallmentsButton ids={g.items.map((i) => i.id)} cuotitaId={c.id} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {toCollect.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl">Te tienen que pagar</h2>
          <ul className="flex flex-col gap-2">
            {toCollect.map((g) => (
              <li key={`${g.cuotita.id}|${g.debtor}`} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3">
                <MemberAvatar m={memberById.get(g.debtor)} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate"><strong>{memberName(memberById.get(g.debtor))}</strong><span className="ml-1" role="img" aria-label="debe">🐀</span> · {g.cuotita.title}</p>
                  <p className="text-xs text-graphite/60">{g.items.length === 1 ? `Cuota ${g.items[0].number} de ${g.cuotita.installments}` : `${g.items.length} cuotas`}</p>
                  <p className="font-semibold tabular-nums">{formatMoney(sum(g.items))}</p>
                </div>
                <PayInstallmentsButton ids={g.items.map((i) => i.id)} cuotitaId={g.cuotita.id} label="Me pagó" toMe />
              </li>
            ))}
          </ul>
        </section>
      )}

      {cuotitas.length === 0 ? (
        <EmptyState icon={CreditCard} title="Todavía no hay cuotitas">Cargá una compra en cuotas o un préstamo y nosotras nos acordamos de cobrar.</EmptyState>
      ) : (
        (["activa", "terminada", "anulada"] as const).map((st) => states[st].length > 0 && (
          <section key={st} className="mb-8">
            <h2 className="mb-3 font-display text-xl">{st === "activa" ? "En curso" : st === "terminada" ? "Terminadas 🤑" : "Anuladas"}</h2>
            <ul className="flex flex-col gap-2">
              {states[st].map((c) => {
                const p = progress(c);
                const Icon = c.kind === "tarjeta" ? CreditCard : HandCoins;
                return (
                  <li key={c.id}>
                    <Link href={`/cuotitas/${c.id}`} className={`flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white ${st === "anulada" ? "bg-white/40 opacity-70" : "bg-white/70"}`}>
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime"><Icon className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{c.title}</span>
                        <span className="block truncate text-xs text-graphite/55">
                          {memberName(memberById.get(c.paid_by), me)} · {c.card_label ?? "Préstamo"} · desde {monthLabel(c.first_month)}
                        </span>
                        {st !== "anulada" && p.total > 0 && (
                          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-graphite/10">
                            <span className="block h-full rounded-full bg-rose" style={{ width: `${Math.round((p.paid / p.total) * 100)}%` }} />
                          </span>
                        )}
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">{formatMoney(c.total_cents)}</span>
                        <span className="text-[11px] text-graphite/50">{c.installments} {c.installments === 1 ? "cuota" : "cuotas"}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-graphite/30" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
