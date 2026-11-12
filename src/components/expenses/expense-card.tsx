import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/money/format";
import { formatDay } from "@/lib/dates";
import type { Category, ExpenseRow, ExpenseStatusRow, Member } from "@/lib/expenses/types";
import { CategoryIcon } from "./category-icon";
import { StatusChip } from "./status-chip";
import { memberName } from "./member-avatar";

export function ExpenseCard({
  e, category, subcategory, payer, meId, index, myOutstanding,
}: {
  e: ExpenseRow & { settlement: ExpenseStatusRow | null };
  category?: Category;
  subcategory?: Category;
  payer?: Member;
  meId: string;
  index: number;
  myOutstanding?: number;
}) {
  return (
    <Link
      href={`/gastos/${e.id}`}
      className="group flex items-center gap-3 rounded-[var(--radius-card)] bg-white/70 p-3 pr-4 transition hover:bg-white active:scale-[0.99]"
    >
      <CategoryIcon icon={category?.icon ?? null} index={index} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{e.title}</p>
        <p className="truncate text-xs text-graphite/55">
          {formatDay(e.occurred_on)} · {subcategory?.name ?? category?.name ?? "Sin categoría"} · {payer?.id === meId ? "pagaste vos" : `pagó ${memberName(payer)}`}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {e.settlement && <StatusChip status={e.settlement.settlement_status} short />}
          {myOutstanding !== undefined && myOutstanding > 0 && (
            <span className="rounded-full bg-rose px-2.5 py-1 text-xs font-semibold text-graphite">Debés {formatMoney(myOutstanding)}</span>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="font-display text-lg font-semibold tabular-nums">{formatMoney(e.amount_cents, e.currency)}</p>
        <p className="text-xs text-graphite/50">{e.settlement?.participants ?? 0} participantes</p>
      </div>
      <ChevronRight className="hidden size-4 text-graphite/30 transition group-hover:translate-x-0.5 sm:block" />
    </Link>
  );
}
