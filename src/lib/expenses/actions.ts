"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyAddedToExpense } from "@/lib/push/expense-alerts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseMoney } from "@/lib/money/format";

export type ExpenseFormState = { error?: string; fields?: Partial<Record<string, string>> };

const uuid = z.string().uuid();

const baseSchema = z.object({
  title: z.string().trim().min(1, "Ponele un nombre a la juntada").max(80),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí la fecha de la juntada"),
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
  participants: z.array(uuid).min(1, "Elegí quiénes participaron"),
  reason: z.string().trim().max(200).optional().transform((v) => v || null),
});

function readForm(formData: FormData) {
  const participants = formData.getAll("participants").map(String);
  const custom: Record<string, string> = {};
  for (const id of participants) custom[id] = String(formData.get(`share_${id}`) ?? "");
  return {
    parsed: baseSchema.safeParse({
      title: formData.get("title") ?? "",
      occurred_on: formData.get("occurred_on") ?? "",
      category_id: formData.get("category_id") ?? "",
      subcategory_id: formData.get("subcategory_id") ?? "",
      description: formData.get("description") ?? "",
      amount: formData.get("amount") ?? "",
      paid_by: formData.get("paid_by") ?? "",
      split_type: formData.get("split_type") ?? "equal",
      participants,
      reason: formData.get("reason") ?? "",
    }),
    custom,
  };
}

function buildCustom(custom: Record<string, string>, participants: string[]) {
  const shares = participants.map((id) => ({ member_id: id, amount_cents: custom[id]?.trim() === "0" ? 0 : parseMoney(custom[id] ?? "") }));
  if (shares.some((s) => s.amount_cents === null)) return { error: "Completá un importe válido para cada participante" };
  return { shares: shares as { member_id: string; amount_cents: number }[] };
}

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

async function save(mode: "create" | "update", expenseId: string | null, formData: FormData): Promise<ExpenseFormState> {
  const { parsed, custom } = readForm(formData);
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const d = parsed.data;

  let customShares: { member_id: string; amount_cents: number }[] | null = null;
  if (d.split_type === "custom") {
    const c = buildCustom(custom, d.participants);
    if (c.error) return { fields: { shares: c.error } };
    customShares = c.shares!;
    const sum = customShares.reduce((a, s) => a + s.amount_cents, 0);
    if (sum !== d.amount) return { fields: { shares: "Las partes tienen que sumar exactamente el total" } };
  }

  const common = {
    p_title: d.title,
    p_occurred_on: d.occurred_on,
    p_category_id: d.category_id,
    p_amount_cents: d.amount,
    p_paid_by: d.paid_by,
    p_participants: d.split_type === "equal" ? d.participants : null,
    p_split_type: d.split_type,
    p_custom_shares: customShares,
    p_subcategory_id: d.subcategory_id,
    p_description: d.description,
    p_currency: "ARS",
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Para avisar solo a las participantes NUEVAS al editar.
  const before = new Set<string>();
  if (mode === "update" && expenseId) {
    const { data: prev } = await supabase.from("expense_shares").select("member_id").eq("expense_id", expenseId).eq("is_participant", true);
    for (const r of prev ?? []) before.add(r.member_id as string);
  }
  let id = expenseId;
  if (mode === "create") {
    const { data, error } = await supabase.rpc("create_expense", common);
    if (error) return { error: error.message };
    id = data as string;
  } else {
    const { error } = await supabase.rpc("update_expense", { ...common, p_expense_id: expenseId, p_reason: d.reason });
    if (error) return { error: error.message };
  }
  const participants = customShares ? customShares.map((c) => c.member_id) : d.participants;
  const added = participants.filter((m) => !before.has(m));
  if (id && user && added.length) after(() => notifyAddedToExpense(id!, added, user.id).catch(() => {}));

  revalidatePath("/", "layout");
  redirect(`/gastos/${id}`);
}

export async function createExpense(_: ExpenseFormState, formData: FormData) {
  return save("create", null, formData);
}

export async function updateExpense(expenseId: string, _: ExpenseFormState, formData: FormData) {
  return save("update", expenseId, formData);
}

export type ActionResult = { ok: boolean; error?: string };

export async function voidExpense(expenseId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_expense", { p_expense_id: expenseId, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markSharePaid(shareId: string, expenseId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_share_paid", { p_share_id: shareId });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/gastos/${expenseId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function voidPayment(paymentId: string, expenseId: string, reason?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", { p_payment_id: paymentId, p_reason: reason || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/gastos/${expenseId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}
