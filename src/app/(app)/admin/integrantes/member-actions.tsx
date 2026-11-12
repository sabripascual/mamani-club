"use client";

import { useState, useTransition } from "react";
import { KeyRound, ShieldCheck, ShieldOff, UserMinus, UserPlus, Copy } from "lucide-react";
import { resetMemberPassword, setMemberRole, setMemberStatus, type AdminResult } from "@/lib/admin/actions";
import type { MemberRole, MemberStatus } from "@/lib/auth/types";
import { Alert } from "@/components/ui/alert";

type M = { id: string; role: MemberRole; status: MemberStatus; name: string };

export function MemberActions({ member, isMe }: { member: M; isMe: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function run(fn: () => Promise<AdminResult>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      if (res.password) setPassword(res.password);
    });
  }

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-full bg-cream px-3 text-[13px] font-semibold text-graphite/75 ring-1 ring-graphite/10 transition hover:text-graphite disabled:opacity-50";

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {member.status === "active" && member.role === "member" && (
          <button className={btn} disabled={pending} onClick={() => run(() => setMemberRole(member.id, "admin"), `¿Hacer admin a ${member.name}?`)}>
            <ShieldCheck className="size-4" /> Hacer admin
          </button>
        )}
        {member.role === "admin" && (
          <button className={btn} disabled={pending} onClick={() => run(() => setMemberRole(member.id, "member"), `¿Quitarle el rol de admin a ${member.name}?`)}>
            <ShieldOff className="size-4" /> Quitar admin
          </button>
        )}
        {member.status === "active" && !isMe && (
          <button
            className={btn}
            disabled={pending}
            onClick={() => {
              const reason = window.prompt(`¿Por qué desactivás a ${member.name}? (opcional)\nSu historial se conserva.`);
              if (reason === null) return;
              run(() => setMemberStatus(member.id, "inactive", reason));
            }}
          >
            <UserMinus className="size-4" /> Desactivar
          </button>
        )}
        {member.status === "inactive" && (
          <button className={btn} disabled={pending} onClick={() => run(() => setMemberStatus(member.id, "active"))}>
            <UserPlus className="size-4" /> Reactivar
          </button>
        )}
        {!isMe && (
          <button
            className={btn}
            disabled={pending}
            onClick={() => run(() => resetMemberPassword(member.id), `¿Generar una contraseña temporal para ${member.name}? La actual deja de funcionar.`)}
          >
            <KeyRound className="size-4" /> Contraseña temporal
          </button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {password && (
        <Alert tone="info">
          <p>
            Contraseña temporal de {member.name}. Pasásela por privado: se muestra <strong>solo esta vez</strong> y le
            vamos a pedir que la cambie al ingresar.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded-lg bg-white px-3 py-1.5 font-mono text-base">{password}</code>
            <button
              className={btn}
              onClick={async () => {
                await navigator.clipboard.writeText(password);
                setCopied(true);
              }}
            >
              <Copy className="size-4" /> {copied ? "Copiada" : "Copiar"}
            </button>
          </div>
        </Alert>
      )}
    </div>
  );
}
