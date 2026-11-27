"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { addToJuntada } from "@/lib/expenses/actions";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";
import type { Member } from "@/lib/expenses/types";
import { cn } from "@/lib/utils";

/**
 * "+ Sumar" en "Fueron": abre una hoja con las integrantes que todavía no están en la
 * juntada para sumarlas (aparecen marcadas en los gastos nuevos). Les llega un aviso.
 */
export function AddToJuntada({ juntadaId, candidates }: { juntadaId: string; candidates: Member[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  if (candidates.length === 0) return null;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = () => start(async () => {
    setError(null);
    const res = await addToJuntada(juntadaId, picked);
    if (!res.ok) return setError(res.error ?? "No se pudo sumar");
    setPicked([]);
    setOpen(false);
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-rose bg-white py-0.5 pr-3 pl-0.5 text-sm font-semibold text-rose-dark transition active:scale-95">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-blush"><Plus className="size-4" strokeWidth={2.6} /></span>
        Sumar
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="sumar-title">
          <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="absolute inset-0 bg-graphite/40" />
          <div className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-graphite/15" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="sumar-title" className="font-display text-xl font-semibold">¿A quién sumás a la juntada?</h3>
                <p className="mt-0.5 text-xs text-graphite/55">Las que no están todavía. Van a aparecer en los gastos nuevos.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="-mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-cream">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {candidates.map((m) => {
                const on = picked.includes(m.id);
                return (
                  <button type="button" key={m.id} onClick={() => toggle(m.id)} aria-pressed={on}
                    className="relative flex min-w-0 flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold">
                    <span className={cn("rounded-full ring-offset-2 transition", on ? "ring-2 ring-graphite" : "opacity-45 grayscale")}>
                      <MemberAvatar m={m} size="md" />
                    </span>
                    {on && <span className="absolute top-1 right-2 inline-flex size-5 items-center justify-center rounded-full bg-graphite text-cream"><Check className="size-3" strokeWidth={3} /></span>}
                    <span className={cn("w-full truncate px-1 text-center", !on && "text-graphite/50")}>{memberName(m)}</span>
                  </button>
                );
              })}
            </div>
            {error && <p className="mt-2 text-sm text-rose-dark">{error}</p>}
            <button type="button" onClick={submit} disabled={pending || picked.length === 0}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-rose bg-lime font-semibold text-graphite transition active:scale-[0.98] disabled:opacity-50">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {picked.length === 0 ? "Elegí a quién sumar" : `Sumar a ${picked.length}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
