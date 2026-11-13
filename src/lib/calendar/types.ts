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
const WEEKDAY = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short" });
/** "dom 15/11" (armado a mano: el separador cambia según el dispositivo). */
const shortDay = (ts: string) => {
  const [, m, d] = arDate(ts).split("-").map(Number);
  return `${WEEKDAY.format(new Date(ts)).replace(".", "")} ${d}/${m}`;
};

/**
 * Horario de un evento:
 *  "Todo el día" · "Todo el día · hasta el dom 16/11" · "21:00 h" · "21:00 a 23:00 h" ·
 *  "21:00 h · hasta el dom 16/11, 04:00 h".
 */
export function eventTimeLabel(e: { starts_at: string; ends_at: string | null; all_day: boolean }) {
  const multiDay = !!e.ends_at && arDate(e.ends_at) !== arDate(e.starts_at);
  const until = e.ends_at ? shortDay(e.ends_at) : "";
  if (e.all_day) return multiDay ? `Todo el día · hasta el ${until}` : "Todo el día";
  if (!e.ends_at || e.ends_at === e.starts_at) return `${arTime(e.starts_at)} h`;
  return multiDay ? `${arTime(e.starts_at)} h · hasta el ${until}, ${arTime(e.ends_at)} h` : `${arTime(e.starts_at)} a ${arTime(e.ends_at)} h`;
}

/** Días (AR, "YYYY-MM-DD") que ocupa un evento, del primero al último. */
export function eventDays(e: { starts_at: string; ends_at: string | null }) {
  const first = arDate(e.starts_at);
  const last = e.ends_at ? arDate(e.ends_at) : first;
  const out: string[] = [];
  const d = new Date(`${first}T12:00:00Z`);
  while (out.length < 400) {
    const day = d.toISOString().slice(0, 10);
    if (day > last) break;
    out.push(day);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Une fecha y hora locales de Argentina (UTC−3, sin horario de verano) en un ISO. */
export function arToIso(date: string, time: string) {
  return `${date}T${time || "21:00"}:00-03:00`;
}

export const RSVP_LABEL: Record<Rsvp, string> = { going: "Voy", maybe: "Tal vez", no: "No voy" };
