"use client";

import { useState } from "react";
import type { FormState } from "@/lib/expenses/actions";
import type { CategoryTree } from "@/lib/expenses/types";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { LocationField } from "@/components/location-field";
import { FormShell } from "@/components/expenses/form-shell";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { DateRangePicker, dayLabel } from "./date-range-picker";

export type EventInitial = {
  title: string; date: string; time: string; end_date: string; end_time: string; all_day: boolean; type_id: string; location: string | null; description: string | null;
};

/** Una hora más, sin pasar de las 23:59 (si cruza la medianoche, se elige a mano). */
function plusHour(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const inputCls = "h-12 w-full min-w-0 rounded-2xl border border-graphite/10 bg-white/70 px-3 text-base outline-none focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15";

export function EventForm({ action, types, today, initial, defaultDate }: {
  action: (s: FormState, fd: FormData) => Promise<FormState>; types: CategoryTree; today: string; initial?: EventInitial; defaultDate?: string;
}) {
  const [typeId, setTypeId] = useState(initial?.type_id ?? "");
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  // Desde / Hasta como en el calendario del teléfono: el fin sigue al inicio hasta que lo tocás.
  const [start, setStart] = useState({ date: initial?.date ?? defaultDate ?? today, time: initial?.time ?? "21:00" });
  const [end, setEnd] = useState({ date: initial?.end_date ?? initial?.date ?? defaultDate ?? today, time: initial?.end_time || plusHour(initial?.time ?? "21:00") });
  const [endTouched, setEndTouched] = useState(!!initial);
  const changeStart = (next: { date: string; time: string }) => {
    setStart(next);
    const endBefore = `${end.date}T${end.time}` < `${next.date}T${next.time}`;
    if (!endTouched || endBefore) setEnd({ date: next.date, time: plusHour(next.time) });
  };
  const changeEnd = (next: { date: string; time: string }) => { setEndTouched(true); setEnd(next); };
  // Del calendario: nuevo rango de días (las horas se mantienen; si queda el fin antes, se corrige).
  const changeDays = (from: string, to: string) => {
    const s = { ...start, date: from };
    const e = { ...end, date: to };
    setStart(s);
    setEndTouched(true);
    setEnd(`${e.date}T${e.time}` < `${s.date}T${s.time}` ? { date: to, time: plusHour(s.time) } : e);
  };
  const sameDay = end.date === start.date;
  return (
    <FormShell action={action} submitLabel={initial ? "Guardar cambios" : "Crear evento"}>
      {(errors) => (
        <>
          <Field label="¿Qué hacemos?" name="title" placeholder="Ej: Cumple de Mica, Asado del sábado" defaultValue={initial?.title} error={errors.title} maxLength={80} />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold text-graphite/80">¿Cuándo?</legend>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-graphite/10">
              <span className="text-sm font-semibold">Todo el día</span>
              <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="peer sr-only" />
              <span aria-hidden className={cn("relative h-7 w-12 rounded-full transition", allDay ? "bg-rose" : "bg-graphite/15")}>
                <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", allDay ? "left-6" : "left-1")} />
              </span>
            </label>
            <input type="hidden" name="date" value={start.date} />
            <input type="hidden" name="end_date" value={end.date} />
            <DateRangePicker start={start.date} end={end.date} initialMonth={initial ? start.date : today} onChange={changeDays} />
            <p className="text-center text-sm font-semibold">
              {sameDay ? dayLabel(start.date) : <>{dayLabel(start.date)} <span className="text-graphite/40">→</span> {dayLabel(end.date)}</>}
              {!sameDay && <span className="block text-xs font-normal text-graphite/55">Dura varios días: aparece en cada día del calendario.</span>}
            </p>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-graphite/80">
                  Empieza{!sameDay && <span className="-mt-1 text-xs font-normal text-graphite/55">{dayLabel(start.date)}</span>}
                  <input type="time" name="time" required value={start.time}
                    onChange={(e) => e.target.value && changeStart({ ...start, time: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-graphite/80">
                  Termina{!sameDay && <span className="-mt-1 text-xs font-normal text-graphite/55">{dayLabel(end.date)}</span>}
                  <input type="time" name="end_time" required min={sameDay ? start.time : undefined} value={end.time}
                    onChange={(e) => e.target.value && changeEnd({ ...end, time: e.target.value })} className={inputCls} />
                </label>
              </div>
            )}
            {(errors.date || errors.time || errors.end_date || errors.end_time) && (
              <p className="text-sm text-rose-dark">{errors.end_date ?? errors.end_time ?? errors.date ?? errors.time}</p>
            )}
          </fieldset>
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
          <LocationField name="location" placeholder="Dirección o lugar" defaultValue={initial?.location} />
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
