import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { getCategories, getMemberBalances, getMemberMovements } from "@/lib/expenses/queries";
import { formatMoney } from "@/lib/money/format";
import { formatDay } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryIcon } from "./category-icon";
import { StatusChip } from "./status-chip";

export type MovementFilters = { desde?: string; hasta?: string; categoria?: string; estado?: string; tipo?: string };

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <Card className={`p-4 ${tone ?? ""}`}>
    <p className="text-xs text-graphite/60">{label}</p>
    <p className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</p>
  </Card>
);

/** Perfil financiero: resumen (adelantos y consumo separados) + historial filtrable. */
export async function MemberFinancials({ memberId, filters, basePath }: { memberId: string; filters: MovementFilters; basePath: string }) {
  const [balances, movements, { tree, byId: catById }] = await Promise.all([
    getMemberBalances(memberId), getMemberMovements(memberId), getCategories(true),
  ]);
  const ars = balances.find((b) => b.currency === "ARS");

  const rows = movements.filter((m) => {
    const d = m.expense.occurred_on;
    if (filters.desde && d < filters.desde) return false;
    if (filters.hasta && d > filters.hasta) return false;
    if (filters.categoria && m.expense.category_id !== filters.categoria) return false;
    if (filters.tipo === "pago" && !m.isPayer) return false;
    if (filters.tipo === "participo" && !m.participated) return false;
    if (filters.estado === "debe" && m.outstanding_cents <= 0) return false;
    if (filters.estado === "saldado" && m.outstanding_cents !== 0) return false;
    return true;
  });
  const input = "h-10 rounded-full border border-graphite/10 bg-white/70 px-3 text-sm";
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Adelantó por el grupo" value={formatMoney(ars?.advanced_cents ?? 0)} tone="bg-powder/40" />
        <Stat label="Consumo personal" value={formatMoney(ars?.consumed_cents ?? 0)} />
        <Stat label="Le deben" value={formatMoney(ars?.owed_to_me_cents ?? 0)} />
        <Stat label="Debe" value={formatMoney(ars?.i_owe_cents ?? 0)} tone={ars?.i_owe_cents ? "bg-rose/20" : undefined} />
        <Stat label="Juntadas en que participó" value={String(ars?.expenses_participated ?? 0)} />
        <Stat label="Veces que pagó por el grupo" value={String(ars?.times_paid ?? 0)} />
      </div>
      {balances.some((b) => b.currency !== "ARS") && (
        <p className="mt-2 text-xs text-graphite/55">También hay movimientos en otras monedas; se muestran por separado en Balances.</p>
      )}

      <h2 className="mt-8 mb-3 font-display text-xl">Historial</h2>
      <form action={basePath} className="mb-4 flex flex-wrap gap-2">
        <input type="date" name="desde" defaultValue={filters.desde} className={input} aria-label="Desde" />
        <input type="date" name="hasta" defaultValue={filters.hasta} className={input} aria-label="Hasta" />
        <select name="categoria" defaultValue={filters.categoria ?? ""} className={input} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {tree.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="tipo" defaultValue={filters.tipo ?? ""} className={input} aria-label="Tipo">
          <option value="">Pagó o participó</option>
          <option value="pago">Pagó</option>
          <option value="participo">Participó</option>
        </select>
        <select name="estado" defaultValue={filters.estado ?? ""} className={input} aria-label="Estado">
          <option value="">Cualquier estado</option>
          <option value="debe">Con deuda pendiente</option>
          <option value="saldado">Saldado</option>
        </select>
        <button className="h-10 rounded-full bg-graphite px-4 text-sm font-semibold text-cream">Filtrar</button>
        {anyFilter && <Link href={basePath} className="inline-flex h-10 items-center px-2 text-sm font-semibold text-rose-dark">Limpiar</Link>}
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title={anyFilter ? "Sin movimientos con esos filtros" : "Todavía no hay movimientos"} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((m, i) => {
            const cat = catById.get(m.expense.category_id);
            return (
              <li key={m.expense.id}>
                <Link href={`/gastos/${m.expense.id}`} className="flex items-center gap-3 rounded-2xl bg-white/60 p-3 transition hover:bg-white">
                  <CategoryIcon icon={cat?.icon ?? null} index={i} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.expense.title}</p>
                    <p className="truncate text-xs text-graphite/55">
                      {formatDay(m.expense.occurred_on)} · {cat?.name}
                      {" · "}
                      {m.isPayer && m.participated ? "Pagó y participó" : m.isPayer ? "Pagó (no participó)" : "Participó"}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    {m.isPayer && <p className="tabular-nums">Adelantó <strong>{formatMoney(m.expense.amount_cents, m.expense.currency)}</strong></p>}
                    {m.participated && <p className="text-xs text-graphite/60 tabular-nums">Su parte {formatMoney(m.share_cents, m.expense.currency)}</p>}
                    {m.outstanding_cents > 0 ? (
                      <p className="text-xs font-semibold text-rose-dark tabular-nums">Debe {formatMoney(m.outstanding_cents, m.expense.currency)}</p>
                    ) : m.outstanding_cents < 0 ? (
                      <p className="text-xs font-semibold tabular-nums">A reintegrarle {formatMoney(-m.outstanding_cents, m.expense.currency)}</p>
                    ) : m.isPayer && m.expenseStatus ? (
                      <StatusChip status={m.expenseStatus} short />
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
