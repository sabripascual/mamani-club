"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene la campanita al día: vuelve a pedir la pantalla cuando llega un push con la
 * app abierta, cuando se vuelve a la app y (con `onMount`) al entrar, por si la pantalla
 * venía guardada de antes.
 */
export function LiveRefresh({ onMount = false }: { onMount?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    if (onMount) refresh();
    window.addEventListener("mc:push", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("mc:push", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, onMount]);
  return null;
}
