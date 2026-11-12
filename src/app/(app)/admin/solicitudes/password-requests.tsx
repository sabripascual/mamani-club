"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, X } from "lucide-react";
import { approvePasswordRequest, rejectPasswordRequest } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function PasswordRequestActions({ requestId, name }: { requestId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  if (password) {
    return (
      <Alert tone="info">
        <p>Contraseña temporal de {name}. Pasásela por privado: se muestra <strong>solo esta vez</strong> y le vamos a pedir que la cambie al ingresar.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-white px-3 py-1.5 font-mono text-base">{password}</code>
          <button
            onClick={async () => { await navigator.clipboard.writeText(password); setCopied(true); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-semibold ring-1 ring-graphite/10"
          >
            <Copy className="size-4" /> {copied ? "Copiada" : "Copiar"}
          </button>
        </div>
      </Alert>
    );
  }
  if (done) return <p className="text-sm text-graphite/60">Pedido rechazado.</p>;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex gap-2">
        <Button variant="danger" className="h-10 flex-1 px-4" disabled={pending}
          onClick={() => start(async () => { const r = await rejectPasswordRequest(requestId); if (r.ok) setDone(true); else setError(r.error ?? "Error"); })}>
          <X className="size-4" /> Rechazar
        </Button>
        <Button className="h-10 flex-1 px-4" disabled={pending}
          onClick={() => start(async () => {
            setError(null);
            const r = await approvePasswordRequest(requestId);
            if (r.ok && r.password) setPassword(r.password); else setError(r.error ?? "Error");
          })}>
          <KeyRound className="size-4" /> Generar temporal
        </Button>
      </div>
      {error && <p className="text-sm text-rose-dark">{error}</p>}
    </div>
  );
}
