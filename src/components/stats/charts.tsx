import { cn } from "@/lib/utils";

/*
 * Gráficos livianos en HTML (sin librería): barras finas con extremo redondeado,
 * grilla recesiva, tooltip al pasar el mouse o al enfocar con teclado, y vista
 * de tabla para accesibilidad. Una sola serie → sin leyenda (el título la nombra).
 */

type Row = { key: string; label: string; value: number; display: string; sub?: string };

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-xl bg-graphite px-3 py-2 text-xs whitespace-nowrap text-cream shadow-lg group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}

function TableView({ rows, valueLabel }: { rows: Row[]; valueLabel: string }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-graphite/55">Ver como tabla</summary>
      <table className="mt-2 w-full text-left">
        <thead><tr className="text-xs text-graphite/55"><th className="py-1 font-semibold">Período / ítem</th><th className="py-1 text-right font-semibold">{valueLabel}</th></tr></thead>
        <tbody className="divide-y divide-graphite/5">
          {rows.map((r) => <tr key={r.key}><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right tabular-nums">{r.display}{r.sub ? ` · ${r.sub}` : ""}</td></tr>)}
        </tbody>
      </table>
    </details>
  );
}

/** Barras horizontales (rankings de categorías, integrantes). Valor directo a la derecha. */
export function BarList({ rows, valueLabel, color = "chart-1" }: { rows: Row[]; valueLabel: string; color?: "chart-1" | "chart-2" }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="group relative" tabIndex={0} aria-label={`${r.label}: ${r.display}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{r.display}</span>
            </div>
            <div className="h-2 rounded-full bg-graphite/[0.06]">
              <div
                className={cn("h-2 rounded-full transition-[filter] group-hover:brightness-90", color === "chart-1" ? "bg-chart-1" : "bg-chart-2")}
                style={{ width: max ? `${Math.max(2, (r.value / max) * 100)}%` : "0%" }}
              />
            </div>
            {r.sub && <Tooltip>{r.label} · {r.display} · {r.sub}</Tooltip>}
          </li>
        ))}
      </ul>
      <TableView rows={rows} valueLabel={valueLabel} />
    </div>
  );
}

/** Columnas verticales para una serie en el tiempo. Destaca la columna máxima con su valor. */
export function ColumnChart({ rows, valueLabel, height = 160 }: { rows: (Row & { short: string })[]; valueLabel: string; height?: number }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  const peak = rows.findIndex((r) => r.value === max && max > 0);
  const many = rows.length > 12;
  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* Grilla recesiva: base y mitad */}
        <div className="absolute inset-x-0 bottom-0 border-t border-graphite/15" />
        <div className="absolute inset-x-0 border-t border-dashed border-graphite/[0.07]" style={{ bottom: height / 2 }} />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {rows.map((r, i) => (
            <div key={r.key} tabIndex={0} aria-label={`${r.label}: ${r.display}`} className="group relative flex h-full flex-1 items-end justify-center outline-none">
              {/* El área de hover es toda la columna, más grande que la barra */}
              <div
                className={cn("w-full max-w-7 rounded-t-[4px] bg-chart-1 transition-[filter] group-hover:brightness-90 group-focus-visible:ring-2 group-focus-visible:ring-graphite", r.value === 0 && "bg-transparent")}
                style={{ height: max ? `${(r.value / max) * 100}%` : 0, minHeight: r.value > 0 ? 3 : 0 }}
              />
              {i === peak && (
                <span className="absolute text-[11px] font-semibold whitespace-nowrap tabular-nums" style={{ bottom: `calc(${(r.value / max) * 100}% + 4px)` }}>
                  {r.display}
                </span>
              )}
              <Tooltip>{r.label} · {r.display}{r.sub ? ` · ${r.sub}` : ""}</Tooltip>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[10px] text-graphite/50">
        {rows.map((r, i) => (
          <span key={r.key} className="flex-1 text-center">{!many || i % 3 === 0 ? r.short : ""}</span>
        ))}
      </div>
      <TableView rows={rows} valueLabel={valueLabel} />
    </div>
  );
}

/** Tarjeta de indicador (número protagonista). */
export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] bg-white/70 p-4", tone)}>
      <p className="text-xs text-graphite/60">{label}</p>
      <p className="mt-0.5 font-display text-[1.45rem] leading-tight font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-graphite/50">{hint}</p>}
    </div>
  );
}
