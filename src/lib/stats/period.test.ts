import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const { parseYearMonth } = await import("./load");

describe("parseYearMonth (filtro del inicio)", () => {
  it("por defecto, todo el año actual (hasta hoy)", () => {
    const r = parseYearMonth({}, "2026-11-13");
    expect([r.year, r.month]).toEqual([2026, 0]);
    expect(r.filters).toMatchObject({ from: "2026-01-01", to: "2026-11-13" });
  });
  it("mes inválido = todo el año", () => expect(parseYearMonth({ mes: "abc" }, "2026-11-13").month).toBe(0));
  it("mes 0 = todo el año", () => {
    expect(parseYearMonth({ anio: "2025", mes: "0" }, "2026-11-13").filters).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
  });
  it("otro mes", () => {
    expect(parseYearMonth({ anio: "2026", mes: "2" }, "2026-11-13").filters).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
});
