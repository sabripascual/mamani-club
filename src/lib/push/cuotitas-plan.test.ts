import { describe, expect, it } from "vitest";
import { planCuotitaReminders, remindsOn, type DueInstallment } from "./cuotitas-plan";

const base: DueInstallment = {
  cuotita_id: "q1", title: "Pasajes", debtor_id: "bea", creditor_id: "ana", creditor_name: "Ana", debtor_name: "Bea",
  number: 2, installments: 6, due_month: "2026-12-01", amount_cents: 1250000,
};
const money = (c: number) => `$${c / 100}`;
const plan = (today: string, due = [base], can = () => true) => planCuotitaReminders(today, due, can, money);

describe("remindsOn", () => {
  it("del 1 al 5 y después cada 3 días", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 11, 14].map(remindsOn)).toEqual([true, true, true, true, true, false, false, true, true, true]);
  });
});

describe("planCuotitaReminders", () => {
  it("el 1: a la deudora y a quien cobra", () => {
    const p = plan("2026-12-01");
    const debtor = p.find((x) => x.kind === "cuotita")!;
    expect(debtor).toMatchObject({ member_id: "bea", ref_id: "q1", title: "¡Llegó la cuotita, perrita! 💳", url: "/cuotitas/q1" });
    expect(debtor.body).toBe("Cuota 2 de 6 de Pasajes: $12500 para Ana.");
    expect(p.find((x) => x.kind === "cuotita_cobro")!.member_id).toBe("ana");
  });
  it("el 3: solo a la deudora", () => {
    expect(plan("2026-12-03").map((x) => x.kind)).toEqual(["cuotita"]);
  });
  it("el 6 y el 7 no avisa; el 8 sí (a las dos)", () => {
    expect(plan("2026-12-06")).toEqual([]);
    expect(plan("2026-12-07")).toEqual([]);
    expect(plan("2026-12-08").map((x) => x.kind).sort()).toEqual(["cuotita", "cuotita_cobro"]);
  });
  it("las cuotas de meses futuros no se recuerdan", () => {
    expect(plan("2026-11-01", [{ ...base, due_month: "2026-12-01" }])).toEqual([]);
  });
  it("atrasadas: se suman y avisa que está atrasada", () => {
    const p = plan("2027-01-08", [base, { ...base, number: 3, due_month: "2027-01-01" }]);
    const d = p.find((x) => x.kind === "cuotita")!;
    expect(d.title).toBe("Cuotita atrasada 🐀");
    expect(d.body).toBe("Tenés 2 cuotas de Pasajes sin pagar: $25000 para Ana.");
  });
  it("sin dispositivos no avisa", () => expect(plan("2026-12-01", [base], () => false)).toEqual([]));
});
