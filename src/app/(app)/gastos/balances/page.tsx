import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getMembers, getPendingTransfers } from "@/lib/expenses/queries";
import { createClient } from "@/lib/supabase/server";
import { getAliases } from "@/lib/profile/aliases";
import { refundAliasFor } from "@/lib/expenses/refund-alias";
import { formatMoney } from "@/lib/money/format";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GastosTabs } from "@/components/expenses/gastos-tabs";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";
import { CopyAlias } from "@/components/copy-alias";
import { SettleButton } from "../[id]/actions-client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Balances · MAMANÍ CLUB" };

type T = { juntada_id: string; currency: string; from_member: string; to_member: string; amount_cents: number };

/** Agrupa transferencias por una clave, sumando el total. */
function groupBy(list: T[], key: (t: T) => string) {
  const out = new Map<string, { key: string; total: number; items: T[] }>();
  for (const t of list) {
    const k = key(t);
    const g = out.get(k) ?? { key: k, total: 0, items: [] };
    g.total += t.amount_cents;
    g.items.push(t);
    out.set(k, g);
  }
  return [...out.values()].sort((a, b) => b.total - a.total);
}

export default async function BalancesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const byJuntada = ver === "juntada";
  const { profile } = await requireActiveMember();
  const me = profile.id;
  const isAdmin = profile.role === "admin";
  const [transfers, { byId }] = await Promise.all([getPendingTransfers(), getMembers()]);

  const juntadaIds = [...new Set(transfers.map((t) => t.juntada_id))];
  const supabase = await createClient();
  const [{ data: juntadas }, { data: gastos }, aliasesBy] = await Promise.all([
    juntadaIds.length
      ? supabase.from("juntadas").select("id, title, occurred_on").in("id", juntadaIds)
      : Promise.resolve({ data: [] as { id: string; title: string; occurred_on: string }[] }),
    juntadaIds.length
      ? supabase.from("expenses").select("juntada_id, paid_by, refund_alias, created_at").in("juntada_id", juntadaIds).eq("status", "active")
      : Promise.resolve({ data: [] as { juntada_id: string; paid_by: string; refund_alias: string | null; created_at: string }[] }),
    getAliases([...new Set(transfers.map((t) => t.to_member))]),
  ]);
  const juntadaById = new Map((juntadas ?? []).map((j) => [j.id as string, j as { id: string; title: string; occurred_on: string }]));
  const title = (id: string) => juntadaById.get(id)?.title ?? "Juntada";
  // Alias al que transferir: el que eligió en esa juntada o su principal.
  const aliasOf = (juntadaId: string, memberId: string) =>
    refundAliasFor((gastos ?? []).filter((g) => g.juntada_id === juntadaId), memberId, aliasesBy.get(memberId)?.[0]?.alias);
  const primaryAlias = (memberId: string) => aliasesBy.get(memberId)?.[0]?.alias ?? null;

  const currencies = [...new Set(transfers.map((t) => t.currency))].sort();
  const name = (id: string) => memberName(byId.get(id), me);

  const tabs = (
    <div role="tablist" aria-label="Ver deudas" className="mb-6 grid grid-cols-2 rounded-full bg-white/70 p-1 ring-1 ring-graphite/10">
      {[
        { href: "/gastos/balances", label: "Por persona", on: !byJuntada },
        { href: "/gastos/balances?ver=juntada", label: "Por juntada", on: byJuntada },
      ].map((t) => (
        <Link key={t.href} href={t.href} role="tab" aria-selected={t.on} replace scroll={false}
          className={cn("rounded-full py-2 text-center text-sm font-semibold transition", t.on ? "bg-graphite text-cream shadow" : "text-graphite/60")}>
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (transfers.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Gastos" title="Balances" />
        <GastosTabs />
        <EmptyState icon={Scale} title="¡Todo saldado! 🎉">No hay deudas pendientes en ninguna juntada.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Gastos" title="Balances" />
      <GastosTabs />
      {tabs}

      {currencies.map((cur) => {
        const list = transfers.filter((t) => t.currency === cur);
        const iOwe = list.filter((t) => t.from_member === me);
        const owedToMe = list.filter((t) => t.to_member === me);
        const others = list.filter((t) => t.from_member !== me && t.to_member !== me);
        const sum = (l: T[]) => l.reduce((a, t) => a + t.amount_cents, 0);

        /** Una deuda puntual (una juntada) con su botón Pagado. */
        const line = (t: T, label: string, showAlias: boolean) => {
          const al = aliasOf(t.juntada_id, t.to_member);
          return (
            <li key={`${t.juntada_id}-${t.from_member}-${t.to_member}`} className="flex items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/gastos/${t.juntada_id}#saldar`} className="block truncate font-semibold hover:underline">{label}</Link>
                {showAlias && al && (
                  <span className="flex items-center gap-1.5 text-xs text-graphite/60">
                    alias <span className="truncate font-mono font-semibold text-graphite">{al}</span> <CopyAlias alias={al} />
                  </span>
                )}
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatMoney(t.amount_cents, cur)}</span>
              <SettleButton juntadaId={t.juntada_id} from={t.from_member} to={t.to_member} amountCents={t.amount_cents} alias={al ?? undefined} meId={me} />
            </li>
          );
        };

        /** Mis deudas o lo que me deben, agrupado por persona o por juntada. */
        const mySection = (items: T[], owe: boolean) => {
          const other = (t: T) => (owe ? t.to_member : t.from_member);
          if (byJuntada) {
            return groupBy(items, (t) => t.juntada_id).map((g) => (
              <div key={g.key} className="rounded-2xl bg-white/80 p-3">
                <Link href={`/gastos/${g.key}#saldar`} className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{title(g.key)}</span>
                  <span className="shrink-0 text-xs font-semibold text-rose-dark">Ver ›</span>
                </Link>
                <ul className="divide-y divide-graphite/5">{g.items.map((t) => line(t, `${owe ? "A" : "De"} ${name(other(t))}`, owe))}</ul>
              </div>
            ));
          }
          return groupBy(items, other).map((g) => {
            const al = owe ? primaryAlias(g.key) : null;
            return (
              <div key={g.key} className="rounded-2xl bg-white/80 p-3">
                <div className="flex items-center gap-3">
                  <MemberAvatar m={byId.get(g.key)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{name(g.key)}</p>
                    {owe && (al
                      ? <p className="flex items-center gap-1.5 text-xs text-graphite/60">alias <span className="truncate font-mono font-semibold text-graphite">{al}</span> <CopyAlias alias={al} /></p>
                      : <p className="text-xs text-graphite/45">Todavía no cargó alias</p>)}
                  </div>
                  <span className="shrink-0 font-display text-xl font-semibold tabular-nums">{formatMoney(g.total, cur)}</span>
                </div>
                <ul className="mt-2 divide-y divide-graphite/5 border-t border-graphite/5">
                  {g.items.map((t) => line(t, title(t.juntada_id), false))}
                </ul>
              </div>
            );
          });
        };

        return (
          <section key={cur} className="mb-10">
            {currencies.length > 1 && <h2 className="mb-3 font-display text-2xl">{cur}</h2>}

            {/* Lo mío primero */}
            <div className="mb-4 rounded-[var(--radius-card)] bg-rose/25 p-4 ring-1 ring-rose/30">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="font-display text-xl">Lo que vos debés</h3>
                <span className="font-display text-2xl font-semibold tabular-nums">{formatMoney(sum(iOwe), cur)}</span>
              </div>
              {iOwe.length === 0 ? (
                <p className="text-sm text-graphite/65">No le debés nada a nadie 🤑</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2">{mySection(iOwe, true)}</div>
                  <p className="mt-3 text-xs text-graphite/60">Transferí y tocá <strong>Pagado</strong> para avisarle.</p>
                </>
              )}
            </div>

            {owedToMe.length > 0 && (
              <div className="mb-8 rounded-[var(--radius-card)] bg-lime/45 p-4 ring-1 ring-lime">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-xl">Te deben</h3>
                  <span className="font-display text-2xl font-semibold tabular-nums">{formatMoney(sum(owedToMe), cur)}</span>
                </div>
                <div className="flex flex-col gap-2">{mySection(owedToMe, false)}</div>
              </div>
            )}

            {/* El resto del grupo */}
            <h3 className="mb-1 font-display text-xl">Deudas del grupo</h3>
            <p className="mb-3 text-sm text-graphite/55">
              {others.length === 0 ? "Nadie más tiene deudas pendientes." : `Entre las demás quedan ${formatMoney(sum(others), cur)} pendientes.`}
            </p>
            {byJuntada ? (
              <div className="flex flex-col gap-3">
                {groupBy(others, (t) => t.juntada_id).map((g) => (
                  <div key={g.key} className="rounded-2xl bg-white/55 p-3">
                    <Link href={`/gastos/${g.key}#saldar`} className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{title(g.key)}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(g.total, cur)}</span>
                    </Link>
                    <ul className="flex flex-col gap-1 text-sm">
                      {g.items.map((t) => (
                        <li key={`${t.from_member}-${t.to_member}`} className="flex items-center gap-2">
                          <MemberAvatar m={byId.get(t.from_member)} />
                          <ArrowRight className="size-3.5 shrink-0 text-graphite/35" />
                          <MemberAvatar m={byId.get(t.to_member)} />
                          <span className="min-w-0 flex-1 truncate">{name(t.from_member)} → {name(t.to_member)}</span>
                          <span className="shrink-0 tabular-nums">{formatMoney(t.amount_cents, cur)}</span>
                          {isAdmin && <SettleButton juntadaId={t.juntada_id} from={t.from_member} to={t.to_member} amountCents={t.amount_cents} alias={aliasOf(t.juntada_id, t.to_member) ?? undefined} meId={me} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {groupBy(others, (t) => `${t.from_member}>${t.to_member}`).map((g) => {
                  const [from, to] = g.key.split(">");
                  return (
                    <li key={g.key}>
                      <Link href={`/gastos?integrante=${from}`} className="flex items-center gap-3 rounded-2xl bg-white/55 p-3 transition hover:bg-white">
                        <MemberAvatar m={byId.get(from)} />
                        <ArrowRight className="size-4 shrink-0 text-graphite/35" />
                        <MemberAvatar m={byId.get(to)} />
                        <p className="min-w-0 flex-1 truncate text-sm"><strong>{name(from)}</strong> le debe a <strong>{name(to)}</strong></p>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums">{formatMoney(g.total, cur)}</span>
                          <span className="text-[11px] text-graphite/50">{g.items.length} {g.items.length === 1 ? "juntada" : "juntadas"}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
