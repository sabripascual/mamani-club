"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type FormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function SignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="mt-8 flex flex-col gap-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      <Field
        label="Email o username"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        defaultValue={state.values?.identifier}
        error={state.fields?.identifier}
      />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fields?.password}
      />
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
      <p className="text-center text-sm text-graphite/65">
        ¿Todavía no sos parte?{" "}
        <Link href="/registro" className="font-semibold text-rose-dark underline-offset-4 hover:underline">
          Pedí tu acceso
        </Link>
      </p>
      <p className="text-center text-xs text-graphite/50">
        ¿Te olvidaste la contraseña? Pedile a una admin que te genere una temporal.
      </p>
    </form>
  );
}
