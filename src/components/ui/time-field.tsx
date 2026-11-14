"use client";

import { Clock } from "lucide-react";

/**
 * Hora corta y visual: "21:00 hs" grande, en 24 h. Encima va el selector nativo
 * (invisible), así al tocar se abre la ruedita del teléfono.
 */
export function TimeField({ name, label, sub, value, min, onChange }: {
  name: string; label: string; sub?: string; value: string; min?: string; onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-graphite/80">
      <span>
        {label}
        {sub && <span className="block text-xs font-normal text-graphite/55">{sub}</span>}
      </span>
      <span className="relative inline-flex h-14 w-full max-w-40 items-center justify-center gap-1.5 rounded-2xl bg-white ring-1 ring-graphite/10 transition focus-within:ring-2 focus-within:ring-rose">
        <Clock className="size-4 shrink-0 text-rose-dark" aria-hidden />
        <span className="font-display text-2xl leading-none font-semibold tabular-nums text-graphite">{value || "--:--"}</span>
        <span className="text-xs font-semibold text-graphite/55">hs</span>
        <input type="time" name={name} value={value} min={min} required aria-label={label}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0" />
      </span>
    </label>
  );
}
