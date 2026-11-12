import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { formatDay } from "@/lib/dates";
import type { SettlementStatus } from "@/lib/expenses/types";
import { StatusChip } from "./status-chip";

type Item = { id: string; title: string; occurred_on: string; settlement_status: SettlementStatus };

/** Las últimas juntadas en versión compacta: nombre y estado, con "Ver más". */
export function RecentExpenses({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Últimas juntadas">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xl">Últimas juntadas</h2>
        <Link href="/gastos" className="inline-flex items-center gap-1 text-sm font-semibold text-rose-dark">
          Ver más <ArrowRight className="size-4" />
        </Link>
      </div>
      <ul className="divide-y divide-graphite/5 overflow-hidden rounded-[var(--radius-card)] bg-white/70">
        {items.map((e) => (
          <li key={e.id}>
            <Link href={`/gastos/${e.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.title}</span>
                <span className="text-xs text-graphite/50">{formatDay(e.occurred_on)}</span>
              </span>
              <StatusChip status={e.settlement_status} short />
              <ChevronRight className="size-4 shrink-0 text-graphite/30" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
