"use client";

import { useState, useTransition } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { addAlias, makePrimaryAlias, removeAlias, type AliasResult } from "@/lib/profile/actions";
import type { MemberAlias } from "@/lib/profile/aliases";
import { cn } from "@/lib/utils";

/** Alta, baja y principal de los alias para transferir (hasta 5). */
export function AliasManager({ aliases }: { aliases: MemberAlias[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  const [label, setLabel] = useState("");
  const run = (fn: () => Promise<AliasResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Error");
      else after?.();
    });

  return (
    <div className="flex flex-col gap-3">
      {aliases.length === 0 && <p className="text-sm text-graphite/60">Todavía no cargaste alias. Aparecen cuando alguien te tiene que transferir.</p>}
      <ul className="flex flex-col gap-2">
        {aliases.map((a) => (
          <li key={a.id} className={cn("flex items-center gap-2 rounded-2xl p-3", a.is_primary ? "bg-lime/70" : "bg-white/70")}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-semibold">{a.alias}</p>
              <p className="text-xs text-graphite/60">{a.label ?? "Sin etiqueta"}{a.is_primary && " · principal"}</p>
            </div>
            {!a.is_primary && (
              <button disabled={pending} onClick={() => run(() => makePrimaryAlias(a.id))} aria-label={`Hacer principal ${a.alias}`}
                className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-graphite/60 ring-1 ring-graphite/10 hover:text-graphite">
                <Star className="size-3.5" /> Principal
              </button>
            )}
            <button disabled={pending} onClick={() => { if (window.confirm(`¿Borrar el alias ${a.alias}?`)) run(() => removeAlias(a.id)); }}
              aria-label={`Borrar ${a.alias}`} className="inline-flex size-9 items-center justify-center rounded-full text-graphite/50 hover:text-rose-dark">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {aliases.length < 5 && (
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => addAlias(alias, label), () => { setAlias(""); setLabel(""); }); }}
          className="flex flex-col gap-2 rounded-2xl bg-white/50 p-3 ring-1 ring-graphite/5 sm:flex-row"
        >
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="tu.alias.mp" aria-label="Alias" autoCapitalize="none" autoCorrect="off" maxLength={20}
            className="h-11 min-w-0 flex-1 rounded-xl border border-graphite/10 bg-white px-3 font-mono text-sm outline-none focus:border-rose focus:ring-4 focus:ring-rose/15" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej: Mercado Pago" aria-label="Etiqueta" maxLength={30}
            className="h-11 min-w-0 rounded-xl border border-graphite/10 bg-white px-3 text-sm outline-none focus:border-rose focus:ring-4 focus:ring-rose/15 sm:w-40" />
          <button disabled={pending || !alias.trim()} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-graphite px-4 text-sm font-semibold text-cream disabled:opacity-40">
            <Plus className="size-4" /> Agregar
          </button>
        </form>
      )}
      {error && <p className="text-sm text-rose-dark">{error}</p>}
      <p className="text-xs text-graphite/50">Hasta 5 alias. El principal es el que mostramos a quien te tiene que transferir.</p>
    </div>
  );
}
