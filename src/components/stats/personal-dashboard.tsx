import Link from "next/link";
import { formatMoney } from "@/lib/money/format";
import { formatDay, formatMonth } from "@/lib/dates";
import { filterDataset, memberStats, monthlySeries, personalSummary, rankings, type Dataset, type Filters } from "@/lib/stats/compute";
import { Card } from "@/components/ui/card";
import { BarList, ColumnChart, StatTile } from "./charts";

const MONTH_SHORT = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (c: number) => formatMoney(c, "ARS", { round: true });

/** Vista "Yo": mis números con el mismo análisis que el del grupo. */
export function PersonalDashboard({ dataset, filters, today, memberId }: { dataset: Dataset; filters: Filters; today: string; memberId: string }) {
  // El filtro de integrante no aplica acá: siempre soy yo.
  const ds = filterDataset(dataset, { ...filters, memberId: undefined });
  const me = personalSummary(ds, memberId, { from: filters.from, to: filters.to });
  if (me.participations === 0 && me.timesPaid === 0) {
    return <p className="rounded-2xl bg-white/50 px-4 py-6 text-center text-sm text-graphite/60">No participaste de juntadas en este período.</p>;
  }

  // Mi lugar en algunos rankings del período.
  const ranks = rankings(memberStats(ds), ds.juntadas.length);
  const place = (key: string) => {
    const r = ranks.find((x) => x.key === key)!;
    const i = r.rows.findIndex((x) => x.memberId === memberId);
    return i >= 0 && r.rows[i].value > 0 ? `#${i + 1}` : "—";
  };

  const firstMonth = (filters.from ?? ds.juntadas.map((e) => e.occurred_on).sort()[0] ?? today).slice(0, 7);
  const lastMonth = (filters.to ?? today).slice(0, 7);
  let months = monthlySeries({ ...ds, juntadas: [] }, firstMonth, lastMonth).map((m) => ({ ...m, totalCents: me.byMonth.get(m.key) ?? 0 }));
  if (months.length > 24) months = months.slice(-24);
  const catName = new Map(dataset.categories.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Mis indicadores">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Mi consumo" value={money(me.consumedCents)} hint="mi parte en las juntadas" tone="bg-blush/70" />
          <StatTile label="Juntadas a las que fui" value={`${me.participations}`} hint={`${pct(me.participationRate)} de ${me.totalExpenses}`} />
          <StatTile label="Promedio por juntada" value={money(me.avgPerJuntadaCents)} />
          <StatTile label="Promedio mensual" value={money(me.avgPerMonthCents)} hint={`${me.monthsInPeriod} ${me.monthsInPeriod === 1 ? "mes" : "meses"}`} />
          <StatTile label="Plata que adelanté" value={money(me.advancedCents)} hint={`pagué ${me.timesPaid} ${me.timesPaid === 1 ? "gasto" : "gastos"}`} tone="bg-powder/60" />
          <StatTile label="Adelanté por otras" value={money(me.advancedForOthersCents)} hint="sin contar mi parte" />
          <StatTile label="Debo" value={money(me.iOweCents)} tone={me.iOweCents ? "bg-rose/20" : undefined} />
          <StatTile label="Me deben" value={money(me.owedToMeCents)} />
          <StatTile label="Mi lugar" value={place("presente")} hint={`en presencia · ${place("gastadora")} en consumo`} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">Mi consumo mes a mes</h2>
        <Card>
          <ColumnChart
            valueLabel="Mi consumo"
            rows={months.map((m) => ({
              key: m.key, label: formatMonth(m.key), short: MONTH_SHORT[Number(m.key.slice(5)) - 1],
              value: m.totalCents, display: formatMoney(m.totalCents, "ARS", { compact: true }),
            }))}
          />
        </Card>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-xl">En qué se me va</h2>
          <Card>
            <BarList
              valueLabel="Mi consumo"
              rows={me.byCategory.map((c) => ({
                key: c.id, label: c.name, value: c.totalCents, display: formatMoney(c.totalCents, "ARS", { compact: true }),
                sub: `${pct(c.totalCents / Math.max(1, me.consumedCents))} de mi consumo`,
              }))}
            />
          </Card>
        </section>
        <section>
          <h2 className="mb-3 font-display text-xl">Mis juntadas más caras</h2>
          <ol className="flex flex-col gap-2">
            {me.topJuntadas.map((e, i) => (
              <li key={e.id}>
                <Link href={`/gastos/${e.id}`} className="flex items-center gap-3 rounded-2xl bg-white/60 p-3 transition hover:bg-white">
                  <span className="w-5 text-center font-display text-lg text-rose-dark">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.title}</span>
                    <span className="text-xs text-graphite/55">{formatDay(e.occurred_on)} · {catName.get(e.type_id)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{money(e.myCents)}</span>
                    <span className="text-[11px] text-graphite/50">mi parte</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
