"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/** Registra el service worker y avisa cuando hay una versión nueva de la app. */
export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
      // Buscar actualizaciones al volver a la app.
      const check = () => document.visibilityState === "visible" && reg.update();
      document.addEventListener("visibilitychange", check);
    });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waiting) return null;
  return (
    <div className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center gap-3 rounded-full bg-graphite py-2 pr-2 pl-5 text-sm text-cream shadow-xl lg:bottom-6">
      <span className="flex-1">Hay una versión nueva</span>
      <button
        onClick={() => waiting.postMessage("SKIP_WAITING")}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-rose px-4 font-semibold text-graphite"
      >
        <RefreshCw className="size-4" /> Actualizar
      </button>
    </div>
  );
}
