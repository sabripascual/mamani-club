"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, BellRing, Loader2, Share } from "lucide-react";
import { removeSubscription, saveSubscription, sendTestNotification } from "@/lib/push/actions";

type State = "loading" | "unsupported" | "ios-not-installed" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Activar/desactivar los recordatorios de deudas en ESTE dispositivo. */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "ios-not-installed" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  function enable() {
    if (!vapidKey) return setMsg({ tone: "error", text: "Las notificaciones todavía no están configuradas en el servidor." });
    start(async () => {
      setMsg(null);
      try {
        // Apple exige que el pedido de permiso salga de un toque explícito: este botón.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
        const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
        const res = await saveSubscription(sub.toJSON() as never, navigator.userAgent);
        if (!res.ok) {
          await sub.unsubscribe();
          return setMsg({ tone: "error", text: res.error ?? "No se pudo activar" });
        }
        setState("on");
        setMsg({ tone: "ok", text: "¡Listo! Te van a llegar los recordatorios a las 10 de la mañana." });
      } catch {
        setMsg({ tone: "error", text: "No se pudo activar en este dispositivo." });
      }
    });
  }

  function disable() {
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg({ tone: "ok", text: "Desactivadas en este dispositivo." });
    });
  }

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
