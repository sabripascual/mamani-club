"use client";

import { useActionState } from "react";
import { updateMyProfile } from "@/lib/profile/actions";
import type { FormState } from "@/lib/auth/actions";
import type { Profile } from "@/lib/auth/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateMyProfile, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">Cambios guardados.</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" name="first_name" defaultValue={profile.first_name} error={state.fields?.first_name} />
        <Field label="Apellido" name="last_name" defaultValue={profile.last_name} error={state.fields?.last_name} />
      </div>
      <Field label="Apodo" name="nickname" defaultValue={profile.nickname ?? ""} error={state.fields?.nickname} hint="Opcional" />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
