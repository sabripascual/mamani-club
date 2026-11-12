/**
 * Notificaciones del calendario y del panel (funciones puras, testeables).
 *  - Cumpleaños: 7 días antes (a todas menos la cumpleañera) y el mismo día 8:00.
 *  - Frase semanal: los lunes 8:00, una al azar entre las activas.
 *  - Eventos: la víspera 10:00 y el mismo día 8:00, a quienes dijeron Voy o Tal vez.
 */

export type Person = { id: string; name: string; birth_date: string | null };
export type Msg = { id: string; title: string; body: string };
export type Planned = { kind: "birthday" | "birthday_week" | "weekly" | "event" | "broadcast"; member_id: string; ref_id: string; title: string; body: string; url: string; tag: string };

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ¿El cumpleaños (MM-DD) cae en `day`? 29/2 se festeja el 28/2 en años no bisiestos. */
export function isBirthdayOn(birth: string, day: string) {
  const md = birth.slice(5);
  if (md === day.slice(5)) return true;
  const y = Number(day.slice(0, 4));
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return md === "02-29" && !leap && day.slice(5) === "02-28";
}

const fill = (s: string, name: string) => s.replaceAll("{nombre}", name);

export function planBirthdays(
  today: string, people: Person[], recipients: string[], pick: (msgs: Msg[]) => Msg | undefined,
  messages: { week: Msg[]; day: Msg[] },
): Planned[] {
  const out: Planned[] = [];
  const inAWeek = addDays(today, 7);
  for (const b of people) {
    if (!b.birth_date) continue;
    if (isBirthdayOn(b.birth_date, inAWeek)) {
      const m = pick(messages.week) ?? { id: "", title: "¡La semana que viene cumple años {nombre}!", body: "Vayan pensando el regalo 🎁" };
      for (const r of recipients) {
        if (r === b.id) continue; // sorpresa: a la cumpleañera no
        out.push({ kind: "birthday_week", member_id: r, ref_id: b.id, title: fill(m.title, b.name), body: fill(m.body, b.name), url: "/calendario", tag: `cumple-${b.id}` });
      }
    }
    if (isBirthdayOn(b.birth_date, today)) {
      const m = pick(messages.day) ?? { id: "", title: "¡Feliz cumple!", body: "{nombre} cumple años hoy, saluden a la perrita!" };
      for (const r of recipients) {
        out.push(r === b.id
          ? { kind: "birthday", member_id: r, ref_id: b.id, title: "¡Feliz cumple, perrita! 🎂", body: "Hoy es tu día. El club te quiere 💖", url: "/", tag: `cumple-${b.id}` }
          : { kind: "birthday", member_id: r, ref_id: b.id, title: fill(m.title, b.name), body: fill(m.body, b.name), url: "/", tag: `cumple-${b.id}` });
      }
    }
  }
  return out;
}

/** Lunes (en Argentina) → una frase al azar a todas. */
export function planWeekly(today: string, recipients: string[], messages: Msg[], pick: (msgs: Msg[]) => Msg | undefined): Planned[] {
  const isMonday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  const m = isMonday ? pick(messages) : undefined;
  if (!m) return [];
  return recipients.map((r) => ({ kind: "weekly" as const, member_id: r, ref_id: m.id, title: m.title, body: m.body, url: "/", tag: "semanal" }));
}

export type EventInfo = { id: string; title: string; day: string; time: string; location: string | null; attendees: string[] };

/** "eve": eventos de mañana (10:00). "day": eventos de hoy (8:00). */
export function planEventReminders(today: string, events: EventInfo[], mode: "eve" | "day"): Planned[] {
  const target = mode === "eve" ? addDays(today, 1) : today;
  const out: Planned[] = [];
  for (const e of events) {
    if (e.day !== target) continue;
    const where = e.location ? ` en ${e.location}` : "";
    const title = mode === "eve" ? `Mañana: ${e.title}` : `Hoy: ${e.title} 🎉`;
    const body = mode === "eve" ? `A las ${e.time} h${where}. ¿Seguís yendo?` : `A las ${e.time} h${where}. ¡Nos vemos!`;
    for (const m of e.attendees) out.push({ kind: "event", member_id: m, ref_id: e.id, title, body, url: `/calendario/${e.id}`, tag: `evento-${e.id}` });
  }
  return out;
}
