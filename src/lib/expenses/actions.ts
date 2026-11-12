"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseMoney } from "@/lib/money/format";
import { notifyAddedToJuntada } from "@/lib/push/expense-alerts";

export type FormState = { error?: string; fields?: Partial<Record<string, string>> };
export type ActionResult = { ok: boolean; error?: string };

const uuid = z.string().uuid();

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

const refresh = (juntadaId?: string | null) => {
  if (juntadaId) revalidatePath(`/gastos/${juntadaId}`);
  revalidatePath("/", "layout");
};

// ---------------------------------------------------------------------------
// Gasto (dentro de una juntada)
// ---------------------------------------------------------------------------
const gastoSchema = z.object({
  title: z.string().trim().min(1, "Contá qué se compró").max(80),
  category_id: uuid.or(z.literal("")).refine((v) => v !== "", "Elegí una categoría"),
  subcategory_id: z.string().optional().transform((v) => v || null),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  amount: z.string().transform((v, ctx) => {
    const cents = parseMoney(v);
    if (!cents) ctx.addIssue({ code: "custom", message: "Ingresá un importe válido (ej: 120.000 o 120000,50)" });
    return cents ?? 0;
  }),
  paid_by: uuid,
  split_type: z.enum(["equal", "custom"]),
  participants: z.array(uuid).min(1, "Elegí quiénes participaron de este gasto"),
  reason: z.string().trim().max(200).optional().transform((v) => v || null),
});

function readGasto(formData: FormData, prefix = "") {
  const g = (k: string) => formData.get(prefix + k);
  const participants = formData.getAll(prefix + "participants").map(String);
  const custom: Record<string, string> = {};
  for (const id of participants) custom[id] = String(g(`share_${id}`) ?? "");
  const parsed = gastoSchema.safeParse({
    title: g("title") ?? "", category_id: g("category_id") ?? "", subcategory_id: g("subcategory_id") ?? "",
    description: g("description") ?? "", amount: g("amount") ?? "", paid_by: g("paid_by") ?? "",
    split_type: g("split_type") ?? "equal", participants, reason: g("reason") ?? "",
  });
  return { parsed, custom };
}

function rpcGastoArgs(d: z.infer<typeof gastoSchema>, custom: Record<string, string>) {
  let customShares: { member_id: string; amount_cents: number }[] | null = null;
  if (d.split_type === "custom") {
    const shares = d.participants.map((id) => ({ member_id: id, amount_cents: custom[id]?.trim() === "0" ? 0 : parseMoney(custom[id] ?? "") }));
    if (shares.some((s) => s.amount_cents === null)) return { error: "Completá un importe válido para cada participante" };
    customShares = shares as { member_id: string; amount_cents: number }[];
    if (customShares.reduce((a, s) => a + s.amount_cents, 0) !== d.amount) return { error: "Las partes tienen que sumar exactamente el total" };
  }
  return {
    args: {
      p_title: d.title, p_category_id: d.category_id, p_amount_cents: d.amount, p_paid_by: d.paid_by,
      p_participants: d.split_type === "equal" ? d.participants : null, p_split_type: d.split_type, p_custom_shares: customShares,
      p_subcategory_id: d.subcategory_id, p_description: d.description, p_currency: "ARS",
    },
  };
}

export async function createGasto(juntadaId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { parsed, custom } = readGasto(formData);
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const r = rpcGastoArgs(parsed.data, custom);
  if (r.error) return { fields: { shares: r.error } };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("create_expense", { p_juntada_id: juntadaId, ...r.args });
  if (error) return { error: error.message };
  if (user) after(() => notifyAddedToJuntada(juntadaId, parsed.data.participants, user.id).catch(() => {}));
  refresh(juntadaId);
  redirect(`/gastos/${juntadaId}`);
}

export async function updateGasto(gastoId: string, juntadaId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { parsed, custom } = readGasto(formData);
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const r = rpcGastoArgs(parsed.data, custom);
  if (r.error) return { fields: { shares: r.error } };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: prev } = await supabase.from("expense_shares").select("member_id").eq("expense_id", gastoId);
  const before = new Set((prev ?? []).map((p) => p.member_id as string));
  const { error } = await supabase.rpc("update_expense", { p_expense_id: gastoId, ...r.args, p_reason: parsed.data.reason });
  if (error) return { error: error.message };
  const added = parsed.data.participants.filter((m) => !before.has(m));
  if (user && added.length) after(() => notifyAddedToJuntada(juntadaId, added, user.id).catch(() => {}));
  refresh(juntadaId);
  redirect(`/gastos/${juntadaId}`);
}

export async function voidGasto(gastoId: string, juntadaId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_expense", { p_expense_id: gastoId, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  refresh(juntadaId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Juntada
// ---------------------------------------------------------------------------
const juntadaSchema = z.object({
  title: z.string().trim().min(1, "Ponele un nombre a la juntada").max(80),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí la fecha de la juntada"),
  type_id: uuid.or(z.literal("")).refine((v) => v !== "", "Elegí el tipo de juntada"),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  attendees: z.array(uuid),
  reason: z.string().trim().max(200).optional().transform((v) => v || null),
});

function readJuntada(formData: FormData) {
  return juntadaSchema.safeParse({
    title: formData.get("j_title") ?? "", occurred_on: formData.get("j_occurred_on") ?? "", type_id: formData.get("j_type_id") ?? "",
    description: formData.get("j_description") ?? "", attendees: formData.getAll("j_attendees").map(String), reason: formData.get("j_reason") ?? "",
  });
}

/** Crea la juntada y, si se completó, su primer gasto. */
export async function createJuntada(_: FormState, formData: FormData): Promise<FormState> {
  const j = readJuntada(formData);
  if (!j.success) return { fields: fieldErrors(j.error) };
  const withGasto = String(formData.get("g_amount") ?? "").trim() !== "";
  let gasto: ReturnType<typeof readGasto> | null = null;
  if (withGasto) {
    gasto = readGasto(formData, "g_");
    if (!gasto.parsed.success) {
      const f = fieldErrors(gasto.parsed.error);
      return { fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [`g_${k}`, v])) };
    }
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: id, error } = await supabase.rpc("create_juntada", {
    p_title: j.data.title, p_occurred_on: j.data.occurred_on, p_type_id: j.data.type_id,
    p_attendees: j.data.attendees, p_description: j.data.description,
  });
  if (error) return { error: error.message };
  const juntadaId = id as string;

  if (gasto?.parsed.success) {
    const r = rpcGastoArgs(gasto.parsed.data, gasto.custom);
    if (r.error) return { fields: { g_shares: r.error } };
    const { error: gErr } = await supabase.rpc("create_expense", { p_juntada_id: juntadaId, ...r.args });
    // La juntada ya existe: si el gasto falla, se puede agregar desde la juntada.
    if (gErr) redirect(`/gastos/${juntadaId}?aviso=${encodeURIComponent("La juntada se creó, pero el gasto no: " + gErr.message)}`);
    const parts = gasto.parsed.data.participants;
    if (user) after(() => notifyAddedToJuntada(juntadaId, parts, user.id).catch(() => {}));
  }
  refresh(juntadaId);
  redirect(`/gastos/${juntadaId}`);
}

export async function updateJuntada(juntadaId: string, _: FormState, formData: FormData): Promise<FormState> {
  const j = readJuntada(formData);
  if (!j.success) return { fields: fieldErrors(j.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_juntada", {
    p_juntada_id: juntadaId, p_title: j.data.title, p_occurred_on: j.data.occurred_on, p_type_id: j.data.type_id,
    p_description: j.data.description, p_reason: j.data.reason,
  });
  if (error) return { error: error.message };
  refresh(juntadaId);
  redirect(`/gastos/${juntadaId}`);
}

export async function voidJuntada(juntadaId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_juntada", { p_juntada_id: juntadaId, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  refresh(juntadaId);
  return { ok: true };
}

export async function joinJuntada(juntadaId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_juntada", { p_juntada_id: juntadaId });
  if (error) return { ok: false, error: error.message };
  refresh(juntadaId);
  return { ok: true };
}

export async function leaveJuntada(juntadaId: string, memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_juntada", { p_juntada_id: juntadaId, p_member: memberId });
  if (error) return { ok: false, error: error.message };
  refresh(juntadaId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Transferencias
// ---------------------------------------------------------------------------
export async function settleTransfer(juntadaId: string, from: string, to: string, amountCents: number, alias?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_transfer", {
    p_juntada_id: juntadaId, p_from: from, p_to: to, p_amount_cents: amountCents, p_alias: alias ?? null,
  });
  if (error) return { ok: false, error: error.message };
  refresh(juntadaId);
  return { ok: true };
}

export async function voidSettlement(settlementId: string, juntadaId: string, reason?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_settlement", { p_settlement_id: settlementId, p_reason: reason || null });
  if (error) return { ok: false, error: error.message };
  refresh(juntadaId);
  return { ok: true };
}
