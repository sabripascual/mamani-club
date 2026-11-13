"use client";

import { useRouter } from "next/navigation";
import { MONTHS } from "@/lib/dates";

/**
 * Filtro del inicio: solo año y mes (por defecto, los actuales). Se aplica al elegir.
 * "Todo el año" = mes 0.
 */
export function YearMonthFilter({ year, month, basePath, vista }: { year: number; month: number; basePath: string; vista?: string }) {
  const router = useRouter();
  const current = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => current - i);
  const cls = "h-10 rounded-full border border-graphite/10 bg-white/70 px-3 text-sm font-semibold";
  const go = (y: number, m: number) => {
    const q = new URLSearchParams();
    if (vista) q.set("vista", vista);
    q.set("anio", String(y));
    q.set("mes", String(m));
    router.push(`${basePath}?${q}`, { scroll: false });
  };
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <select value={year} onChange={(e) => go(Number(e.target.value), month)} className={cls} aria-label="Año">
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <select value={month} onChange={(e) => go(year, Number(e.target.value))} className={cls} aria-label="Mes">
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        <option value={0}>Todo el año</option>
      </select>
    </div>
  );
}
