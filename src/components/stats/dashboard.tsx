import Link from "next/link";
import { formatMoney } from "@/lib/money/format";
import { formatDay, formatMonth } from "@/lib/dates";
import {
  byCategory, filterDataset, financialSummary, memberStats, monthlySeries, socialSummary, topJuntadas, type Dataset, type Filters,
} from "@/lib/stats/compute";
import type { Member } from "@/lib/expenses/types";
import { displayName } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { BarList, ColumnChart, StatTile } from "./charts";

const MONTH_SHORT = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const pct = (x: number) => `${Math.round(x * 100)}%`;

function names(ids: string[], byId: Map<string, Member>) {
  const n = ids.map((id) => (byId.get(id) ? displayName(byId.get(id)!) : "—"));
  return n.length > 2 ? `${n.slice(0, 2).join(", ")} y ${n.length - 2} más` : n.join(" y ");
}

export function Dashboard({
  dataset, filters, today, memberById,
}: { dataset: Dataset; filters: Filters; today: string; memberById: Map<string, Member> }) {
  const ds = filterDataset(dataset, filters);
  if (ds.juntadas.length === 0) {
    return <p className="rounded-2xl bg-white/50 px-4 py-6 text-center text-sm text-graphite/60">No hay juntadas en este período.</p>;
  }
  const fin = financialSummary(ds, { from: filters.from, to: filters.to });
  const stats = memberStats(ds);
  const social = socialSummary(ds, stats);

  const firstMonth = (filters.from ?? ds.juntadas.map((e) => e.occurred_on).sort()[0]).slice(0, 7);
  const lastMonth = (filters.to ?? today).slice(0, 7);
  let series = monthlySeries(ds, firstMonth, lastMonth);
  const truncated = series.length > 24;
  if (truncated) series = series.slice(-24);
  const [prev, curr] = series.slice(-2);
  const delta = prev && curr && prev.totalCents > 0 ? (curr.totalCents - prev.totalCents) / prev.totalCents : null;

  const cats = byCategory(ds);
  const consumers = [...stats].filter((s) => s.consumedCents > 0).sort((a, b) => b.consumedCents - a.consumedCents);
  const top = topJuntadas(ds, 5);
  const catName = new Map(dataset.categories.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Indicadores financieros">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Total gastado" value={formatMoney(fin.totalCents, "ARS", { round: true })} hint="en pesos" tone="bg-blush/70" />
          <StatTile label="Juntadas" value={String(fin.count)} hint={`${fin.gastosCount} gastos`} />
          <StatTile label="Promedio por juntada" value={formatMoney(fin.avgPerExpenseCents, "ARS", { round: true })} />
          <StatTile label="Promedio mensual" value={formatMoney(fin.avgPerMonthCents, "ARS", { round: true })} hint={`${fin.monthsInPeriod} ${fin.monthsInPeriod === 1 ? "mes" : "meses"}`} />
          <StatTile label="Pendiente de transferir" value={formatMoney(fin.pendingCents, "ARS", { round: true })} tone={fin.pendingCents ? "bg-rose/20" : undefined} />
          <StatTile label="Ya transferido" value={formatMoney(fin.settledCents, "ARS", { round: true })} />
        </div>
        <p className="mt-2 text-xs text-graphite/50">
          Adelantado por integrantes para cubrir a las demás: <strong>{formatMoney(fin.advancedForOthersCents, "ARS", { round: true })}</strong>
          {" "}(no incluye el consumo propio de quien pagó).
        </p>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl">Evolución mensual del gasto</h2>
          {delta !== null && curr && (
            <p className="text-sm text-graphite/60">
              {formatMonth(curr.key)}: <strong className="text-graphite">{delta >= 0 ? "+" : ""}{pct(delta)}</strong> vs. mes anterior
            </p>
          )}
        </div>
        <Card>
          <ColumnChart
            valueLabel="Total"
            rows={series.map((m) => ({
              key: m.key, label: formatMonth(m.key), short: MONTH_SHORT[Number(m.key.slice(5)) - 1],
              value: m.totalCents, display: formatMoney(m.totalCents, "ARS", { compact: true }),
              sub: `${m.count} ${m.count === 1 ? "juntada" : "juntadas"}`,
            }))}
          />
          {truncated && <p className="mt-2 text-xs text-graphite/50">Se muestran los últimos 24 meses.</p>}
        </Card>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-xl">Gasto por categoría</h2>
          <Card>
            <BarList
              valueLabel="Total"
              rows={cats.map((c) => ({
                key: c.id, label: c.name, value: c.totalCents, display: formatMoney(c.totalCents, "ARS", { compact: true }),
                sub: `${c.count} ${c.count === 1 ? "juntada" : "juntadas"} · ${pct(c.totalCents / fin.totalCents)} del total`,
              }))}
            />
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl">Juntadas más costosas</h2>
          <ol className="flex flex-col gap-2">
            {top.map((e, i) => (
              <li key={e.id}>
                <Link href={`/gastos/${e.id}`} className="flex items-center gap-3 rounded-2xl bg-white/60 p-3 transition hover:bg-white">
                  <span className="w-5 text-center font-display text-lg text-rose-dark">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.title}</span>
                    <span className="text-xs text-graphite/55">{formatDay(e.occurred_on)} · {catName.get(e.type_id)}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(e.totalCents, "ARS")}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div>
        <section>
          <h2 className="mb-1 font-display text-xl">Consumo por integrante</h2>
          <p className="mb-3 text-xs text-graphite/55">Su parte en los gastos de los que participó.</p>
          <Card>
            <BarList valueLabel="Consumo" rows={consumers.map((s) => ({
              key: s.memberId, label: memberById.get(s.memberId) ? displayName(memberById.get(s.memberId)!) : "—",
              value: s.consumedCents, display: formatMoney(s.consumedCents, "ARS", { compact: true }), sub: `${s.participations} juntadas`,
            }))} />
          </Card>
        </section>
      </div>

      <section aria-label="Indicadores sociales">
        <h2 className="mb-3 font-display text-xl">Cómo venimos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="La más presente" value={social.mostPresent ? names(social.mostPresent.ids, memberById) : "—"} hint={social.mostPresent ? pct(social.mostPresent.rate) : "Sin datos"} />
          <StatTile label="La menos presente" value={social.leastPresent ? names(social.leastPresent.ids, memberById) : "—"} hint={social.leastPresent ? pct(social.leastPresent.rate) : "Hacen falta más juntadas"} />
          <StatTile label="Participación promedio" value={pct(social.avgParticipationRate)} hint={`${social.avgParticipants.toFixed(1)} por juntada`} />
          <StatTile label="Mes con más juntadas" value={social.busiestMonth ? formatMonth(social.busiestMonth.key) : "—"} hint={social.busiestMonth ? `${social.busiestMonth.count} juntadas${social.busiestMonth.tied ? " (empate)" : ""}` : undefined} />
          <StatTile label="Tipo de juntada más frecuente" value={social.topCategory?.name ?? "—"} hint={social.topCategory ? `${social.topCategory.count} juntadas` : undefined} />
          <Link href="/rankings" className="flex items-center justify-center rounded-[var(--radius-card)] bg-graphite p-4 text-center text-sm font-semibold text-cream transition hover:bg-graphite/90">
            Ver todos los rankings →
          </Link>
        </div>
      </section>
    </div>
  );
}
