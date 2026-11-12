import { describe, expect, it } from "vitest";
import {
  byCategory, filterDataset, financialSummary, memberStats, monthlySeries, monthsBetween, personalSummary, rankings, socialSummary,
  type Dataset, type StatExpense, type StatShare,
} from "./compute";

const cats = [
  { id: "c-comida", parent_id: null, code: "comida", name: "Comida" },
  { id: "c-fiestas", parent_id: null, code: "fiestas", name: "Fiestas y salidas" },
  { id: "c-dep", parent_id: null, code: "deportes", name: "Deportes y terceros tiempos" },
  { id: "s-tt", parent_id: "c-dep", code: "tercer_tiempo", name: "Tercer tiempo" },
];
const members = ["ana", "bea", "caro", "dani"].map((id) => ({ id, status: "active" }));

function exp(id: string, date: string, cat: string, amount: number, paidBy: string, participants: string[], opts: Partial<StatExpense> & { paidIdx?: string[] } = {}) {
  const e: StatExpense = { id, title: id, occurred_on: date, category_id: cat, subcategory_id: null, base_amount_cents: amount, fx_rate: 1, paid_by: paidBy, created_by: paidBy, ...opts };
  const each = amount / participants.length;
  const shares: StatShare[] = participants.map((m) => ({
    expense_id: id, member_id: m, amount_cents: each, is_participant: true, is_payer: m === paidBy,
    outstanding_cents: m === paidBy || opts.paidIdx?.includes(m) ? 0 : each,
  }));
  return { e, shares };
}

function dataset(...items: ReturnType<typeof exp>[]): Dataset {
  return { expenses: items.map((i) => i.e), shares: items.flatMap((i) => i.shares), categories: cats, members };
}

const ds = dataset(
  exp("asado", "2026-01-10", "c-comida", 10000000, "bea", ["ana", "bea", "caro", "dani"], { paidIdx: ["caro"] }),
  exp("boliche", "2026-01-24", "c-fiestas", 6000000, "ana", ["ana", "caro", "dani"]),
  exp("after", "2026-03-02", "c-fiestas", 3000000, "dani", ["caro", "ana"]), // dani pagó sin participar
  exp("tercer", "2026-03-15", "c-dep", 4000000, "caro", ["caro", "bea"], { subcategory_id: "s-tt", paidIdx: ["bea"] }),
);

describe("financialSummary", () => {
  it("total, cantidad y promedios", () => {
    const s = financialSummary(ds);
    expect(s.totalCents).toBe(23000000);
    expect(s.count).toBe(4);
    expect(s.avgPerExpenseCents).toBe(5750000);
    expect(s.monthsInPeriod).toBe(3); // enero a marzo
    expect(s.avgPerMonthCents).toBe(Math.round(23000000 / 3));
  });
  it("22. adelantado para otras ≠ total: excluye el consumo propio de quien pagó", () => {
    const s = financialSummary(ds);
    // asado 75.000 + boliche 40.000 + after 30.000 + tercer 20.000
    expect(s.advancedForOthersCents).toBe(7500000 + 4000000 + 3000000 + 2000000);
    // pagaron: caro en asado (25.000) y bea en tercer (20.000)
    expect(s.settledCents).toBe(2500000 + 2000000);
    expect(s.pendingCents).toBe(s.advancedForOthersCents - s.settledCents);
  });
  it("convierte con la cotización guardada (no mezcla monedas)", () => {
    const usd = exp("usd", "2026-02-01", "c-comida", 12000000, "ana", ["ana", "bea"], { fx_rate: 1200 });
    usd.shares = usd.shares.map((s) => ({ ...s, amount_cents: 5000, outstanding_cents: s.is_payer ? 0 : 5000 })); // USD 50 c/u
    const s = financialSummary(dataset(usd));
    expect(s.totalCents).toBe(12000000);
    expect(s.pendingCents).toBe(6000000); // USD 50 × 1200
  });
});

describe("filtros", () => {
  it("17/21. por fecha: una juntada pasada cae en su período", () => {
    expect(filterDataset(ds, { from: "2026-03-01", to: "2026-03-31" }).expenses.map((e) => e.id)).toEqual(["after", "tercer"]);
  });
  it("21. por categoría", () => {
    expect(filterDataset(ds, { categoryId: "c-fiestas" }).expenses).toHaveLength(2);
  });
  it("21. por integrante: solo juntadas en que participó (pagar sin participar no cuenta)", () => {
    expect(filterDataset(ds, { memberId: "dani" }).expenses.map((e) => e.id)).toEqual(["asado", "boliche"]);
  });
});

describe("memberStats y rankings", () => {
  const stats = memberStats(ds);
  const by = (id: string) => stats.find((s) => s.memberId === id)!;

  it("19. participación: una por juntada", () => {
    // Duplicamos una parte para simular datos repetidos: no debe contar dos veces.
    const dup = { ...ds, shares: [...ds.shares, ds.shares[0]] };
    expect(memberStats(dup).find((s) => s.memberId === "ana")!.participations).toBe(3);
    expect(by("caro").participations).toBe(4);
    expect(by("caro").participationRate).toBe(1);
    expect(by("dani").participationRate).toBe(0.5);
  });
  it("22. adelantado y consumo separados", () => {
    expect(by("dani").advancedCents).toBe(3000000);
    expect(by("dani").consumedCents).toBe(2500000 + 2000000);
    expect(by("bea").advancedCents).toBe(10000000);
    expect(by("bea").consumedCents).toBe(2500000 + 2000000);
  });
  it("rankings temáticos por código de categoría", () => {
    expect(by("caro").fiestas).toBe(2);
    expect(by("caro").tercerTiempo).toBe(1);
    expect(by("bea").tercerTiempo).toBe(1);
    const r = Object.fromEntries(rankings(stats, 4).map((x) => [x.key, x]));
    expect(r.presente.winners).toEqual(["caro"]);
    expect(r.fiestera.winners.sort()).toEqual(["ana", "caro"]);
    expect(r.tercer_tiempo.winners.sort()).toEqual(["bea", "caro"]);
    expect(r.adelanto.winners).toEqual(["bea"]);
    expect(r.ausente.winners.sort()).toEqual(["bea", "dani"]);
  });
  it("20/33. sin datos no hay ganadoras inventadas", () => {
    const empty = { ...ds, expenses: [], shares: [] };
    for (const r of rankings(memberStats(empty), 0)) expect(r.winners).toEqual([]);
    const s = socialSummary(empty, memberStats(empty));
    expect(s.mostPresent).toBeNull();
    expect(s.topCategory).toBeNull();
  });
  it("con pocas juntadas no se señala a la más ausente", () => {
    const two = filterDataset(ds, { to: "2026-01-31" });
    expect(rankings(memberStats(two), two.expenses.length).find((r) => r.key === "ausente")!.winners).toEqual([]);
  });
});

describe("series", () => {
  it("serie mensual continua con meses vacíos en 0", () => {
    expect(monthlySeries(ds, "2026-01", "2026-04").map((m) => [m.key, m.count])).toEqual([
      ["2026-01", 2], ["2026-02", 0], ["2026-03", 2], ["2026-04", 0],
    ]);
  });
  it("categorías ordenadas por gasto", () => {
    expect(byCategory(ds).map((c) => c.name)).toEqual(["Comida", "Fiestas y salidas", "Deportes y terceros tiempos"]);
  });
  it("meses entre fechas", () => {
    expect(monthsBetween("2025-11-20", "2026-02-01")).toBe(4);
  });
  it("mes con más juntadas y categoría más frecuente", () => {
    const s = socialSummary(ds, memberStats(ds));
    expect(s.busiestMonth?.tied).toBe(true);
    expect(s.topCategory?.name).toBe("Fiestas y salidas");
  });
});

describe("personalSummary (vista Yo)", () => {
  it("separa mi consumo de lo que adelanté y calcula mis deudas", () => {
    // dani: participó en asado y boliche; pagó el after sin participar
    const p = personalSummary(ds, "dani");
    expect(p.participations).toBe(2);
    expect(p.participationRate).toBe(0.5);
    expect(p.consumedCents).toBe(2500000 + 2000000);
    expect(p.avgPerJuntadaCents).toBe(2250000);
    expect(p.advancedCents).toBe(3000000);
    expect(p.timesPaid).toBe(1);
    expect(p.advancedForOthersCents).toBe(3000000); // caro y ana en el after
    expect(p.owedToMeCents).toBe(3000000);
    expect(p.iOweCents).toBe(2500000 + 2000000);
    expect(p.byCategory.map((c) => c.name)).toEqual(["Comida", "Fiestas y salidas"]);
    expect(p.topJuntadas[0].id).toBe("asado");
  });
  it("sin participaciones: todo en cero, sin inventar", () => {
    const p = personalSummary({ ...ds, expenses: [], shares: [] }, "dani");
    expect(p.participations).toBe(0);
    expect(p.avgPerMonthCents).toBe(0);
    expect(p.topJuntadas).toEqual([]);
  });
});
