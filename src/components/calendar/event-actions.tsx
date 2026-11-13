"use client";

import { actionButtonClass } from "@/components/ui/action-card";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, HelpCircle, Loader2, ReceiptText, Trash2, X } from "lucide-react";
import { cancelEvent, convertEvent, rsvpEvent } from "@/lib/calendar/actions";
import { RSVP_LABEL, type Rsvp } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import { celebrate } from "@/components/payment-celebration";

const ICON = { going: Check, maybe: HelpCircle, no: X };

/** Mensaje de la pantalla de confirmación según la respuesta. */
const CONFIRM: Record<Rsvp, (title: string) => [string, string]> = {
  going: (t) => ["¡Te anotamos, reina! 🎉", `Nos vemos en ${t}`],
  maybe: (t) => ["Quedaste en “Tal vez”", `Avisá cuando sepas si vas a ${t}`],
  no: (t) => ["¡Qué lástima! 💔", `Te vamos a extrañar en ${t}`],
};

/**
 * Voy / Tal vez / No voy: primero se elige, después se confirma. Al confirmar se guarda,
 * aparece la pantalla de confirmación y vuelve al inicio.
 */
export function RsvpButtons({ eventId, current, title = "el evento" }: { eventId: string; current?: Rsvp; title?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<Rsvp | undefined>(current);
  const [error, setError] = useState<string | null>(null);
  const confirm = () => {
    if (!value) return;
    start(async () => {
      setError(null);
      const res = await rsvpEvent(eventId, value);
      if (!res.ok) { setError(res.error ?? "Error"); return; }
      const [msg, sub] = CONFIRM[value](title);
      celebrate(msg, sub);
      router.push("/");
    });
  };
  return (
    <div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="¿Vas?">
        {(["going", "maybe", "no"] as Rsvp[]).map((r) => {
          const Icon = ICON[r];
          const on = value === r;
          return (
            <button key={r} type="button" role="radio" aria-checked={on} disabled={pending} onClick={() => { setError(null); setValue(r); }}
              className={cn("flex h-14 flex-col items-center justify-center rounded-2xl text-sm font-semibold ring-1 transition active:scale-95",
                on ? (r === "going" ? "bg-lime ring-2 ring-graphite" : r === "maybe" ? "bg-powder ring-2 ring-graphite" : "bg-graphite text-cream ring-graphite") : "bg-white/70 ring-graphite/10")}>
              <Icon className="size-4" /> {RSVP_LABEL[r]}
            </button>
          );
        })}
      </div>
      {value && (
        <button type="button" onClick={confirm} disabled={pending} className={cn(actionButtonClass, "mt-3 w-full py-3.5")}>
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
          {value === current ? "Confirmar y volver al inicio" : `Confirmar “${RSVP_LABEL[value]}”`}
        </button>
      )}
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
          if (r.ok && r.id) router.push(`/gastos/${r.id}/creada`); else setError(r.error ?? "Error");
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
