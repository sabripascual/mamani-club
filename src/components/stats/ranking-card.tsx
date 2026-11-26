import { Crown } from "lucide-react";
import { formatMoney } from "@/lib/money/format";
import { displayName } from "@/lib/utils";
import type { Member } from "@/lib/expenses/types";
import type { Ranking } from "@/lib/stats/compute";
import { Card } from "@/components/ui/card";
import { MemberAvatar } from "@/components/expenses/member-avatar";

function fmt(r: Ranking, v: number) {
  if (r.unit === "money") return formatMoney(v, "ARS", { compact: true });
  if (r.unit === "percent") return `${Math.round(v * 100)}%`;
  return String(v);
}

export function RankingCard({ r, byId, me }: { r: Ranking; byId: Map<string, Member>; me: string }) {
  const winners = r.winners.map((id) => byId.get(id));
  const rest = r.rows.filter((x) => !r.winners.includes(x.memberId) && (r.unit !== "count" || x.value > 0)).slice(0, 4);
  return (
    <Card className="flex min-w-0 flex-col">
      <p className="font-display text-lg leading-tight font-semibold">{r.title}</p>

      {winners.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-cream/80 px-3 py-4 text-center text-sm text-graphite/55">Sin datos suficientes en este período</p>
      ) : (
        <>
          <div className="mt-4 rounded-2xl bg-blush/60 p-3">
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 -space-x-2">
                {winners.slice(0, 3).map((m, i) => <MemberAvatar key={m?.id ?? i} m={m} size="md" />)}
                {winners.length > 3 && (
                  <span className="relative inline-flex size-12 items-center justify-center rounded-full bg-cream text-sm font-semibold ring-2 ring-blush">+{winners.length - 3}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {winners.length === 1 ? (
                  <p className="flex min-w-0 items-center gap-1 font-semibold">
                    <Crown className="size-4 shrink-0 text-rose-dark" strokeWidth={1.8} />
                    <span className="truncate">{winners[0]?.id === me ? "Vos" : winners[0] ? displayName(winners[0]) : "—"}</span>
                  </p>
                ) : (
                  <p className="flex items-center gap-1 text-sm font-semibold">
                    <Crown className="size-4 shrink-0 text-rose-dark" strokeWidth={1.8} /> Empate entre {winners.length}
                  </p>
                )}
                {r.rows[0].detail && winners.length === 1 && <p className="truncate text-xs text-graphite/55">{r.rows[0].detail}</p>}
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{fmt(r, r.rows[0].value)}</p>
            </div>
            {winners.length > 1 && (
              <p className="mt-2 line-clamp-3 text-sm leading-snug break-words text-graphite/80">
                {winners.map((m) => (m?.id === me ? "Vos" : m ? displayName(m) : "—")).join(" · ")}
              </p>
            )}
          </div>
          {rest.length > 0 && (
            <ol className="mt-2 flex flex-col">
              {rest.map((x, i) => {
                const m = byId.get(x.memberId);
                return (
                  <li key={x.memberId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="w-4 text-xs text-graphite/40">{r.winners.length + i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{m?.id === me ? "Vos" : m ? displayName(m) : "—"}</span>
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

