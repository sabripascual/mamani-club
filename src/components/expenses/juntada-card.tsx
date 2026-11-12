import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/money/format";
import { formatDay } from "@/lib/dates";
import type { Category, JuntadaListItem } from "@/lib/expenses/types";
import { CategoryIcon } from "./category-icon";
import { StatusChip } from "./status-chip";

export function JuntadaCard({ j, type, index, myNet }: { j: JuntadaListItem; type?: Category; index: number; myNet?: number }) {
  const s = j.summary;
  return (
    <Link href={`/gastos/${j.id}`} className="group flex items-center gap-3 rounded-[var(--radius-card)] bg-white/70 p-3 pr-4 transition hover:bg-white active:scale-[0.99]">
      <CategoryIcon icon={type?.icon ?? null} index={index} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{j.title}</p>
        <p className="truncate text-xs text-graphite/55">
          {formatDay(j.occurred_on)} · {type?.name ?? "Juntada"}
          {s && s.expenses_count > 1 && ` · ${s.expenses_count} gastos`}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {s && <StatusChip status={s.settlement_status} short />}
          {myNet !== undefined && myNet < 0 && <span className="rounded-full bg-rose px-2.5 py-1 text-xs font-semibold text-graphite">Debés {formatMoney(-myNet, j.currency, { round: true })}</span>}
          {myNet !== undefined && myNet > 0 && <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-semibold text-graphite">Te deben {formatMoney(myNet, j.currency, { round: true })}</span>}
        </div>
      </div>
      <div className="text-right">
        <p className="font-display text-lg font-semibold tabular-nums">{formatMoney(s?.total_cents ?? 0, j.currency, { round: true })}</p>
        <p className="text-xs text-graphite/50">{s?.attendees_count ?? 0} fueron</p>
      </div>
      <ChevronRight className="hidden size-4 text-graphite/30 transition group-hover:translate-x-0.5 sm:block" />
    </Link>
  );
}
