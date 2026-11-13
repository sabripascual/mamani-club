import { describe, expect, it } from "vitest";
import { planNotifications, type LogEntry, type PendingDebt } from "./plan";

const money = (c: number) => `$${c / 100}`;
const all = () => true;
const debt = (over: Partial<PendingDebt> = {}): PendingDebt => ({
  expense_id: "asado", title: "Asado", created_on: "2026-11-01", debtor_id: "caro", creditor_id: "bea",
  outstanding_cents: 2500000, currency: "ARS", ...over,
});
const logDays = (kind: LogEntry["kind"], member: string, expense: string | null, days: string[]) =>
  days.map((d) => ({ kind, member_id: member, expense_id: expense, sent_on: d }));

describe("deudoras", () => {
  it("no arranca el mismo día en que se cargó la juntada", () => {
    expect(planNotifications("2026-11-01", [debt()], [], all, money)).toEqual([]);
  });
  it("día siguiente: mensaje 1 con el nombre de la juntada", () => {
    const [n] = planNotifications("2026-11-02", [debt()], [], all, money).filter((p) => p.kind === "debtor");
    expect(n.title).toBe("Perrita deudora!");
    expect(n.body).toContain("Asado");
    expect(n.url).toBe("/gastos/asado#saldar");
  });
  it("avanza la secuencia y el 5 se repite hasta saldar", () => {
    const titles = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const log = logDays("debtor", "caro", "asado", Array.from({ length: i }, (_, k) => `2026-11-0${k + 2}`));
      return planNotifications(`2026-11-${String(i + 2).padStart(2, "0")}`, [debt()], log, all, money).find((p) => p.kind === "debtor")!.title;
    });
    expect(titles).toEqual([
      "Perrita deudora!", "Rata inmunda, animal rastrero…", "URA SECA PAGAAAAA!", "DEJÁ DE MOSTRAR LA HILACHA!",
      "SI TODAVÍA NO TENÉS VERGÜENZA", "SI TODAVÍA NO TENÉS VERGÜENZA", "SI TODAVÍA NO TENÉS VERGÜENZA",
    ]);
  });
  it("una notificación por cada juntada en la que debe", () => {
    const plan = planNotifications("2026-11-05", [debt(), debt({ expense_id: "boliche", title: "Boliche" })], [], all, money);
    expect(plan.filter((p) => p.kind === "debtor" && p.member_id === "caro").map((p) => p.expense_id)).toEqual(["asado", "boliche"]);
  });
  it("se corta al pagar (la deuda ya no está pendiente)", () => {
    expect(planNotifications("2026-11-05", [debt({ outstanding_cents: 0 })], [], all, money)).toEqual([]);
  });
  it("no repite el mismo día", () => {
    const log = logDays("debtor", "caro", "asado", ["2026-11-05"]);
    expect(planNotifications("2026-11-05", [debt()], log, all, money).filter((p) => p.kind === "debtor")).toEqual([]);
  });
  it("sin dispositivo no se planifica (y la secuencia no avanza)", () => {
    expect(planNotifications("2026-11-05", [debt()], [], (m) => m !== "caro", money).filter((p) => p.kind === "debtor")).toEqual([]);
  });
});

describe("quien adelantó", () => {
  const two = [debt(), debt({ debtor_id: "dani" }), debt({ expense_id: "boliche", title: "Boliche", created_on: "2026-11-03", debtor_id: "ana" })];
  it("una sola, resumida: juntada más vieja + cuántas más y total", () => {
    const c = planNotifications("2026-11-04", two, [], all, money).filter((p) => p.kind === "creditor");
    expect(c).toHaveLength(1);
    expect(c[0].title).toBe("Viejitaaa! Todavía te deben");
    expect(c[0].body).toContain("Asado y 1 juntada más");
    expect(c[0].body).toContain("$75000");
  });
  it("cada 2 días", () => {
    const log = logDays("creditor", "bea", null, ["2026-11-04"]);
    expect(planNotifications("2026-11-05", two, log, all, money).some((p) => p.kind === "creditor")).toBe(false);
    expect(planNotifications("2026-11-06", two, log, all, money).find((p) => p.kind === "creditor")!.title).toBe("APURÁ ESAS RATONAS!");
  });
  it("el 3 se repite hasta saldar", () => {
    const log = logDays("creditor", "bea", null, ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-08"]);
    expect(planNotifications("2026-11-10", two, log, all, money).find((p) => p.kind === "creditor")!.title).toBe("NOSOTRAS TE AVISAMOS!");
  });
  it("si quedó todo saldado y aparece una deuda nueva, la secuencia vuelve a empezar", () => {
    const log = logDays("creditor", "bea", null, ["2026-10-01", "2026-10-03", "2026-10-05"]);
    const fresh = [debt({ created_on: "2026-11-01" })];
    expect(planNotifications("2026-11-02", fresh, log, all, money).find((p) => p.kind === "creditor")!.step).toBe(1);
  });
});
