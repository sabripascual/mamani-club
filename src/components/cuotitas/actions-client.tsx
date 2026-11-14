"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, CreditCard, Loader2, Trash2, Undo2 } from "lucide-react";
import { addCard, payInstallments, removeCard, voidCuotita } from "@/lib/cuotitas/actions";
import { CARD_BRANDS, cardDisplay, type CardBrand, type MemberCard } from "@/lib/cuotitas/types";
import { celebrate } from "@/components/payment-celebration";
import { cn } from "@/lib/utils";

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Error");
    });
  return { pending, error, run };
}

/** "Pagado" de una o varias cuotas (con la celebración). `toMe` = la marca quien cobra. */
export function PayInstallmentsButton({ ids, cuotitaId, label = "Pagado", toMe = false, small = false }: {
  ids: string[]; cuotitaId: string; label?: string; toMe?: boolean; small?: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col items-end">
      <button disabled={pending || ids.length === 0}
        onClick={() => run(async () => {
          const r = await payInstallments(ids, cuotitaId, true);
          if (r.ok) celebrate(toMe ? "¡Te pagaron la cuotita, perrita! 🤑" : "¡Cuotita pagada! 💳", toMe ? undefined : "Gracias, perrita");
          return r;
        })}
        className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full bg-graphite font-semibold text-cream transition active:scale-95 disabled:opacity-60",
          small ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-xs")}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {label}
      </button>
      {error && <span className="mt-1 max-w-56 text-right text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

export function UnpayInstallmentButton({ id, cuotitaId }: { id: string; cuotitaId: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col items-end">
      <button disabled={pending} aria-label="Deshacer pago"
        onClick={() => { if (window.confirm("¿Deshacer? La cuota vuelve a quedar pendiente.")) run(() => payInstallments([id], cuotitaId, false)); }}
        className="inline-flex size-8 items-center justify-center rounded-full text-graphite/45 ring-1 ring-graphite/10 hover:text-graphite">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
      </button>
      {error && <span className="mt-1 text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

export function VoidCuotitaButton({ id }: { id: string }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <div>
      <button disabled={pending}
        onClick={() => {
          const reason = window.prompt("¿Por qué la anulás? (queda en la auditoría)");
          if (!reason?.trim()) return;
          run(async () => {
            const r = await voidCuotita(id, reason.trim());
            if (r.ok) router.push("/cuotitas");
            return r;
          });
        }}
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-rose-dark ring-1 ring-rose/30 hover:bg-rose/10">
        <Trash2 className="size-4" /> Anular cuotita
      </button>
      {error && <p className="mt-2 text-sm text-rose-dark">{error}</p>}
    </div>
  );
}

/** Mis tarjetas: solo la marca y un nombre opcional (nada de números). */
export function CardManager({ cards }: { cards: MemberCard[] }) {
  const { pending, error, run } = useAction();
  const [brand, setBrand] = useState<CardBrand>("visa");
  const [label, setLabel] = useState("");
  const hasDigits = /\d/.test(label);
  return (
    <div className="flex flex-col gap-3">
      {cards.length === 0 && <p className="text-sm text-graphite/60">Todavía no cargaste tarjetas. Las usás al cargar una cuotita.</p>}
      <ul className="flex flex-col gap-2">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3">
            <CreditCard className="size-5 text-rose-dark" />
            <span className="flex-1 font-semibold">{cardDisplay(c.brand, c.label)}</span>
            <button disabled={pending} aria-label={`Borrar ${cardDisplay(c.brand, c.label)}`}
              onClick={() => { if (window.confirm("¿Borrar esta tarjeta? Las cuotitas ya cargadas la siguen mostrando.")) run(() => removeCard(c.id)); }}
              className="inline-flex size-9 items-center justify-center rounded-full text-graphite/50 hover:text-rose-dark">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {cards.length < 8 && (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await addCard(brand, label); if (r.ok) setLabel(""); return r; }); }}
          className="flex flex-col gap-2 rounded-2xl bg-white/50 p-3 ring-1 ring-graphite/5 sm:flex-row">
          <select value={brand} onChange={(e) => setBrand(e.target.value as CardBrand)} aria-label="Marca"
            className="h-11 rounded-xl border border-graphite/10 bg-white px-3 text-sm outline-none focus:border-rose sm:w-44">
            {CARD_BRANDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Banco o nombre (opcional)" aria-label="Nombre" maxLength={30}
            className="h-11 min-w-0 sm:flex-1 rounded-xl border border-graphite/10 bg-white px-3 text-sm outline-none focus:border-rose focus:ring-4 focus:ring-rose/15" />
          <button disabled={pending || hasDigits} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-graphite px-4 text-sm font-semibold text-cream disabled:opacity-40">
            Agregar
          </button>
        </form>
      )}
      {hasDigits && <p className="text-sm text-rose-dark">Sin números: poné solo el banco o un nombre (ej: Galicia).</p>}
      {error && <p className="text-sm text-rose-dark">{error}</p>}
      <p className="text-xs text-graphite/50">Nunca guardamos números de tarjeta: solo la marca y el nombre que elijas.</p>
    </div>
  );
}
