"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Trash2, Undo2 } from "lucide-react";
import { markSharePaid, voidExpense, voidPayment } from "@/lib/expenses/actions";
import { cn } from "@/lib/utils";
import { celebrate } from "@/components/payment-celebration";

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "No se pudo completar");
    });
  return { pending, error, run };
}

export function MarkPaidButton({ shareId, expenseId, label, compact, refund }: { shareId: string; expenseId: string; label: string; compact?: boolean; refund?: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col items-end">
      <button
        onClick={() => run(async () => {
          const res = await markSharePaid(shareId, expenseId);
          if (res.ok) celebrate(refund ? "¡Reintegro listo!" : "¡Gracias perrita!");
          return res;
        })}
        disabled={pending}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-graphite font-semibold text-cream transition active:scale-95 disabled:opacity-60",
          compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
        )}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {label}
      </button>
      {error && <span className="mt-1 max-w-48 text-right text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

export function UndoPaymentButton({ paymentId, expenseId }: { paymentId: string; expenseId: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col items-end">
      <button
        onClick={() => {
          if (!window.confirm("¿Deshacer este pago? La deuda vuelve a quedar pendiente.")) return;
          run(() => voidPayment(paymentId, expenseId, "Deshecho desde la app"));
        }}
        disabled={pending}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-graphite/60 ring-1 ring-graphite/15 hover:text-graphite"
      >
        <Undo2 className="size-3.5" /> Deshacer
      </button>
      {error && <span className="mt-1 text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

export function VoidExpenseButton({ expenseId, disabled }: { expenseId: string; disabled?: boolean }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col">
      <button
        disabled={disabled || pending}
        onClick={() => {
          const reason = window.prompt("¿Por qué anulás esta juntada? (queda en la auditoría)");
          if (!reason?.trim()) return;
          run(async () => {
            const res = await voidExpense(expenseId, reason);
            if (res.ok) router.push("/gastos");
            return res;
          });
        }}
        className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-rose-dark ring-1 ring-rose/50 disabled:opacity-40"
      >
        <Trash2 className="size-4" /> Anular
      </button>
      {error && <span className="mt-1 text-xs text-rose-dark">{error}</span>}
    </span>
  );
}
