import { eventDays } from "./types";

type Ev = { id: string; starts_at: string; ends_at: string | null };
type Dated = { day: string };

/**
 * Lista del calendario: cada evento aparece UNA sola vez.
 *  - Sin día elegido: en el primer día del evento que se ve (desde `listFrom`).
 *  - Con un día elegido: si ese día está dentro del evento (aunque haya empezado antes).
 * Cumpleaños y feriados, en su día.
 */
export function buildAgenda<E extends Ev, B extends Dated, H extends Dated>(o: {
  events: E[]; birthdays: B[]; holidays: H[]; from: string; to: string; listFrom: string; selected: string | null;
}) {
  const agenda = new Map<string, { events: E[]; birthdays: B[]; holidays: H[] }>();
  const slot = (d: string) => { if (!agenda.has(d)) agenda.set(d, { events: [], birthdays: [], holidays: [] }); return agenda.get(d)!; };
  for (const e of o.events) {
    const days = eventDays(e).filter((d) => d >= o.from && d <= o.to);
    if (o.selected) { if (days.includes(o.selected)) slot(o.selected).events.push(e); continue; }
    const first = days.find((d) => d >= o.listFrom);
    if (first) slot(first).events.push(e);
  }
  const keep = (d: string) => (o.selected ? d === o.selected : d >= o.listFrom);
  for (const b of o.birthdays) if (keep(b.day)) slot(b.day).birthdays.push(b);
  for (const h of o.holidays) if (keep(h.day)) slot(h.day).holidays.push(h);
  return agenda;
}
