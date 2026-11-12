import { describe, expect, it } from "vitest";
import {
  byCategory, byJuntadaType, filterDataset, financialSummary, memberStats, monthlySeries, monthsBetween, personalSummary, rankings,
  socialSummary, type Dataset,
} from "./compute";

const categories = [
  { id: "c-comida", parent_id: null, code: "comida", name: "Comida", kind: "gasto" },
  { id: "c-bebidas", parent_id: null, code: "bebidas", name: "Bebidas", kind: "gasto" },
  { id: "t-casa", parent_id: null, code: "j_casa", name: "Juntada en casa", kind: "juntada" },
  { id: "t-salida", parent_id: null, code: "j_salida", name: "Salida / boliche", kind: "juntada" },
  { id: "t-tt", parent_id: null, code: "j_tercer_tiempo", name: "Tercer tiempo", kind: "juntada" },
];
const members = ["ana", "bea", "caro", "dani"].map((id) => ({ id, status: "active" }));

type G = { id: string; cat: string; amount: number; paidBy: string; parts: string[] };
type J = { id: string; date: string; type: string; attendees: string[]; gastos: G[]; settlements?: { from: string; to: string; amount: number }[] };

/** Arma el dataset y calcula los saldos netos igual que la base (pagó − consumió + envió − recibió). */
function build(...js: J[]): Dataset {
  const ds: Dataset = { juntadas: [], gastos: [], shares: [], attendees: [], nets: [], settlements: [], categories, members };
  for (const j of js) {
    ds.juntadas.push({ id: j.id, title: j.id, occurred_on: j.date, type_id: j.type, created_by: j.attendees[0] });
    for (const a of j.attendees) ds.attendees.push({ juntada_id: j.id, member_id: a });
    const net = new Map<string, number>();
    const add = (m: string, v: number) => net.set(m, (net.get(m) ?? 0) + v);
    for (const g of j.gastos) {
      ds.gastos.push({ id: g.id, juntada_id: j.id, category_id: g.cat, base_amount_cents: g.amount, fx_rate: 1, paid_by: g.paidBy, created_by: g.paidBy });
      add(g.paidBy, g.amount);
      for (const p of g.parts) {
        const each = g.amount / g.parts.length;
        ds.shares.push({ expense_id: g.id, member_id: p, amount_cents: each, is_participant: true });
        add(p, -each);
      }
    }
    for (const s of j.settlements ?? []) {
      ds.settlements.push({ juntada_id: j.id, amount_cents: s.amount });
      add(s.from, s.amount);
      add(s.to, -s.amount);
    }
    for (const [m, v] of net) if (v !== 0) ds.nets.push({ juntada_id: j.id, member_id: m, net_cents: v });
  }
  return ds;
}

const ds = build(
  { id: "asado", date: "2026-01-10", type: "t-casa", attendees: ["ana", "bea", "caro", "dani"],
    gastos: [{ id: "g-asado", cat: "c-comida", amount: 10000000, paidBy: "bea", parts: ["ana", "bea", "caro", "dani"] }],
    settlements: [{ from: "caro", to: "bea", amount: 2500000 }] },
  { id: "boliche", date: "2026-01-24", type: "t-salida", attendees: ["ana", "caro", "dani"],
    gastos: [{ id: "g-boliche", cat: "c-bebidas", amount: 6000000, paidBy: "ana", parts: ["ana", "caro", "dani"] }] },
  // Dani pagó el after sin ir (no es asistente).
  { id: "after", date: "2026-03-02", type: "t-salida", attendees: ["caro", "ana"],
    gastos: [{ id: "g-after", cat: "c-bebidas", amount: 3000000, paidBy: "dani", parts: ["caro", "ana"] }] },
  // Juntada con dos gastos y dos pagadoras.
  { id: "tercer", date: "2026-03-15", type: "t-tt", attendees: ["caro", "bea"],
    gastos: [
      { id: "g-tt1", cat: "c-bebidas", amount: 3000000, paidBy: "caro", parts: ["caro", "bea"] },
      { id: "g-tt2", cat: "c-comida", amount: 1000000, paidBy: "bea", parts: ["caro", "bea"] },
    ],
    settlements: [{ from: "bea", to: "caro", amount: 1000000 }] },
);

describe("financialSummary", () => {
  it("total, cantidad de juntadas y promedios", () => {
    const s = financialSummary(ds);
    expect(s.totalCents).toBe(23000000);
    expect(s.count).toBe(4);
    expect(s.gastosCount).toBe(5);
    expect(s.avgPerExpenseCents).toBe(5750000);
    expect(s.monthsInPeriod).toBe(3);
  });
  it("22. adelantado para otras ≠ total; pendiente sale de los saldos netos", () => {
    const s = financialSummary(ds);
    // asado 75.000 + boliche 40.000 + after 30.000 + tercer (15.000 + 5.000)
    expect(s.advancedForOthersCents).toBe(7500000 + 4000000 + 3000000 + 1500000 + 500000);
    // pendiente: asado (ana 25.000 + dani 25.000) + boliche (caro 20.000 + dani 20.000) + after (caro 15.000 + ana 15.000)
    expect(s.pendingCents).toBe(2500000 * 2 + 2000000 * 2 + 1500000 * 2);
    expect(s.settledCents).toBe(2500000 + 1000000);
  });
});

describe("filtros", () => {
  it("17/21. por fecha", () => {
    expect(filterDataset(ds, { from: "2026-03-01", to: "2026-03-31" }).juntadas.map((j) => j.id)).toEqual(["after", "tercer"]);
  });
  it("21. por tipo de juntada", () => {
    expect(filterDataset(ds, { typeId: "t-salida" }).juntadas).toHaveLength(2);
  });
  it("21. por integrante: juntadas a las que asistió (pagar sin ir no cuenta)", () => {
    expect(filterDataset(ds, { memberId: "dani" }).juntadas.map((j) => j.id)).toEqual(["asado", "boliche"]);
  });
});

describe("memberStats y rankings", () => {
  const stats = memberStats(ds);
  const by = (id: string) => stats.find((s) => s.memberId === id)!;

  it("19. asistencia: una por juntada, aunque tenga varios gastos", () => {
    const dup = { ...ds, attendees: [...ds.attendees, ds.attendees[0]] };
    expect(memberStats(dup).find((s) => s.memberId === "ana")!.participations).toBe(3);
    expect(by("caro").participations).toBe(4);
    expect(by("bea").participations).toBe(2); // asado + tercer (dos gastos, cuenta una vez)
    expect(by("dani").participationRate).toBe(0.5);
  });
  it("22. adelantado y consumo separados (varias pagadoras)", () => {
    expect(by("dani").advancedCents).toBe(3000000);
    expect(by("dani").consumedCents).toBe(2500000 + 2000000);
    expect(by("bea").advancedCents).toBe(10000000 + 1000000);
    expect(by("bea").timesPaid).toBe(2);
    expect(by("bea").consumedCents).toBe(2500000 + 1500000 + 500000);
  });
  it("deudas pendientes desde los saldos netos", () => {
    expect(by("ana").pendingCents).toBe(2500000 + 1500000);
    expect(by("bea").pendingCents).toBe(0);
  });
  it("rankings por tipo de juntada (fiestera, tercer tiempo) y sin ranking deportivo", () => {
    const r = Object.fromEntries(rankings(stats, 4).map((x) => [x.key, x]));
    expect(r.presente.winners).toEqual(["caro"]);
    expect(r.fiestera.winners.sort()).toEqual(["ana", "caro"]);
    expect(r.tercer_tiempo.winners.sort()).toEqual(["bea", "caro"]);
    expect(r.adelanto.winners).toEqual(["bea"]);
    expect(r.deportiva).toBeUndefined();
  });
  it("20/33. sin datos no hay ganadoras inventadas", () => {
    const empty = build();
    for (const r of rankings(memberStats(empty), 0)) expect(r.winners).toEqual([]);
    const s = socialSummary(empty, memberStats(empty));
    expect(s.mostPresent).toBeNull();
    expect(s.topCategory).toBeNull();
  });
  it("con pocas juntadas no se señala a la más ausente", () => {
    const two = filterDataset(ds, { to: "2026-01-31" });
    expect(rankings(memberStats(two), two.juntadas.length).find((r) => r.key === "ausente")!.winners).toEqual([]);
  });
});

describe("series y categorías", () => {
  it("serie mensual continua con meses vacíos en 0", () => {
    expect(monthlySeries(ds, "2026-01", "2026-04").map((m) => [m.key, m.count])).toEqual([
      ["2026-01", 2], ["2026-02", 0], ["2026-03", 2], ["2026-04", 0],
    ]);
  });
  it("gasto por categoría de gasto (suma gastos de distintas juntadas)", () => {
    expect(byCategory(ds).map((c) => [c.name, c.totalCents])).toEqual([["Comida", 11000000], ["Bebidas", 12000000]].sort((a, b) => (b[1] as number) - (a[1] as number)));
  });
  it("juntadas por tipo", () => {
    expect(byJuntadaType(ds).map((t) => [t.name, t.count])).toEqual([["Salida / boliche", 2], ["Juntada en casa", 1], ["Tercer tiempo", 1]]);
  });
  it("meses entre fechas", () => {
    expect(monthsBetween("2025-11-20", "2026-02-01")).toBe(4);
  });
  it("mes con más juntadas y tipo más frecuente", () => {
    const s = socialSummary(ds, memberStats(ds));
    expect(s.busiestMonth?.tied).toBe(true);
    expect(s.topCategory?.name).toBe("Salida / boliche");
  });
});

describe("personalSummary (vista Yo)", () => {
  it("separa mi consumo de lo que adelanté y calcula mis deudas", () => {
    const p = personalSummary(ds, "dani");
    expect(p.participations).toBe(2);
    expect(p.participationRate).toBe(0.5);
    expect(p.consumedCents).toBe(2500000 + 2000000);
    expect(p.avgPerJuntadaCents).toBe(2250000);
    expect(p.advancedCents).toBe(3000000);
    expect(p.advancedForOthersCents).toBe(3000000);
    expect(p.owedToMeCents).toBe(3000000);
    expect(p.iOweCents).toBe(2500000 + 2000000);
    expect(p.topJuntadas[0].id).toBe("asado");
  });
  it("sin participaciones: todo en cero, sin inventar", () => {
    const p = personalSummary(build(), "dani");
    expect(p.participations).toBe(0);
    expect(p.avgPerMonthCents).toBe(0);
    expect(p.topJuntadas).toEqual([]);
  });
});
