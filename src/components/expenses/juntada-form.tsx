"use client";

import { useState } from "react";
import { Check, ChevronDown, Users } from "lucide-react";
import type { FormState } from "@/lib/expenses/actions";
import type { CategoryTree, Member } from "@/lib/expenses/types";
import { cn, displayName } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { FormShell } from "./form-shell";
import { GastoFields } from "./gasto-fields";
import { CategoryIcon } from "./category-icon";
import { MemberAvatar } from "./member-avatar";

export type JuntadaInitial = { title: string; occurred_on: string; type_id: string; description: string | null; attendees: string[] };

/** Crear o editar una juntada. Al crear, opcionalmente se carga el primer gasto. */
export function JuntadaForm({
  action, types, gastoCategories, members, meId, today, initial,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  types: CategoryTree;
  gastoCategories: CategoryTree;
  members: Member[];
  meId: string;
  today: string;
  initial?: JuntadaInitial;
}) {
  const editing = !!initial;
  const [typeId, setTypeId] = useState(initial?.type_id ?? "");
  const [attendees, setAttendees] = useState<string[]>(initial?.attendees ?? [meId]);
  const [withGasto, setWithGasto] = useState(true);
  const active = members.filter((m) => m.status === "active" || attendees.includes(m.id));
  const allActive = active.filter((m) => m.status === "active").map((m) => m.id);
  const toggle = (id: string) => setAttendees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <FormShell action={action} submitLabel={editing ? "Guardar cambios" : withGasto ? "Crear juntada y gasto" : "Crear juntada"}>
      {(errors) => (
        <>
          <Field label="Nombre de la juntada" name="j_title" placeholder="Ej: Asado en lo de Sofi" defaultValue={initial?.title} error={errors.title} maxLength={80} />
          <Field label="¿Cuándo es o fue?" name="j_occurred_on" type="date" defaultValue={initial?.occurred_on ?? today} error={errors.occurred_on} className="max-w-xs" />

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-graphite/80">Tipo de juntada</legend>
            <input type="hidden" name="j_type_id" value={typeId} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {types.map((t, i) => (
                <button type="button" key={t.id} onClick={() => setTypeId(t.id)} aria-pressed={typeId === t.id}
                  className={cn("flex items-center gap-2.5 rounded-2xl p-2 pr-3 text-left text-[13px] leading-tight font-semibold ring-1 transition",
                    typeId === t.id ? "bg-white ring-2 ring-graphite" : "bg-white/50 ring-graphite/10 hover:bg-white")}>
                  <CategoryIcon icon={t.icon} index={i} size="sm" />
                  {t.name}
                </button>
              ))}
            </div>
            {errors.type_id && <p className="mt-1.5 text-sm text-rose-dark">{errors.type_id}</p>}
          </fieldset>

          {!editing && (
            <fieldset>
              <div className="mb-2 flex items-center justify-between">
                <legend className="text-sm font-semibold text-graphite/80">¿Quiénes van o fueron?</legend>
                <button type="button" onClick={() => setAttendees(attendees.length === allActive.length ? [meId] : allActive)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-dark">
                  <Users className="size-3.5" /> {attendees.length === allActive.length ? "Solo yo" : "Todas"}
                </button>
              </div>
              <p className="mb-3 text-xs text-graphite/55">Después cualquiera puede sumarse sola desde la juntada.</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {active.map((m) => {
                  const on = attendees.includes(m.id);
                  return (
                    <label key={m.id} className="relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold">
                      <input type="checkbox" name="j_attendees" value={m.id} checked={on} onChange={() => toggle(m.id)} className="peer sr-only" />
                      <span className={cn("rounded-full ring-offset-2 ring-offset-cream transition peer-focus-visible:ring-2 peer-focus-visible:ring-rose", on ? "ring-2 ring-graphite" : "opacity-45 grayscale")}>
                        <MemberAvatar m={m} size="md" />
                      </span>
                      {on && <span className="absolute top-1 right-2 inline-flex size-5 items-center justify-center rounded-full bg-graphite text-cream"><Check className="size-3" strokeWidth={3} /></span>}
                      <span className={cn("w-full truncate text-center", !on && "text-graphite/50")}>{m.id === meId ? "Yo" : displayName(m)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="j_description" className="text-sm font-semibold text-graphite/80">Descripción <span className="font-normal text-graphite/50">(opcional)</span></label>
            <textarea id="j_description" name="j_description" rows={2} maxLength={500} defaultValue={initial?.description ?? ""} placeholder="Dónde, qué celebramos…"
              className="rounded-2xl border border-graphite/10 bg-white/70 px-4 py-3 text-base outline-none focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15" />
          </div>

          {editing && <Field label="Motivo del cambio" name="j_reason" hint="Opcional. Queda en la auditoría." maxLength={200} />}

          {!editing && (
            <section className="rounded-[var(--radius-card)] bg-white/50 p-4 ring-1 ring-graphite/5">
              <button type="button" onClick={() => setWithGasto((v) => !v)} className="flex w-full items-center justify-between text-left" aria-expanded={withGasto}>
                <span>
                  <span className="block font-display text-lg font-semibold">Primer gasto</span>
                  <span className="text-xs text-graphite/55">{withGasto ? "Si ya sabés cuánto salió, cargalo acá. Después podés agregar más." : "Lo podés agregar después desde la juntada."}</span>
                </span>
                <ChevronDown className={cn("size-5 transition", withGasto && "rotate-180")} />
              </button>
              {withGasto && (
                <div className="mt-5">
                  <GastoFields prefix="g_" categories={gastoCategories} members={members} meId={meId} defaultParticipants={attendees} errors={errors} compact />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </FormShell>
  );
}
