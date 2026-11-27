"use client";

import type { FormState } from "@/lib/expenses/actions";
import type { CategoryTree, Member } from "@/lib/expenses/types";
import { Field } from "@/components/ui/field";
import { FormShell } from "./form-shell";
import { GastoFields, type GastoInitial, type MyAlias } from "./gasto-fields";

export function GastoForm({
  action, categories, members, meId, attendees, juntadaMembers, initial, myAliases, knownGuests,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  categories: CategoryTree;
  members: Member[];
  meId: string;
  attendees: string[];
  /** Quienes están en la juntada: la grilla las muestra primero y el resto, con "+ Sumar". */
  juntadaMembers?: string[];
  initial?: GastoInitial;
  myAliases?: MyAlias[];
  knownGuests?: { name: string; responsible_id: string }[];
}) {
  return (
    <FormShell action={action} submitLabel={initial ? "Guardar cambios" : "Agregar gasto"}>
      {(errors) => (
        <>
          <GastoFields categories={categories} members={members} meId={meId} defaultParticipants={attendees} juntadaMembers={juntadaMembers} initial={initial} errors={errors} myAliases={myAliases} knownGuests={knownGuests} />
          {initial && <Field label="Motivo del cambio" name="reason" placeholder="Ej: faltaba el hielo" hint="Opcional. Queda en la auditoría." maxLength={200} />}
        </>
      )}
    </FormShell>
  );
}
