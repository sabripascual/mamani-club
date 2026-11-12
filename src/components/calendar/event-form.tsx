"use client";

import { useState } from "react";
import type { FormState } from "@/lib/expenses/actions";
import type { CategoryTree } from "@/lib/expenses/types";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { FormShell } from "@/components/expenses/form-shell";
import { CategoryIcon } from "@/components/expenses/category-icon";

export type EventInitial = { title: string; date: string; time: string; type_id: string; location: string | null; description: string | null };

export function EventForm({ action, types, today, initial, defaultDate }: {
  action: (s: FormState, fd: FormData) => Promise<FormState>; types: CategoryTree; today: string; initial?: EventInitial; defaultDate?: string;
}) {
  const [typeId, setTypeId] = useState(initial?.type_id ?? "");
  return (
    <FormShell action={action} submitLabel={initial ? "Guardar cambios" : "Crear evento"}>
      {(errors) => (
        <>
          <Field label="¿Qué hacemos?" name="title" placeholder="Ej: Cumple de Mica, Asado del sábado" defaultValue={initial?.title} error={errors.title} maxLength={80} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Día" name="date" type="date" min={initial ? undefined : today} defaultValue={initial?.date ?? defaultDate ?? today} error={errors.date} />
            <Field label="Hora" name="time" type="time" defaultValue={initial?.time ?? "21:00"} error={errors.time} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-graphite/80">Tipo</legend>
            <input type="hidden" name="type_id" value={typeId} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {types.map((t, i) => (
                <button type="button" key={t.id} onClick={() => setTypeId(t.id)} aria-pressed={typeId === t.id}
                  className={cn("flex items-center gap-2.5 rounded-2xl p-2 pr-3 text-left text-[13px] leading-tight font-semibold ring-1 transition",
                    typeId === t.id ? "bg-white ring-2 ring-graphite" : "bg-white/50 ring-graphite/10 hover:bg-white")}>
                  <CategoryIcon icon={t.icon} index={i} size="sm" /> {t.name}
                </button>
              ))}
            </div>
            {errors.type_id && <p className="mt-1.5 text-sm text-rose-dark">{errors.type_id}</p>}
          </fieldset>
          <Field label="¿Dónde?" name="location" placeholder="Dirección o lugar" defaultValue={initial?.location ?? ""} maxLength={200} hint="Opcional. Se abre en Google Maps." />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-sm font-semibold text-graphite/80">Detalle <span className="font-normal text-graphite/50">(opcional)</span></label>
            <textarea id="description" name="description" rows={3} maxLength={500} defaultValue={initial?.description ?? ""} placeholder="Qué llevar, dress code…"
              className="rounded-2xl border border-graphite/10 bg-white/70 px-4 py-3 text-base outline-none focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15" />
          </div>
        </>
      )}
    </FormShell>
  );
}
