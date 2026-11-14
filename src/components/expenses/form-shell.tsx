"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "@/lib/expenses/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Formulario con server action que NO se vacía si vuelve con error (React 19
 * resetea los <form action>; acá usamos onSubmit). Pasa los errores a los hijos.
 */
export function FormShell({
  action, submitLabel, children,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
  children: (errors: Partial<Record<string, string>>) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      // El Enter/"Ir" del teclado no envía el formulario: solo el botón de guardar.
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if (e.key === "Enter" && t.tagName === "INPUT" && (t as HTMLInputElement).type !== "submit") e.preventDefault();
      }}
      className="flex flex-col gap-7"
      noValidate
    >
      {state.error && <Alert>{state.error}</Alert>}
      {children(state.fields ?? {})}
      <Button type="submit" disabled={pending} className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-lg shadow-graphite/20 lg:bottom-6">
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
