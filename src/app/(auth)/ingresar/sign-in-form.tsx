"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type FormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
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
      <PasswordField
        label="Contraseña"
        name="password"
       
        autoComplete="current-password"
        error={state.fields?.password}
      />
      <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-graphite/80">
        <input type="checkbox" name="remember" defaultChecked className="size-5 rounded accent-rose-dark" />
        Mantener la sesión iniciada
      </label>
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
      <p className="text-center text-sm text-graphite/65">
        ¿Todavía no sos parte?{" "}
        <Link href="/registro" className="font-semibold text-rose-dark underline-offset-4 hover:underline">
          Pedí tu acceso
        </Link>
      </p>
      <p className="text-center text-sm">
        <Link href="/recuperar" className="font-semibold text-graphite/60 underline-offset-4 hover:text-graphite hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}
