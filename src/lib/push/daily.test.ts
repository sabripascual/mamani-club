import { beforeEach, describe, expect, it, vi } from "vitest";

// Corrida diaria completa con la base y el envío simulados (sin red).
vi.mock("server-only", () => ({}));
const sent: { member: string; title: string; url: string }[] = [];
const inserted: Record<string, unknown>[] = [];
vi.mock("./send", () => ({
  sendToMember: vi.fn(async (member: string, p: { title: string; url: string }) => { sent.push({ member, title: p.title, url: p.url }); return 1; }),
}));

let tables: Record<string, unknown[]> = {};
function from(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  for (const k of ["select", "gte", "in", "eq", "is", "update", "delete"]) b[k] = chain;
  b.insert = (row: Record<string, unknown>) => {
    inserted.push(row);
    return { select: () => ({ single: async () => ({ data: { id: inserted.length }, error: null }) }) };
  };
  b.then = (res: (v: unknown) => void) => res({ data: tables[table] ?? [], error: null });
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

const { runDailyNotifications, describeByKind } = await import("./daily");

// Sabri pagó el asado de ayer; Ana y Bea le deben.
beforeEach(() => {
  sent.length = 0;
  inserted.length = 0;
  tables = {
    v_pending_transfers: [
      { juntada_id: "j1", currency: "ARS", from_member: "ana", to_member: "sabri", amount_cents: 3000000 },
      { juntada_id: "j1", currency: "ARS", from_member: "bea", to_member: "sabri", amount_cents: 3000000 },
    ],
    v_guest_debts: [],
    push_subscriptions: ["ana", "bea", "sabri"].map((m) => ({ id: "s-" + m, member_id: m, endpoint: "e", p256dh: "p", auth: "a" })),
    notification_log: [],
    juntadas: [{ id: "j1", title: "Asado", created_at: "2026-11-17T20:00:00Z" }],
    profiles: ["ana", "bea", "sabri"].map((id) => ({ id, first_name: id, nickname: null })),
  };
});

describe("corrida diaria de deudas", () => {
  it("al día siguiente avisa a las deudoras y a quien pagó (le deben)", async () => {
    const r = await runDailyNotifications("2026-11-18");
    expect(sent.filter((s) => s.title === "Perrita deudora!").map((s) => s.member).sort()).toEqual(["ana", "bea"]);
    const cobro = sent.find((s) => s.member === "sabri")!;
    expect(cobro.title).toBe("Viejitaaa! Todavía te deben");
    expect(inserted.find((i) => i.kind === "creditor")).toMatchObject({ member_id: "sabri", juntada_id: null, step: 1 });
    expect(describeByKind(r.byKind)).toBe("Deudas 2/2 · Cobros 1/1");
  });

  it("el mismo día de la carga todavía no avisa", async () => {
    const r = await runDailyNotifications("2026-11-17");
    expect(r.planned).toBe(0);
  });

  it("quien cobra, cada 2 días (las deudoras, todos los días)", async () => {
    tables.notification_log = [{ kind: "creditor", member_id: "sabri", juntada_id: null, sent_on: "2026-11-18" }];
    await runDailyNotifications("2026-11-19");
    expect(sent.some((s) => s.member === "sabri")).toBe(false);
    expect(sent.filter((s) => s.member !== "sabri")).toHaveLength(2);
  });

  it("sin dispositivo, a quien cobra no se le planifica", async () => {
    tables.push_subscriptions = tables.push_subscriptions.filter((s) => (s as { member_id: string }).member_id !== "sabri");
    const r = await runDailyNotifications("2026-11-18");
    expect(r.byKind.creditor).toBeUndefined();
  });
});
