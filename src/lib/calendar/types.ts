export type Rsvp = "going" | "maybe" | "no";

export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  type_id: string;
  location: string | null;
  description: string | null;
  created_by: string;
  status: "active" | "cancelled";
  juntada_id: string | null;
  created_at: string;
};

export type Birthday = { member_id: string; name: string; day: string; age: number };
export type Holiday = { day: string; name: string; kind: string | null };

/** Fecha (AR) "YYYY-MM-DD" y hora "HH:MM" de un timestamp. */
export function arDate(ts: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ts));
}
export function arTime(ts: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));
}
/** "Todo el día", "21:00 h" o "21:00 a 02:00 h". */
export function eventTimeLabel(e: { starts_at: string; ends_at: string | null; all_day: boolean }) {
  if (e.all_day) return "Todo el día";
  return e.ends_at ? `${arTime(e.starts_at)} a ${arTime(e.ends_at)} h` : `${arTime(e.starts_at)} h`;
}
/** Hora de fin en ISO: si es antes (o igual) que el inicio, es al día siguiente. */
export function arEndIso(date: string, start: string, end: string) {
  if (!end) return null;
  if (end > start) return arToIso(date, end);
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return arToIso(d.toISOString().slice(0, 10), end);
}
/** Une fecha y hora locales de Argentina (UTC−3, sin horario de verano) en un ISO. */
export function arToIso(date: string, time: string) {
  return `${date}T${time || "21:00"}:00-03:00`;
}

export const RSVP_LABEL: Record<Rsvp, string> = { going: "Voy", maybe: "Tal vez", no: "No voy" };
