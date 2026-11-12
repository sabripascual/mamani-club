import Link from "next/link";
import { MONTHS } from "@/lib/dates";
import type { PeriodParams } from "@/lib/stats/load";

type Opt = { id: string; name: string };

/** Filtros en una sola fila arriba de los gráficos (año, mes, rango, categoría, integrante). */
export function PeriodFilter({
  sp, basePath, categories, members, showCategory = true, showMember = true,
}: { sp: PeriodParams & { vista?: string }; basePath: string; categories: Opt[]; members: Opt[]; showCategory?: boolean; showMember?: boolean }) {
  const current = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => current - i);
  const cls = "h-10 rounded-full border border-graphite/10 bg-white/70 px-3 text-sm";
  const active = Object.entries(sp).some(([k, v]) => k !== "vista" && !!v);
  return (
    <form action={basePath} className="mb-6">
      {sp.vista && <input type="hidden" name="vista" value={sp.vista} />}
      <div className="flex flex-wrap gap-2">
        <select name="anio" defaultValue={sp.anio ?? ""} className={cls} aria-label="Año">
          <option value="">Todo el historial</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select name="mes" defaultValue={sp.mes ?? ""} className={cls} aria-label="Mes">
          <option value="">Todo el año</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        {showCategory && (
          <select name="categoria" defaultValue={sp.categoria ?? ""} className={cls} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {showMember && (
          <select name="integrante" defaultValue={sp.integrante ?? ""} className={cls} aria-label="Integrante">
            <option value="">Todas las integrantes</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <button className="h-10 rounded-full bg-graphite px-4 text-sm font-semibold text-cream">Aplicar</button>
        {active && <Link href={sp.vista ? `${basePath}?vista=${sp.vista}` : basePath} className="inline-flex h-10 items-center px-2 text-sm font-semibold text-rose-dark">Limpiar</Link>}
      </div>
      <details className="mt-2 text-sm" open={!!(sp.desde || sp.hasta)}>
        <summary className="cursor-pointer text-graphite/60">Rango de fechas</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="date" name="desde" defaultValue={sp.desde} className={cls} aria-label="Desde" />
          <span className="text-graphite/50">a</span>
          <input type="date" name="hasta" defaultValue={sp.hasta} className={cls} aria-label="Hasta" />
          <span className="text-xs text-graphite/50">(si elegís un rango, reemplaza año y mes)</span>
        </div>
      </details>
    </form>
  );
}
