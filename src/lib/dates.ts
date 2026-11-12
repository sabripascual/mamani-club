const TZ = "America/Argentina/Buenos_Aires";

/** Fecha de hoy en Buenos Aires como YYYY-MM-DD. */
export function todayAR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

// Las fechas de ocurrencia son "date" (sin hora): se formatean al mediodía UTC
// para que ninguna zona horaria las corra de día.
const asDate = (d: string) => new Date(`${d}T12:00:00Z`);

export function formatDay(d: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(asDate(d));
}

export function formatDayLong(d: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(asDate(d));
}

export function monthKey(d: string) {
  return d.slice(0, 7);
}

export function formatMonth(key: string) {
  const s = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(asDate(`${key}-01`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatTimestamp(ts: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(ts));
}

export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
