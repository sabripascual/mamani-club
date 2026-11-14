import { describe, expect, it } from "vitest";
import { buildAgenda } from "./agenda";

const viaje = { id: "viaje", starts_at: "2026-11-20T09:00:00-03:00", ends_at: "2026-11-22T20:00:00-03:00" };
const asado = { id: "asado", starts_at: "2026-11-28T21:00:00-03:00", ends_at: null };
const base = { events: [viaje, asado], birthdays: [{ day: "2026-11-21" }], holidays: [] as { day: string }[], from: "2026-11-01", to: "2026-11-30" };
const ids = (m: ReturnType<typeof buildAgenda>) => [...m].flatMap(([d, x]) => x.events.map((e) => `${d}:${e.id}`));

describe("buildAgenda", () => {
  it("un evento de 3 días aparece una sola vez, en su primer día", () => {
    expect(ids(buildAgenda({ ...base, listFrom: "2026-11-01", selected: null }))).toEqual(["2026-11-20:viaje", "2026-11-28:asado"]);
  });
  it("si ya empezó, aparece hoy (no se pierde)", () => {
    expect(ids(buildAgenda({ ...base, listFrom: "2026-11-21", selected: null }))).toEqual(["2026-11-21:viaje", "2026-11-28:asado"]);
  });
  it("al elegir un día del medio, se muestra ese evento", () => {
    const a = buildAgenda({ ...base, listFrom: "2026-11-01", selected: "2026-11-21" });
    expect(ids(a)).toEqual(["2026-11-21:viaje"]);
    expect(a.get("2026-11-21")!.birthdays).toHaveLength(1);
  });
  it("si cruza de mes, aparece desde el primer día del mes nuevo", () => {
    const largo = { id: "largo", starts_at: "2026-10-30T10:00:00-03:00", ends_at: "2026-11-02T10:00:00-03:00" };
    expect(ids(buildAgenda({ ...base, events: [largo], listFrom: "2026-11-01", selected: null }))).toEqual(["2026-11-01:largo"]);
  });
});
