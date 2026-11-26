"use client";

import { useEffect, useState, useTransition } from "react";
import { removeSubscription, saveSubscription } from "@/lib/push/actions";

export type PushState = "loading" | "unsupported" | "ios-not-installed" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Estado de las notificaciones en ESTE dispositivo y cómo activarlas/desactivarlas.
 * Lo usan el perfil y el paso obligatorio del onboarding.
 */
export function usePush(vapidKey: string | null) {
  const [state, setState] = useState<PushState>("loading");
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

  /** Vuelve a mirar el permiso (por ejemplo, después de habilitarlo en los ajustes). */
  async function recheck() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setState(sub ? "on" : "off");
  }

  return { state, msg, setMsg, pending, start, enable, disable, recheck };
}
