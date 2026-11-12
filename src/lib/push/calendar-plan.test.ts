import { describe, expect, it } from "vitest";
import { addDays, isBirthdayOn, planBirthdays, planEventReminders, planNewEvent, planWeekly } from "./calendar-plan";

const first = <T,>(xs: T[]) => xs[0];
const people = [
  { id: "mica", name: "Mica", birth_date: "1995-11-19" },
  { id: "flor", name: "Flor", birth_date: "1996-11-12" },
  { id: "juli", name: "Juli", birth_date: null },
];
const all = ["mica", "flor", "juli", "ana"];
const msgs = { week: [{ id: "w", title: "¡La semana que viene cumple años {nombre}!", body: "Vayan pensando el regalo" }], day: [{ id: "d", title: "¡Feliz cumple!", body: "{nombre} cumple años hoy, saluden a la perrita!" }] };

describe("cumpleaños", () => {
  it("una semana antes, a todas menos la cumpleañera", () => {
    const p = planBirthdays("2026-11-12", people, all, first, msgs).filter((x) => x.kind === "birthday_week");
    expect(p.map((x) => x.member_id).sort()).toEqual(["ana", "flor", "juli"]);
    expect(p[0].title).toBe("¡La semana que viene cumple años Mica!");
  });
  it("el día del cumple: saludo a todas y mensaje propio a la cumpleañera", () => {
    const p = planBirthdays("2026-11-12", people, all, first, msgs).filter((x) => x.kind === "birthday");
    expect(p).toHaveLength(4);
    expect(p.find((x) => x.member_id === "ana")!.body).toBe("Flor cumple años hoy, saluden a la perrita!");
    expect(p.find((x) => x.member_id === "flor")!.title).toContain("Feliz cumple, perrita");
  });
  it("29 de febrero se festeja el 28 en años no bisiestos", () => {
    expect(isBirthdayOn("2000-02-29", "2027-02-28")).toBe(true);
    expect(isBirthdayOn("2000-02-29", "2028-02-28")).toBe(false);
    expect(isBirthdayOn("2000-02-29", "2028-02-29")).toBe(true);
  });
  it("sin pool de mensajes usa los textos por defecto", () => {
    const p = planBirthdays("2026-11-12", people, all, () => undefined, { week: [], day: [] });
    expect(p.find((x) => x.kind === "birthday" && x.member_id === "ana")!.title).toBe("¡Feliz cumple!");
  });
});

describe("frase semanal", () => {
  it("solo los lunes", () => {
    const m = [{ id: "m1", title: "Lunes de club", body: "¿Qué hacemos?" }];
    expect(planWeekly("2026-11-16", all, m, first)).toHaveLength(4); // lunes
    expect(planWeekly("2026-11-17", all, m, first)).toHaveLength(0);
  });
  it("sin frases activas no manda nada", () => {
    expect(planWeekly("2026-11-16", all, [], first)).toEqual([]);
  });
});

describe("eventos", () => {
  const ev = [{ id: "e1", title: "Asado", day: "2026-11-13", time: "21:00", location: "Lo de Caro", attendees: ["ana", "flor"] }];
  it("la víspera y el mismo día, a quienes van", () => {
    expect(planEventReminders("2026-11-12", ev, "eve").map((x) => [x.member_id, x.title])).toEqual([["ana", "Mañana: Asado"], ["flor", "Mañana: Asado"]]);
    expect(planEventReminders("2026-11-13", ev, "day")[0].body).toBe("A las 21:00 h en Lo de Caro. ¡Nos vemos!");
    expect(planEventReminders("2026-11-12", ev, "day")).toEqual([]);
  });
  it("addDays cruza meses y años", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("planNewEvent", () => {
  const pool = [{ id: "m1", title: "Se vienen cositasss", body: "{evento} · {fecha}" }];
  const ev = { id: "e1", title: "Asado", when: "Sábado 15 de noviembre, 21:00 h" };
  it("a todas menos a quien lo creó, con la frase completada", () => {
    const plan = planNewEvent(ev, ["ana", "bea", "caro"], "ana", first, pool);
    expect(plan.map((p) => p.member_id)).toEqual(["bea", "caro"]);
    expect(plan[0]).toMatchObject({ kind: "event_new", title: "Se vienen cositasss", body: "Asado · Sábado 15 de noviembre, 21:00 h", url: "/calendario/e1" });
  });
  it("sin frases activas, usa una por defecto", () => {
    expect(planNewEvent(ev, ["bea"], "ana", first, [])[0].title).toBe("¡Hay plan nuevo!");
  });
});
