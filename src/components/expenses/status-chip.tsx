import { cn } from "@/lib/utils";
import { STATUS_LABEL, type SettlementStatus } from "@/lib/expenses/types";

const STYLE: Record<SettlementStatus, string> = {
  pending: "bg-rose/20 text-rose-dark",
  partial: "bg-powder/70 text-graphite",
  settled: "bg-graphite/5 text-graphite/60",
};

export function StatusChip({ status, short }: { status: SettlementStatus; short?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", STYLE[status])}>
      <span className={cn("size-1.5 rounded-full", status === "pending" ? "bg-rose-dark" : status === "partial" ? "bg-graphite/60" : "bg-graphite/30")} />
      {short && status === "partial" ? "Parcial" : STATUS_LABEL[status]}
    </span>
  );
}
