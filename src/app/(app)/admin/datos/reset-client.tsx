"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { resetTestData, type ResetResult } from "@/lib/admin/reset-actions";
import { RESET_PHRASE } from "@/lib/admin/reset-phrase";
import { cn } from "@/lib/utils";

/** Borrado de datos de prueba: hay que escribir la frase y confirmar dos veces. */
export function ResetData() {
  const [pending, start] = useTransition();
  const [phrase, setPhrase] = useState("");
  const [result, setResult] = useState<ResetResult | null>(null);
  const ready = phrase.trim().toUpperCase() === RESET_PHRASE;
  const run = () => {
    if (!window.confirm("¿Seguro? Se borran todas las juntadas, gastos, eventos, fotos y cuotitas. No se puede deshacer.")) return;
    start(async () => {
      setResult(null);
      const r = await resetTestData(phrase);
      setResult(r);
      if (r.ok) setPhrase("");
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="reset-phrase" className="text-sm font-semibold">Para confirmar, escribí <span className="font-mono">{RESET_PHRASE}</span></label>
      <input id="reset-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" autoCapitalize="characters"
        placeholder={RESET_PHRASE}
        className="h-12 rounded-2xl border border-graphite/10 bg-white px-4 font-mono outline-none focus:border-rose focus:ring-4 focus:ring-rose/15" />
      <button type="button" onClick={run} disabled={!ready || pending}
        className={cn("inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 font-semibold transition",
          ready ? "bg-rose-dark text-white" : "bg-graphite/10 text-graphite/40")}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
        {pending ? "Borrando… no cierres la app" : "Borrar todos los datos de prueba"}
      </button>
      {result?.ok && (
        <div className="rounded-2xl bg-lime/60 p-4 text-sm">
          <p className="font-semibold">¡Listo! Empezamos de cero. 🧹</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-graphite/75">
            {Object.entries(result.deleted ?? {}).filter(([, n]) => n > 0).map(([k, n]) => <li key={k}>{n} {k}</li>)}
            <li>{result.files ?? 0} archivos de fotos</li>
          </ul>
        </div>
      )}
      {result && !result.ok && (
        <div className="rounded-2xl bg-rose/20 p-4 text-sm">
          <p className="font-semibold text-rose-dark">No se pudo terminar: {result.error}</p>
          <p className="mt-1 text-graphite/70">Lo que ya se borró queda borrado. Podés volver a intentarlo: sigue desde donde quedó.</p>
        </div>
      )}
    </div>
  );
}
