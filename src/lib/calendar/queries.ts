import "server-only";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/utils";
import type { Birthday, CalendarEvent, Holiday, Rsvp } from "./types";

const EVENT_COLS = "id, title, starts_at, ends_at, all_day, type_id, location, description, created_by, status, juntada_id, created_at";

/** Eventos, cumpleaños y feriados entre dos fechas (inclusive, en hora argentina). */
export async function getCalendarRange(from: string, to: string, me: string) {
  const supabase = await createClient();
  const [{ data: events }, { data: profiles }, { data: holidays }] = await Promise.all([
    supabase.from("events").select(EVENT_COLS).eq("status", "active")
      // Los que se cruzan con el período: empiezan antes del fin y terminan (o empiezan) después del inicio.
      .lte("starts_at", `${to}T23:59:59-03:00`)
      .or(`starts_at.gte.${from}T00:00:00-03:00,ends_at.gte.${from}T00:00:00-03:00`)
      .order("starts_at").returns<CalendarEvent[]>(),
    supabase.from("profiles").select("id, first_name, nickname, birth_date").eq("status", "active").not("birth_date", "is", null),
    supabase.from("holidays").select("day, name, kind").gte("day", from).lte("day", to).order("day").returns<Holiday[]>(),
  ]);
  const ids = (events ?? []).map((e) => e.id);
  const { data: rsvps } = ids.length
    ? await supabase.from("event_rsvps").select("event_id, member_id, response").in("event_id", ids)
    : { data: [] as { event_id: string; member_id: string; response: Rsvp }[] };

  // Cumpleaños de cada año dentro del rango.
  const birthdays: Birthday[] = [];
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  for (const p of profiles ?? []) {
    const [by, bm, bd] = (p.birth_date as string).split("-").map(Number);
    for (let y = y1; y <= y2; y++) {
      // 29/2 en años no bisiestos → 28/2
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const d = bm === 2 && bd === 29 && !leap ? 28 : bd;
      const day = `${y}-${String(bm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (day >= from && day <= to) birthdays.push({ member_id: p.id as string, name: displayName(p as { first_name: string; nickname: string | null }), day, age: y - by });
    }
  }

  return {
    events: events ?? [],
    rsvps: (rsvps ?? []) as { event_id: string; member_id: string; response: Rsvp }[],
    myRsvp: new Map((rsvps ?? []).filter((r) => r.member_id === me).map((r) => [r.event_id as string, r.response as Rsvp])),
    birthdays: birthdays.sort((a, b) => a.day.localeCompare(b.day)),
    holidays: holidays ?? [],
  };
}

export async function getEvent(id: string) {
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select(EVENT_COLS).eq("id", id).maybeSingle<CalendarEvent>();
  if (!event) return null;
  const { data: rsvps } = await supabase.from("event_rsvps").select("member_id, response, updated_at").eq("event_id", id).order("updated_at");
  return { event, rsvps: (rsvps ?? []) as { member_id: string; response: Rsvp; updated_at: string }[] };
}

/** Cumpleañeras de hoy (para el aviso en Inicio). */
export async function birthdaysToday(today: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, first_name, nickname, birth_date").eq("status", "active").not("birth_date", "is", null);
  const md = today.slice(5);
  return (data ?? [])
    .filter((p) => (p.birth_date as string).slice(5) === md || (md === "02-28" && (p.birth_date as string).slice(5) === "02-29" && Number(today.slice(0, 4)) % 4 !== 0))
    .map((p) => ({ id: p.id as string, name: displayName(p as { first_name: string; nickname: string | null }), age: Number(today.slice(0, 4)) - Number((p.birth_date as string).slice(0, 4)) }));
}
