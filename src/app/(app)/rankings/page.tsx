import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/expenses/queries";
import { loadDataset, parsePeriod, type PeriodParams } from "@/lib/stats/load";
import { filterDataset, memberStats, rankings } from "@/lib/stats/compute";
import { todayAR } from "@/lib/dates";
import { displayName } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodFilter } from "@/components/stats/period-filter";
import { RankingCard } from "@/components/stats/ranking-card";

export const metadata: Metadata = { title: "Rankings · MAMANÍ CLUB" };

export default async function RankingsPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const sp = await searchParams;
  const { profile } = await requireActiveMember();
  const [dataset, { members, byId }] = await Promise.all([loadDataset(), getMembers()]);
  const { filters } = parsePeriod(sp, todayAR());
  // Los rankings comparan integrantes: no se filtran por integrante, solo por período.
  const ds = filterDataset(dataset, { from: filters.from, to: filters.to });
  const list = rankings(memberStats(ds), ds.juntadas.length);

  return (
    <>
      <PageHeader eyebrow="Rankings" title="Las del club">
        Calculados con las juntadas reales del período. Cada juntada cuenta una sola vez.
      </PageHeader>
      <PeriodFilter sp={sp} basePath="/rankings" categories={[]} members={members.map((m) => ({ id: m.id, name: displayName(m) }))} showCategory={false} showMember={false} />
      {ds.juntadas.length === 0 ? (
        <EmptyState icon={Trophy} title="Sin juntadas en este período">Probá con otro período o cargá juntadas.</EmptyState>
      ) : (
        <>
          <p className="mb-4 text-sm text-graphite/60">{ds.juntadas.length} {ds.juntadas.length === 1 ? "juntada" : "juntadas"} en el período.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((r) => <RankingCard key={r.key} r={r} byId={byId} me={profile.id} />)}
          </div>
        </>
      )}
    </>
  );
}
