"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { requestPasswordReset, type RecoverState } from "@/lib/auth/recover";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function RecoverForm() {
  const [state, action, pending] = useActionState<RecoverState, FormData>(requestPasswordReset, {});
  if (state.sent) {
    return (
      <div className="mt-8 rounded-[var(--radius-card)] bg-lime p-5">
        <MailCheck className="size-6" />
        <p className="mt-2 font-semibold">¡Listo! Pedido enviado.</p>
        <p className="mt-1 text-sm text-graphite/75">
          Si ese email o username es de una integrante del club, las admins ya recibieron el aviso. Cuando te pasen la
          contraseña temporal, ingresá con ella y la app te va a pedir que elijas una nueva.
        </p>
        <Link href="/ingresar" className="mt-4 inline-block font-semibold text-graphite underline underline-offset-4">Volver a ingresar</Link>
      </div>
    );
  }
  return (
    <form action={action} className="mt-8 flex flex-col gap-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Email o username" name="identifier" autoComplete="username" autoCapitalize="none" />
      <Button type="submit" disabled={pending}>{pending ? "Enviando…" : "Pedir contraseña nueva"}</Button>
      <p className="text-center text-sm">
        <Link href="/ingresar" className="font-semibold text-rose-dark underline-offset-4 hover:underline">Volver a ingresar</Link>
      </p>
    </form>
  );
}
