"use client";

import { actionButtonClass } from "@/components/ui/action-card";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, HelpCircle, Loader2, ReceiptText, Trash2, X } from "lucide-react";
import { cancelEvent, convertEvent, rsvpEvent } from "@/lib/calendar/actions";
import { RSVP_LABEL, type Rsvp } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";

const ICON = { going: Check, maybe: HelpCircle, no: X };

export function RsvpButtons({ eventId, current }: { eventId: string; current?: Rsvp }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState<Rsvp | undefined>(current);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {(["going", "maybe", "no"] as Rsvp[]).map((r) => {
          const Icon = ICON[r];
          const on = value === r;
          return (
            <button key={r} disabled={pending} onClick={() => start(async () => {
              setError(null); setValue(r);
              const res = await rsvpEvent(eventId, r);
              if (!res.ok) { setValue(current); setError(res.error ?? "Error"); }
            })}
              className={cn("flex h-14 flex-col items-center justify-center rounded-2xl text-sm font-semibold ring-1 transition active:scale-95",
                on ? (r === "going" ? "bg-lime ring-graphite" : r === "maybe" ? "bg-powder ring-graphite" : "bg-graphite text-cream ring-graphite") : "bg-white/70 ring-graphite/10")}>
              <Icon className="size-4" /> {RSVP_LABEL[r]}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-rose-dark">{error}</p>}
    </div>
  );
}

export function ConvertButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button disabled={pending} onClick={() => {
        if (!window.confirm("¿Convertir el evento en juntada? Las que dijeron “Voy” quedan como asistentes y ya se pueden cargar gastos.")) return;
        start(async () => {
          const r = await convertEvent(eventId);
          if (r.ok && r.id) router.push(`/gastos/${r.id}`); else setError(r.error ?? "Error");
        });
      }}
        className={cn(actionButtonClass, "w-full py-3.5")}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <ReceiptText className="size-5" />} Convertir en juntada y cargar gastos
      </button>
      {error && <p className="mt-2 text-sm text-rose-dark">{error}</p>}
    </div>
  );
}

export function CancelEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col">
      <button disabled={pending} onClick={() => {
        if (!window.confirm("¿Eliminar este evento?")) return;
        start(async () => { const r = await cancelEvent(eventId); if (r.ok) router.push("/calendario"); else setError(r.error ?? "Error"); });
      }} className="inline-flex h-11 items-center gap-2 self-start rounded-full px-5 text-sm font-semibold text-rose-dark ring-1 ring-rose/50 disabled:opacity-40">
        <Trash2 className="size-4" /> Eliminar evento
      </button>
      {error && <span className="mt-1 text-xs text-rose-dark">{error}</span>}
    </span>
  );
}
