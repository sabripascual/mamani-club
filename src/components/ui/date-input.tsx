"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fecha con máscara: mientras está vacía muestra "Desde" / "Hasta" (en el teléfono el
 * campo de fecha vacío se ve en blanco hasta que lo tocás).
 */
export function DateInput({ name, defaultValue, placeholder, className }: { name: string; defaultValue?: string; placeholder: string; className?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <span className="relative inline-flex min-w-0">
      <input type="date" name={name} value={value} onChange={(e) => setValue(e.target.value)} aria-label={placeholder}
        className={cn(className, "min-w-[8.5rem]", !value && "text-transparent focus:text-graphite")} />
      {!value && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center gap-1.5 text-sm text-graphite/45">
          <CalendarDays className="size-4" /> {placeholder}
        </span>
      )}
    </span>
  );
}
