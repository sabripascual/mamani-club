import type { Metadata } from "next";
import { Crown, Trophy } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/expenses/queries";
import { loadDataset, parsePeriod, type PeriodParams } from "@/lib/stats/load";
import { filterDataset, memberStats, rankings, type Ranking } from "@/lib/stats/compute";
import { formatMoney } from "@/lib/money/format";
import { todayAR } from "@/lib/dates";
import { displayName } from "@/lib/utils";
import type { Member } from "@/lib/expenses/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodFilter } from "@/components/stats/period-filter";
import { MemberAvatar } from "@/components/expenses/member-avatar";

export const metadata: Metadata = { title: "Rankings · MAMANÍ CLUB" };

function fmt(r: Ranking, v: number) {
  if (r.unit === "money") return formatMoney(v, "ARS", { compact: true });
  if (r.unit === "percent") return `${Math.round(v * 100)}%`;
  return String(v);
}

function RankingCard({ r, byId, me }: { r: Ranking; byId: Map<string, Member>; me: string }) {
  const winners = r.winners.map((id) => byId.get(id));
  const rest = r.rows.filter((x) => !r.winners.includes(x.memberId) && (r.unit !== "count" || x.value > 0)).slice(0, 4);
  return (
    <Card className="flex flex-col">
      <p className="font-display text-lg leading-tight font-semibold">{r.title}</p>
      <p className="mt-0.5 text-xs text-graphite/55">{r.description}</p>

      {winners.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-cream/80 px-3 py-4 text-center text-sm text-graphite/55">Sin datos suficientes en este período</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-blush/60 p-3">
            <div className="flex -space-x-2">{winners.slice(0, 3).map((m, i) => <MemberAvatar key={m?.id ?? i} m={m} size="md" />)}</div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate font-semibold">
                <Crown className="size-4 shrink-0 text-rose-dark" strokeWidth={1.8} />
                {winners.map((m) => (m?.id === me ? "Vos" : m ? displayName(m) : "—")).join(", ")}
              </p>
              {winners.length > 1 && <p className="text-xs text-graphite/60">Empate</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{fmt(r, r.rows[0].value)}</p>
              {r.rows[0].detail && winners.length === 1 && <p className="text-xs text-graphite/55">{r.rows[0].detail}</p>}
            </div>
          </div>
          {rest.length > 0 && (
            <ol className="mt-2 flex flex-col">
              {rest.map((x, i) => {
                const m = byId.get(x.memberId);
                return (
                  <li key={x.memberId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="w-4 text-xs text-graphite/40">{r.winners.length + i + 1}</span>
                    <span className="flex-1 truncate">{m?.id === me ? "Vos" : m ? displayName(m) : "—"}</span>
                    <span className="tabular-nums text-graphite/70">{fmt(r, x.value)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </Card>
  );
}

export default async function RankingsPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const sp = await searchParams;
  const { profile } = await requireActiveMember();
  const [dataset, { members, byId }] = await Promise.all([loadDataset(), getMembers()]);
  const { filters } = parsePeriod(sp, todayAR());
  // Los rankings comparan integrantes: no se filtran por integrante, solo por período.
  const ds = filterDataset(dataset, { from: filters.from, to: filters.to });
  const list = rankings(memberStats(ds), ds.expenses.length);

  return (
    <>
      <PageHeader eyebrow="Rankings" title="Las del club">
        Calculados con las juntadas reales del período. Cada juntada cuenta una sola vez.
      </PageHeader>
      <PeriodFilter sp={sp} basePath="/rankings" categories={[]} members={members.map((m) => ({ id: m.id, name: displayName(m) }))} showCategory={false} showMember={false} />
      {ds.expenses.length === 0 ? (
        <EmptyState icon={Trophy} title="Sin juntadas en este período">Probá con otro período o cargá juntadas.</EmptyState>
      ) : (
        <>
          <p className="mb-4 text-sm text-graphite/60">{ds.expenses.length} {ds.expenses.length === 1 ? "juntada" : "juntadas"} en el período.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((r) => <RankingCard key={r.key} r={r} byId={byId} me={profile.id} />)}
          </div>
        </>
      )}
    </>
  );
}
