import { describe, expect, it } from "vitest";
import { previewCuotita, splitInstallments } from "./split";
import { addMonths, monthLabel, monthShort } from "./types";

describe("splitInstallments", () => {
  it("parejo y exacto al centavo", () => {
    expect(splitInstallments(3333334, 3)).toEqual([1111112, 1111111, 1111111]);
    expect(splitInstallments(5000000, 4)).toEqual([1250000, 1250000, 1250000, 1250000]);
    expect(splitInstallments(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("sin cuotas o sin parte, nada", () => {
    expect(splitInstallments(0, 3)).toEqual([]);
    expect(splitInstallments(100, 0)).toEqual([]);
  });
});

describe("previewCuotita", () => {
  it("$100.000 en 3 cuotas entre 3: quien pagó no debe", () => {
    const p = previewCuotita({ totalCents: 10000000, installments: 3, paidBy: "ana", split: "equal", participants: ["ana", "bea", "caro"] });
    const bea = p.find((x) => x.memberId === "bea")!;
    expect(p.find((x) => x.memberId === "ana")!.cuotas).toEqual([]);
    expect(bea.owes).toBe(true);
    expect(bea.cuotas.reduce((a, b) => a + b, 0)).toBe(bea.part);
    expect(p.reduce((a, x) => a + x.part, 0)).toBe(10000000);
  });
});

describe("meses", () => {
  it("suma meses cruzando el año", () => expect(addMonths("2026-12-01", 2)).toBe("2027-02-01"));
  it("nombre del mes", () => expect(monthLabel("2027-01-01")).toBe("Enero 2027"));
  it("nombre corto", () => expect(monthShort("2026-12-01")).toBe("Dic 2026"));
});
