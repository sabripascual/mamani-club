import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { getJuntadaTypes, getMemberBalances, getMemberMovements } from "@/lib/expenses/queries";
import { formatMoney } from "@/lib/money/format";
import { formatDay } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryIcon } from "./category-icon";
import { StatusChip } from "./status-chip";
import { DateInput } from "@/components/ui/date-input";

export type MovementFilters = { desde?: string; hasta?: string; categoria?: string; estado?: string; tipo?: string };

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <Card className={`p-4 ${tone ?? ""}`}>
    <p className="text-xs text-graphite/60">{label}</p>
    <p className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</p>
  </Card>
);

const money = (c: number, cur = "ARS") => formatMoney(c, cur, { round: true });

/** Perfil financiero: resumen (adelantos y consumo separados) + historial por juntada. */
export async function MemberFinancials({ memberId, filters, basePath }: { memberId: string; filters: MovementFilters; basePath: string }) {
  const [balances, movements, { tree: types, byId: typeById }] = await Promise.all([
    getMemberBalances(memberId), getMemberMovements(memberId), getJuntadaTypes(true),
  ]);
  const ars = balances.find((b) => b.currency === "ARS");

  const rows = movements.filter((m) => {
    const d = m.juntada.occurred_on;
    if (filters.desde && d < filters.desde) return false;
    if (filters.hasta && d > filters.hasta) return false;
    if (filters.categoria && m.juntada.type_id !== filters.categoria) return false;
    if (filters.tipo === "pago" && m.paid_cents === 0) return false;
    if (filters.tipo === "participo" && m.consumed_cents === 0) return false;
    if (filters.estado === "debe" && m.net_cents >= 0) return false;
    if (filters.estado === "saldado" && m.net_cents !== 0) return false;
    return true;
  });
  const input = "h-10 rounded-full border border-graphite/10 bg-white/70 px-3 text-sm";
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Adelantó por el grupo" value={money(ars?.advanced_cents ?? 0)} tone="bg-powder/40" />
        <Stat label="Consumo personal" value={money(ars?.consumed_cents ?? 0)} />
        <Stat label="Le deben" value={money(ars?.owed_to_me_cents ?? 0)} />
        <Stat label="Debe" value={money(ars?.i_owe_cents ?? 0)} tone={ars?.i_owe_cents ? "bg-rose/20" : undefined} />
        <Stat label="Juntadas a las que fue" value={String(ars?.expenses_participated ?? 0)} />
        <Stat label="Gastos que pagó" value={String(ars?.times_paid ?? 0)} />
      </div>

      <h2 className="mt-8 mb-3 font-display text-xl">Historial</h2>
      <form action={basePath} className="mb-4 flex flex-wrap gap-2">
        <DateInput name="desde" defaultValue={filters.desde} className={input} placeholder="Desde" />
        <DateInput name="hasta" defaultValue={filters.hasta} className={input} placeholder="Hasta" />
        <select name="categoria" defaultValue={filters.categoria ?? ""} className={input} aria-label="Tipo de juntada">
          <option value="">Todos los tipos</option>
          {types.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="tipo" defaultValue={filters.tipo ?? ""} className={input} aria-label="Pagó o participó">
          <option value="">Pagó o consumió</option>
          <option value="pago">Pagó algún gasto</option>
          <option value="participo">Consumió</option>
        </select>
        <select name="estado" defaultValue={filters.estado ?? ""} className={input} aria-label="Estado">
          <option value="">Cualquier estado</option>
          <option value="debe">Con deuda pendiente</option>
          <option value="saldado">Al día</option>
        </select>
        <button className="h-10 rounded-full bg-graphite px-4 text-sm font-semibold text-cream">Filtrar</button>
        {anyFilter && <Link href={basePath} className="inline-flex h-10 items-center px-2 text-sm font-semibold text-rose-dark">Limpiar</Link>}
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title={anyFilter ? "Sin movimientos con esos filtros" : "Todavía no hay movimientos"} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((m, i) => {
            const t = typeById.get(m.juntada.type_id);
            return (
              <li key={m.juntada.id}>
                <Link href={`/gastos/${m.juntada.id}`} className="flex items-center gap-3 rounded-2xl bg-white/60 p-3 transition hover:bg-white">
                  <CategoryIcon icon={t?.icon ?? null} index={i} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.juntada.title}</p>
                    <p className="truncate text-xs text-graphite/55">{formatDay(m.juntada.occurred_on)} · {t?.name}</p>
                  </div>
                  <div className="text-right text-sm">
                    {m.paid_cents > 0 && <p className="tabular-nums">Pagó <strong>{money(m.paid_cents, m.juntada.currency)}</strong></p>}
                    {m.consumed_cents > 0 && <p className="text-xs text-graphite/60 tabular-nums">Consumió {money(m.consumed_cents, m.juntada.currency)}</p>}
                    {m.net_cents < 0 ? (
                      <p className="text-xs font-semibold text-rose-dark tabular-nums">Debe {money(-m.net_cents, m.juntada.currency)}</p>
                    ) : m.net_cents > 0 ? (
                      <p className="text-xs font-semibold tabular-nums">Le deben {money(m.net_cents, m.juntada.currency)}</p>
                    ) : m.status ? (
                      <StatusChip status={m.status.settlement_status} short />
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
