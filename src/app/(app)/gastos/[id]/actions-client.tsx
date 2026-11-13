"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, LogOut, Trash2, Undo2, UserPlus } from "lucide-react";
import { joinJuntada, leaveJuntada, setGuestPaid, settleTransfer, voidGasto, voidJuntada, voidSettlement } from "@/lib/expenses/actions";
import { celebrate } from "@/components/payment-celebration";
import { cn } from "@/lib/utils";

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

/** "Pagado": registra la transferencia sugerida exacta y festeja. */
export function SettleButton({ juntadaId, from, to, amountCents, alias, meId }: { juntadaId: string; from: string; to: string; amountCents: number; alias?: string; meId: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col items-end">
      <button
        onClick={() => run(async () => {
          const res = await settleTransfer(juntadaId, from, to, amountCents, alias);
          if (res.ok) celebrate(meId === to ? "¡Te pagaron, perrita!" : "¡Gracias perrita!");
          return res;
        })}
        disabled={pending}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-graphite px-3 text-xs font-semibold text-cream transition active:scale-95 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Pagado
      </button>
      {error && <span className="mt-1 max-w-56 text-right text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

/** "Pagó" de una invitada (solo su responsable o una admin). Si ya pagó, permite deshacerlo. */
export function GuestPaidButton({ shareId, juntadaId, paid }: { shareId: string; juntadaId: string; paid: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col items-end">
      {paid ? (
        <button
          onClick={() => { if (window.confirm("¿Deshacer? La invitada vuelve a quedar debiendo.")) run(() => setGuestPaid(shareId, juntadaId, false)); }}
          disabled={pending}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-graphite/60 ring-1 ring-graphite/15 hover:text-graphite"
        >
          <Undo2 className="size-3.5" /> Deshacer
        </button>
      ) : (
        <button
          onClick={() => run(async () => {
            const res = await setGuestPaid(shareId, juntadaId, true);
            if (res.ok) celebrate("¡Gracias a la perrita invitada!", "Puede volver otra vez");
            return res;
          })}
          disabled={pending}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-graphite px-3 text-xs font-semibold text-cream transition active:scale-95 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Pagó
        </button>
      )}
      {error && <span className="mt-1 max-w-56 text-right text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

export function UndoSettlementButton({ settlementId, juntadaId }: { settlementId: string; juntadaId: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col items-end">
      <button
        onClick={() => {
          if (!window.confirm("¿Deshacer esta transferencia? Vuelve a quedar pendiente.")) return;
          run(() => voidSettlement(settlementId, juntadaId, "Deshecha desde la app"));
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

export function JoinButton({ juntadaId }: { juntadaId: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col">
      <button onClick={() => run(() => joinJuntada(juntadaId))} disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-lime px-4 text-sm font-semibold text-graphite transition active:scale-95 disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Me sumo
      </button>
      {error && <span className="mt-1 text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

export function LeaveButton({ juntadaId, memberId, self }: { juntadaId: string; memberId: string; self: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col">
      <button
        onClick={() => {
          if (!window.confirm(self ? "¿Salir de esta juntada?" : "¿Sacar a esta integrante de la juntada?")) return;
          run(() => leaveJuntada(juntadaId, memberId));
        }}
        disabled={pending}
        className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-graphite/55 hover:text-graphite"
      >
        <LogOut className="size-3.5" /> {self ? "No voy / no fui" : "Sacar"}
      </button>
      {error && <span className="mt-1 max-w-56 text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

export function VoidGastoButton({ gastoId, juntadaId }: { gastoId: string; juntadaId: string }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <span className="flex flex-col">
      <button
        disabled={pending}
        onClick={() => {
          const reason = window.prompt("¿Por qué quitás este gasto? (queda en la auditoría)");
          if (!reason?.trim()) return;
          run(async () => {
            const res = await voidGasto(gastoId, juntadaId, reason);
            if (res.ok) router.push(`/gastos/${juntadaId}`);
            return res;
          });
        }}
        className="inline-flex h-11 items-center gap-2 self-start rounded-full px-5 text-sm font-semibold text-rose-dark ring-1 ring-rose/50 disabled:opacity-40"
      >
        <Trash2 className="size-4" /> Quitar este gasto
      </button>
      {error && <span className="mt-1 text-xs text-rose-dark">{error}</span>}
    </span>
  );
}

export function VoidJuntadaButton({ juntadaId, disabled }: { juntadaId: string; disabled?: boolean }) {
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
            const res = await voidJuntada(juntadaId, reason);
            if (res.ok) router.push("/gastos");
            return res;
          });
        }}
        className={cn("inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-rose-dark ring-1 ring-rose/50 disabled:opacity-40")}
      >
        <Trash2 className="size-4" /> Anular juntada
      </button>
      {error && <span className="mt-1 text-xs text-rose-dark">{error}</span>}
    </span>
  );
}
