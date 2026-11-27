"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, Check, Loader2, RefreshCw, Share, SquarePlus } from "lucide-react";
import { actionButtonClass } from "@/components/ui/action-card";
import { cn } from "@/lib/utils";
import { usePush } from "./use-push";

/**
 * Paso obligatorio del onboarding: activar las notificaciones en este dispositivo.
 * Tapa la app hasta que estén activadas. En iPhone primero hay que instalarla en la
 * pantalla de inicio (Apple no permite notificaciones desde Safari). Si el navegador
 * directamente no las soporta, se puede seguir.
 */
export function PushOnboarding({ vapidKey }: { vapidKey: string | null }) {
  const { state, msg, pending, enable, recheck } = usePush(vapidKey);
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem("mc:push-ok") === "1") setClosed(true); } catch {}
    if ("Notification" in window) setGranted(Notification.permission === "granted");
  }, [state, msg]);
  // Al quedar activadas, se cierra solo y vuelve al inicio.
  useEffect(() => {
    if (state === "on" && msg?.tone === "ok") close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, msg]);
  function close() {
    try { sessionStorage.setItem("mc:push-ok", "1"); } catch {}
    setClosed(true);
    router.replace("/");
  }
  // Solo en producción (en desarrollo no hay service worker) y con el servidor configurado.
  if (process.env.NODE_ENV !== "production" || !vapidKey || closed) return null;
  if (state === "loading" || state === "on" || state === "unsupported") return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="push-onboarding-title"
      className="fixed inset-0 z-[65] overflow-y-auto bg-cream px-[max(1.5rem,env(safe-area-inset-left))] pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center text-center">
        <span className="mx-auto mb-6 flex size-24 items-center justify-center rounded-full bg-rose shadow-xl shadow-rose/30 ring-8 ring-lime">
          <Bell className="size-11 text-graphite" strokeWidth={2.2} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-dark">Último paso</p>
        <h1 id="push-onboarding-title" className="mt-1 font-display text-[2rem] leading-tight font-semibold">Activá las notificaciones</h1>
        <p className="mt-3 text-graphite/70">
          Son obligatorias en el club: así te enterás cuando te cargan un gasto, cuando te pagan o te deben, de las cuotitas y de los planes nuevos.
        </p>

        {state === "off" && (
          <button type="button" onClick={enable} disabled={pending} className={cn(actionButtonClass, "mt-8 h-14 w-full text-base")}>
            {pending ? <Loader2 className="size-5 animate-spin" /> : <Bell className="size-5" />} Activar notificaciones
          </button>
        )}

        {state === "ios-not-installed" && (
          <ol className="mt-8 flex flex-col gap-3 text-left">
            {[
              [Share, <>En Safari tocá <strong>Compartir</strong> (el cuadrado con la flecha).</>],
              [SquarePlus, <>Elegí <strong>Agregar a inicio</strong>.</>],
              [Check, <>Abrí <strong>Mamaní Club</strong> desde el ícono nuevo y activá las notificaciones.</>],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Share;
              return (
                <li key={i} className="flex items-center gap-3 rounded-2xl bg-white/80 p-3 ring-1 ring-graphite/5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime"><I className="size-5" /></span>
                  <span className="text-sm">{text as React.ReactNode}</span>
                </li>
              );
            })}
          </ol>
        )}

        {state === "denied" && (
          <div className="mt-8 flex flex-col gap-3 text-left">
            <p className="rounded-2xl bg-white/80 p-4 text-sm ring-1 ring-graphite/5">
              Las notificaciones están <strong>bloqueadas</strong> para Mamaní Club. Habilitalas en los ajustes del teléfono
              (<strong>Ajustes → Notificaciones → Mamaní Club</strong>; en Android, desde la información de la app) y volvé acá.
            </p>
            <button type="button" onClick={recheck} className={cn(actionButtonClass, "h-14 w-full text-base")}>
              <RefreshCw className="size-5" /> Ya las habilité
            </button>
          </div>
        )}

        {msg && <p className={cn("mt-4 text-sm", msg.tone === "error" ? "text-rose-dark" : "text-graphite/70")}>{msg.text}</p>}
        {granted && !pending && (
          <button type="button" onClick={close} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white font-semibold ring-1 ring-graphite/15">
            Listo, ir al inicio <ArrowRight className="size-4" />
          </button>
        )}
        <p className="mt-8 text-xs text-graphite/50">Las podés probar después desde tu perfil.</p>
      </div>
    </div>
  );
}
