"use client";

import { useCallback, useEffect, useState } from "react";

const PIECES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const dist = 110 + (i % 3) * 30;
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, r: (i * 47) % 360, lime: i % 2 === 0 };
});

/** Celebración a pantalla completa: tilde rosa + mensaje (~3 s). Se puede cerrar tocando. */
export function PaymentCelebration({ message = "¡Gracias perrita!", onDone }: { message?: string; onDone: () => void }) {
  useEffect(() => {
    navigator.vibrate?.(40);
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDone}
      className="mc-anim fixed inset-0 z-[70] flex cursor-pointer items-center justify-center bg-cream/70 backdrop-blur-sm"
      style={{ animation: "mc-fade 3.2s ease-out forwards" }}
    >
      <div className="relative flex flex-col items-center" style={{ animation: "mc-pop 0.5s cubic-bezier(.2,1.4,.4,1) both" }}>
        {PIECES.map((p, i) => (
          <span
            key={i}
            className={`absolute top-14 left-1/2 size-3 rounded-sm ${p.lime ? "bg-lime" : "bg-rose"}`}
            style={{ ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px`, ["--r" as string]: `${p.r}deg`, animation: "mc-confetti 0.9s 0.15s ease-out both" } as React.CSSProperties}
          />
        ))}
        <span className="flex size-28 items-center justify-center rounded-full bg-rose shadow-xl shadow-rose/40 ring-8 ring-lime">
          <svg viewBox="0 0 24 24" className="size-14" fill="none" stroke="#38333b" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="48" style={{ animation: "mc-draw 0.45s 0.25s ease-out both" }} />
          </svg>
        </span>
        <p className="mt-5 font-display text-3xl font-semibold text-graphite">{message}</p>
      </div>
    </div>
  );
}

/** Dispara la celebración desde cualquier parte (sobrevive aunque el botón desaparezca). */
export function celebrate(message?: string) {
  window.dispatchEvent(new CustomEvent("mc:celebrate", { detail: message }));
}

/** Va una sola vez en el layout de la app. */
export function CelebrationHost() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMessage((e as CustomEvent<string | undefined>).detail ?? "¡Gracias perrita!");
    window.addEventListener("mc:celebrate", on);
    return () => window.removeEventListener("mc:celebrate", on);
  }, []);
  const done = useCallback(() => setMessage(null), []);
  return message ? <PaymentCelebration message={message} onDone={done} /> : null;
}
