"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Botón para copiar un alias al portapapeles (para pegarlo en la app del banco). */
export function CopyAlias({ alias, label, className }: { alias: string; label?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(alias);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {}
      }}
      aria-label={`Copiar alias ${alias}`}
      className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-graphite/60 ring-1 ring-graphite/10 hover:text-graphite", className)}
    >
      {copied ? <Check className="size-3.5 text-rose-dark" /> : <Copy className="size-3.5" />}
      {label && (copied ? "Copiado" : "Copiar")}
    </button>
  );
}
