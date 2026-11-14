"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS } from "@/lib/dates";
import { cn } from "@/lib/utils";

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];
const shift = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const DAY = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
export const dayLabel = (d: string) => DAY.format(new Date(`${d}T12:00:00Z`)).replace(/[.,]/g, "");

/**
 * Un solo calendario para elegir de qué día a qué día: tocás el inicio y después el fin
 * (si tocás un día anterior al inicio, empieza de nuevo desde ahí). Un día = tocalo dos veces
 * o dejalo así. Se pueden elegir días que ya pasaron (algo que ya ocurrió); arranca
 * mostrando `initialMonth` (el mes actual al crear).
 */
export function DateRangePicker({ start, end, initialMonth, min, onChange }: {
  start: string; end: string; initialMonth?: string; min?: string; onChange: (start: string, end: string) => void;
}) {
  const [month, setMonth] = useState((initialMonth ?? start).slice(0, 7));
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];

  const tap = (d: string) => {
    if (picking === "start" || d < start) {
      onChange(d, d);
      setPicking("end");
    } else {
      onChange(start, d);
      setPicking("start");
    }
  };

  return (
    <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-graphite/10">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(shift(month, -1))} disabled={!!min && shift(month, -1) < min.slice(0, 7)}
          aria-label="Mes anterior" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-graphite/5 disabled:opacity-30">
          <ChevronLeft className="size-5" />
        </button>
        <p className="font-display text-lg font-semibold">{MONTHS[m - 1]} {y}</p>
        <button type="button" onClick={() => setMonth(shift(month, 1))} aria-label="Mes siguiente" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-graphite/5">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-graphite/45">
        {WEEK.map((w, i) => <span key={i} className="py-1">{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const disabled = !!min && d < min;
          const isStart = d === start;
          const isEnd = d === end;
          const inRange = d > start && d < end;
          const edge = isStart || isEnd;
          return (
            <span key={d} className={cn("relative flex h-10 items-center justify-center",
              (inRange || (isStart && end > start) || (isEnd && end > start)) && "bg-lime/50",
              isStart && end > start && "rounded-l-full", isEnd && end > start && "rounded-r-full")}>
              <button type="button" disabled={disabled} onClick={() => tap(d)} aria-pressed={edge}
                aria-label={`${dayLabel(d)}${isStart ? ", inicio" : ""}${isEnd ? ", fin" : ""}`}
                className={cn("relative z-10 flex size-9 items-center justify-center rounded-full text-sm transition",
                  edge ? "bg-graphite font-semibold text-cream" : "hover:bg-graphite/5",
                  disabled && "text-graphite/25")}>
                {Number(d.slice(8))}
              </button>
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-graphite/60">
        {picking === "end" ? "Ahora tocá el día en que termina (o dejalo en un solo día)." : "Tocá el día de inicio y después el de fin."}
      </p>
    </div>
  );
}
