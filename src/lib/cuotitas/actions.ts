"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseMoney } from "@/lib/money/format";
import { notifyCuotitaCreated, notifyInstallmentsPaid } from "@/lib/push/cuotitas-alerts";
import type { FormState } from "@/lib/expenses/actions";
import type { CardBrand } from "./types";

export type Result = { ok: boolean; error?: string };

const uuid = z.string().uuid();
const schema = z.object({
  title: z.string().trim().min(1, "Contá qué compraste o prestaste").max(80),
  kind: z.enum(["tarjeta", "prestamo"]),
  amount: z.string().transform((v, ctx) => {
    const c = parseMoney(v);
    if (!c) ctx.addIssue({ code: "custom", message: "Ingresá un importe válido (ej: 120.000 o 120000,50)" });
    return c ?? 0;
  }),
  installments: z.coerce.number().int().min(1, "Al menos una cuota").max(48, "Hasta 48 cuotas"),
  first_month: z.string().regex(/^\d{4}-\d{2}$/, "Elegí el mes de la primera cuota"),
  paid_by: uuid,
  card_id: z.string().optional().transform((v) => v || null),
  split_type: z.enum(["equal", "custom"]),
  participants: z.array(uuid).min(1, "Elegí entre quiénes se divide"),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  refund_alias: z.string().optional().transform((v) => v || null),
  reason: z.string().trim().max(200).optional().transform((v) => v || null),
}).superRefine((d, ctx) => {
  if (d.kind === "tarjeta" && !d.card_id) ctx.addIssue({ code: "custom", path: ["card_id"], message: "Elegí con qué tarjeta pagó" });
});

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

function read(fd: FormData) {
  const participants = fd.getAll("participants").map(String);
  const parsed = schema.safeParse({
    title: fd.get("title") ?? "", kind: fd.get("kind") ?? "tarjeta", amount: fd.get("amount") ?? "", installments: fd.get("installments") ?? "",
    first_month: fd.get("first_month") ?? "", paid_by: fd.get("paid_by") ?? "", card_id: fd.get("card_id") ?? "",
    split_type: fd.get("split_type") ?? "equal", participants, description: fd.get("description") ?? "",
    refund_alias: fd.get("refund_alias") ?? "", reason: fd.get("reason") ?? "",
  });
  if (!parsed.success) return { error: { fields: fieldErrors(parsed.error) } as FormState };
  const d = parsed.data;
  let custom: { member_id: string; amount_cents: number }[] | null = null;
  if (d.split_type === "custom") {
    const shares = d.participants.map((id) => {
      const v = String(fd.get(`share_${id}`) ?? "");
      return { member_id: id, amount_cents: v.trim() === "0" ? 0 : parseMoney(v) };
    });
    if (shares.some((s) => s.amount_cents === null)) return { error: { fields: { shares: "Completá un importe válido para cada una" } } as FormState };
    custom = shares as { member_id: string; amount_cents: number }[];
    if (custom.reduce((a, s) => a + s.amount_cents, 0) !== d.amount) return { error: { fields: { shares: "Las partes tienen que sumar exactamente el total" } } as FormState };
  }
  return {
    args: {
      p_title: d.title, p_kind: d.kind, p_total_cents: d.amount, p_installments: d.installments, p_first_month: `${d.first_month}-01`,
      p_paid_by: d.paid_by, p_participants: d.split_type === "equal" ? d.participants : null, p_split_type: d.split_type,
      p_custom_shares: custom, p_card_id: d.kind === "tarjeta" ? d.card_id : null, p_description: d.description, p_refund_alias: d.refund_alias,
    },
    reason: d.reason,
  };
}

const dbError = (message: string): FormState =>
  message.includes("tarjeta") ? { fields: { card_id: message } } : message.includes("deba") ? { fields: { participants: message } } : { error: message };

export async function createCuotita(_: FormState, fd: FormData): Promise<FormState> {
  const r = read(fd);
  if ("error" in r && r.error) return r.error;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: id, error } = await supabase.rpc("create_cuotita", r.args!);
  if (error) return dbError(error.message);
  if (user) after(() => notifyCuotitaCreated(id as string, user.id).catch(() => {}));
  revalidatePath("/cuotitas");
  revalidatePath("/");
  redirect(`/cuotitas/${id}?nueva=1`);
}

export async function updateCuotita(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const r = read(fd);
  if ("error" in r && r.error) return r.error;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_cuotita", { p_id: id, ...r.args!, p_reason: r.reason });
  if (error) return dbError(error.message);
  revalidatePath("/cuotitas", "layout");
  redirect(`/cuotitas/${id}`);
}

export async function voidCuotita(id: string, reason: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_cuotita", { p_id: id, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cuotitas", "layout");
  return { ok: true };
}

/** Marcar (o desmarcar) cuotas pagadas. Avisa a la otra parte. */
export async function payInstallments(ids: string[], cuotitaId: string, paid: boolean): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("set_installments_paid", { p_ids: ids, p_paid: paid });
  if (error) return { ok: false, error: error.message };
  if (paid && user) after(() => notifyInstallmentsPaid(ids, user.id).catch(() => {}));
  revalidatePath(`/cuotitas/${cuotitaId}`);
  revalidatePath("/cuotitas");
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mis tarjetas (solo marca + nombre, sin números)
// ---------------------------------------------------------------------------
const BRANDS: CardBrand[] = ["visa", "mastercard", "amex", "naranja", "cabal", "otra"];

export async function addCard(brand: CardBrand, label: string): Promise<Result> {
  if (!BRANDS.includes(brand)) return { ok: false, error: "Elegí la marca" };
  const l = label.trim();
  if (/\d/.test(l)) return { ok: false, error: "Sin números: poné solo el banco o un nombre (ej: Galicia)" };
  if (l.length > 30) return { ok: false, error: "Hasta 30 letras" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró" };
  const { error } = await supabase.from("member_cards").insert({ member_id: user.id, brand, label: l || null });
  if (error) return { ok: false, error: error.message.includes("hasta 8") ? "Podés tener hasta 8 tarjetas" : "No se pudo guardar la tarjeta" };
  revalidatePath("/perfil", "layout");
  revalidatePath("/cuotitas/nueva");
  return { ok: true };
}

export async function removeCard(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró" };
  await supabase.from("member_cards").delete().eq("id", id).eq("member_id", user.id);
  revalidatePath("/perfil", "layout");
  return { ok: true };
}
