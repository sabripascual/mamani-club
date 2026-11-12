"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = "mamani:install-dismissed";

/** Invitación a instalar la app (Android: botón nativo; iOS: instrucciones de "Compartir"). */
export function InstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      setIos(true);
      setVisible(true);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  if (!visible) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-card)] bg-powder/45 p-4 text-sm">
      <Download className="mt-0.5 size-5 shrink-0" strokeWidth={1.6} />
      <div className="flex-1">
        <p className="font-semibold">Instalá MAMANÍ CLUB en tu celular</p>
        {ios ? (
          <p className="mt-1 text-graphite/70">
            En Safari tocá <Share className="inline size-4 align-text-bottom" /> <strong>Compartir</strong> y después{" "}
            <strong>Agregar a inicio</strong>.
          </p>
        ) : (
          <button
            className="mt-2 inline-flex h-9 items-center rounded-full bg-graphite px-4 font-semibold text-cream"
            onClick={async () => {
              await deferred?.prompt();
              dismiss();
            }}
          >
            Instalar app
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Cerrar" className="text-graphite/50 hover:text-graphite">
        <X className="size-5" />
      </button>
    </div>
  );
}
