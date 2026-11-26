"use client";

import { Bell, BellOff, BellRing, Loader2, Share } from "lucide-react";
import { sendTestNotification } from "@/lib/push/actions";
import { usePush } from "./use-push";

/** Activar/desactivar los recordatorios de deudas en ESTE dispositivo. */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const { state, msg, setMsg, pending, start, enable, disable } = usePush(vapidKey);

  function test() {
    start(async () => {
      const r = await sendTestNotification();
      setMsg(r.ok ? { tone: "ok", text: "Te mandamos una de prueba." } : { tone: "error", text: r.error ?? "No se pudo enviar" });
    });
  }

  const btn = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:opacity-60";
  return (
    <div>
      {state === "loading" && <Loader2 className="size-5 animate-spin text-graphite/40" />}
      {state === "unsupported" && <p className="text-sm text-graphite/65">Este navegador no permite notificaciones. Probá desde la app instalada en tu celular.</p>}
      {state === "ios-not-installed" && (
        <p className="text-sm text-graphite/65">
          En iPhone las notificaciones funcionan con la app instalada: en Safari tocá <Share className="inline size-4 align-text-bottom" /> <strong>Compartir</strong> →{" "}
          <strong>Agregar a inicio</strong>, abrila desde el ícono y volvé a esta pantalla.
        </p>
      )}
      {state === "denied" && (
        <p className="text-sm text-graphite/65">
          Bloqueaste las notificaciones para MAMANÍ CLUB. Para activarlas, habilitalas en los ajustes del celular (Notificaciones → MAMANÍ CLUB) y volvé acá.
        </p>
      )}
      {state === "off" && (
        <button onClick={enable} disabled={pending} className={`${btn} bg-graphite text-cream`}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />} Activar notificaciones
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <span className={`${btn} bg-blush`}><BellRing className="size-4 text-rose-dark" /> Activadas en este dispositivo</span>
          <button onClick={test} disabled={pending} className={`${btn} bg-white/70 ring-1 ring-graphite/10`}>Mandarme una de prueba</button>
          <button onClick={disable} disabled={pending} className={`${btn} text-graphite/60 hover:text-graphite`}><BellOff className="size-4" /> Desactivar</button>
        </div>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.tone === "error" ? "text-rose-dark" : "text-graphite/70"}`}>{msg.text}</p>}
    </div>
  );
}
