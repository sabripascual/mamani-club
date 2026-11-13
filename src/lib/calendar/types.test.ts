import { describe, expect, it } from "vitest";
import { eventDays, eventTimeLabel } from "./types";

const iso = (d: string, t: string) => `${d}T${t}:00-03:00`;

describe("eventTimeLabel", () => {
  it("mismo día, con y sin fin", () => {
    expect(eventTimeLabel({ starts_at: iso("2026-11-14", "21:00"), ends_at: iso("2026-11-14", "23:30"), all_day: false })).toBe("21:00 a 23:30 h");
    expect(eventTimeLabel({ starts_at: iso("2026-11-14", "21:00"), ends_at: null, all_day: false })).toBe("21:00 h");
  });
  it("varios días", () => {
    expect(eventTimeLabel({ starts_at: iso("2026-11-14", "21:00"), ends_at: iso("2026-11-15", "04:00"), all_day: false })).toMatch(/^21:00 h · hasta el .*15\/11, 04:00 h$/);
  });
  it("todo el día, uno o varios", () => {
    expect(eventTimeLabel({ starts_at: iso("2026-11-14", "00:00"), ends_at: iso("2026-11-14", "23:59"), all_day: true })).toBe("Todo el día");
    expect(eventTimeLabel({ starts_at: iso("2026-11-14", "00:00"), ends_at: iso("2026-11-17", "23:59"), all_day: true })).toMatch(/^Todo el día · hasta el .*17\/11$/);
  });
});

describe("eventDays", () => {
  it("un viaje de 4 días ocupa los 4", () => {
    expect(eventDays({ starts_at: iso("2026-11-29", "08:00"), ends_at: iso("2026-12-02", "20:00") })).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });
  it("sin fin, solo el primero", () => expect(eventDays({ starts_at: iso("2026-11-14", "21:00"), ends_at: null })).toEqual(["2026-11-14"]));
});
