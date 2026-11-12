"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { changePassword, type FormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ChangePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});

  useEffect(() => {
    if (state.ok && redirectTo) {
      router.replace(redirectTo);
      router.refresh();
    }
  }, [state.ok, redirectTo, router]);

  return (
    <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && !redirectTo && <Alert tone="success">Listo, tu contraseña quedó actualizada.</Alert>}
      <Field label="Nueva contraseña" name="password" type="password" autoComplete="new-password" error={state.fields?.password} hint="Mínimo 8 caracteres" />
      <Field label="Repetila" name="confirm" type="password" autoComplete="new-password" error={state.fields?.confirm} />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
