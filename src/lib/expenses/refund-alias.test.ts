import { describe, expect, it } from "vitest";
import { refundAliasFor } from "./refund-alias";

describe("refundAliasFor", () => {
  const gastos = [
    { paid_by: "ana", refund_alias: "ana.viejo", created_at: "2026-11-01T10:00:00Z" },
    { paid_by: "ana", refund_alias: "ana.banco", created_at: "2026-11-01T12:00:00Z" },
    { paid_by: "ana", refund_alias: null, created_at: "2026-11-01T13:00:00Z" },
    { paid_by: "bea", refund_alias: null, created_at: "2026-11-01T11:00:00Z" },
  ];
  it("usa el alias elegido en su último gasto", () => expect(refundAliasFor(gastos, "ana", "ana.mp")).toBe("ana.banco"));
  it("si no eligió, el principal", () => expect(refundAliasFor(gastos, "bea", "bea.mp")).toBe("bea.mp"));
  it("sin alias", () => expect(refundAliasFor(gastos, "caro")).toBeNull());
});
