import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, centsToInput } from "./format";
import { equalSplit } from "./split";
import { simplifyDebts, type Debt } from "./simplify";

const norm = (s: string) => s.replace(/\s/g, " ");

describe("formatMoney", () => {
  it("formatea pesos sin centavos cuando son redondos", () => {
    expect(norm(formatMoney(12000000))).toBe("$ 120.000");
  });
  it("muestra centavos cuando hay", () => {
    expect(norm(formatMoney(12000050))).toBe("$ 120.000,50");
  });
});

describe("parseMoney", () => {
  it.each([
    ["120000", 12000000],
    ["120.000", 12000000],
    ["120.000,50", 12000050],
    ["$ 1.500,5", 150050],
    ["0,99", 99],
    // Teclado del teléfono con punto decimal:
    ["1500.50", 150050],
    ["99.5", 9950],
    ["1.20", 120],
    ["1.500", 150000], // 3 dígitos después del punto: es de miles
    ["1.500.000", 150000000],
    ["1.500.5", 150050],
  ])("%s → %i centavos", (input, cents) => expect(parseMoney(input)).toBe(cents));

  it.each(["", "abc", "12,345", "1.2.3", "-100", "0"])("rechaza %s", (input) => expect(parseMoney(input)).toBeNull());

  it("ida y vuelta con centsToInput", () => {
    expect(parseMoney(centsToInput(12000050))).toBe(12000050);
  });
});

describe("equalSplit", () => {
  it("caso 9: $100.000 entre 4 = $25.000 c/u", () => {
    const s = equalSplit(10000000, ["d", "c", "b", "a"]);
    expect([...s.values()]).toEqual([2500000, 2500000, 2500000, 2500000]);
  });
  it("reparte los centavos sobrantes y suma exacto", () => {
    const s = equalSplit(10000000, ["b", "a", "c"]);
    expect(s.get("a")).toBe(3333334);
    expect(s.get("b")).toBe(3333333);
    expect([...s.values()].reduce((x, y) => x + y)).toBe(10000000);
  });
});

describe("simplifyDebts", () => {
  const total = (ds: Debt[], who: string) =>
    ds.reduce((acc, d) => acc + (d.to === who ? d.amount : 0) - (d.from === who ? d.amount : 0), 0);

  it("A→B y B→C se simplifica a A→C", () => {
    expect(simplifyDebts([
      { from: "A", to: "B", amount: 100 },
      { from: "B", to: "C", amount: 100 },
    ])).toEqual([{ from: "A", to: "C", amount: 100 }]);
  });

  it("deudas cruzadas se compensan", () => {
    expect(simplifyDebts([
      { from: "A", to: "B", amount: 300 },
      { from: "B", to: "A", amount: 100 },
    ])).toEqual([{ from: "A", to: "B", amount: 200 }]);
  });

  it("conserva el saldo neto de cada persona y usa ≤ n−1 transferencias", () => {
    const debts: Debt[] = [
      { from: "A", to: "B", amount: 2500 }, { from: "C", to: "B", amount: 2500 }, { from: "D", to: "B", amount: 2500 },
      { from: "A", to: "D", amount: 1000 }, { from: "B", to: "D", amount: 1000 }, { from: "C", to: "A", amount: 700 },
    ];
    const out = simplifyDebts(debts);
    for (const who of ["A", "B", "C", "D"]) expect(total(out, who)).toBe(total(debts, who));
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("sin deudas no sugiere nada", () => {
    expect(simplifyDebts([])).toEqual([]);
  });
});

describe("formatMoney opciones", () => {
  it("compact abrevia millones con un decimal", () => {
    expect(norm(formatMoney(143000000, "ARS", { compact: true }))).toMatch(/1,4\s?M/);
  });
  it("round quita centavos", () => {
    expect(norm(formatMoney(11689293, "ARS", { round: true }))).toBe("$ 116.893");
  });
});
