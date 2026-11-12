export type Rsvp = "going" | "maybe" | "no";

export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
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
/** Une fecha y hora locales de Argentina (UTC−3, sin horario de verano) en un ISO. */
export function arToIso(date: string, time: string) {
  return `${date}T${time || "21:00"}:00-03:00`;
}

export const RSVP_LABEL: Record<Rsvp, string> = { going: "Voy", maybe: "Tal vez", no: "No voy" };
