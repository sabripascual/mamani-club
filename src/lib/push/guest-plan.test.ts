import { describe, expect, it } from "vitest";
import { planGuestReminders, type GuestDebt } from "./guest-plan";

const debt: GuestDebt = {
  share_id: "s1", juntada_id: "j1", juntada_title: "Asado", guest_name: "Lu", responsible_id: "bea",
  creditor_name: "Ana", amount_cents: 3000000, currency: "ARS", created_on: "2026-11-10",
};
const money = (c: number) => `$${c / 100}`;
const plan = (today: string, d = debt, can = true) => planGuestReminders(today, [d], () => can, money);

describe("planGuestReminders", () => {
  it("el mismo día no avisa", () => expect(plan("2026-11-10")).toEqual([]));
  it("al día siguiente, a la responsable", () => {
    const [r] = plan("2026-11-11");
    expect(r.member_id).toBe("bea");
    expect(r.title).toContain("Lu");
    expect(r.body).toBe("Le debe $30000 a Ana por Asado. Cuando pague, marcalo en la juntada.");
  });
  it("después, cada 2 días", () => {
    expect(plan("2026-11-12")).toEqual([]);
    expect(plan("2026-11-13")).toHaveLength(1);
  });
  it("sin dispositivos o sin monto, no avisa", () => {
    expect(plan("2026-11-11", debt, false)).toEqual([]);
    expect(plan("2026-11-11", { ...debt, amount_cents: 0 })).toEqual([]);
  });
});
