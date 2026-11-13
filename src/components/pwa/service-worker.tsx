"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Registra el service worker. Las versiones nuevas se activan solas (skipWaiting en
 * sw.js); acá solo avisamos para recargar la página cuando a la persona le quede
 * cómodo, sin recargar de golpe (podría estar completando un formulario).
 */
export function ServiceWorker() {
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (hadController) setUpdated(true); // en la primera instalación no hace falta avisar
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    // Al tocar una notificación con la app abierta, el service worker nos pide ir a su pantalla.
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type !== "mc:navigate" || !d.url) return;
      const target = new URL(d.url, location.origin);
      if (target.origin === location.origin) location.assign(target.href);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.update().catch(() => {});
      const check = () => document.visibilityState === "visible" && reg.update().catch(() => {});
      document.addEventListener("visibilitychange", check);
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  if (!updated) return null;
  return (
    <div className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center gap-3 rounded-full bg-graphite py-2 pr-2 pl-5 text-sm text-cream shadow-xl lg:bottom-6">
      <span className="flex-1">Hay una versión nueva</span>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-rose px-4 font-semibold text-graphite"
      >
        <RefreshCw className="size-4" /> Actualizar
      </button>
    </div>
  );
}
