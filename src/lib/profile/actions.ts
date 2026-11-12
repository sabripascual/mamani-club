"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { flattenErrors } from "@/lib/auth/schemas";
import type { FormState } from "@/lib/auth/actions";

const schema = z.object({
  first_name: z.string().trim().min(1, "Requerido").max(60),
  last_name: z.string().trim().min(1, "Requerido").max(60),
  nickname: z.string().trim().max(40).transform((v) => v || null),
  birth_date: z.string().transform((v, ctx) => {
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < "1900-01-01" || v > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: "custom", message: "Revisá la fecha" });
    }
    return v;
  }),
});

export async function updateMyProfile(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    first_name: formData.get("first_name") ?? "",
    last_name: formData.get("last_name") ?? "",
    nickname: formData.get("nickname") ?? "",
    birth_date: formData.get("birth_date") ?? "",
  });
  if (!parsed.success) return { fields: flattenErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Volvé a ingresar." };

  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: "No pudimos guardar los cambios." };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Alias para transferir (hasta 5, uno principal). Las reglas las valida la base.
// ---------------------------------------------------------------------------
export type AliasResult = { ok: boolean; error?: string };

const ALIAS_RE = /^[a-z0-9.\-]{6,20}$/;

export async function addAlias(alias: string, label: string): Promise<AliasResult> {
  const a = alias.trim().toLowerCase();
  if (!ALIAS_RE.test(a)) return { ok: false, error: "El alias tiene que tener entre 6 y 20 caracteres: letras, números, punto o guion." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró" };
  const { count } = await supabase.from("member_aliases").select("id", { count: "exact", head: true }).eq("member_id", user.id);
  const { error } = await supabase.from("member_aliases").insert({
    member_id: user.id, alias: a, label: label.trim() || null, is_primary: (count ?? 0) === 0,
  });
  if (error) {
    if (error.message.includes("hasta 5")) return { ok: false, error: "Podés tener hasta 5 alias." };
    if (error.message.includes("duplicate")) return { ok: false, error: "Ya tenés ese alias." };
    return { ok: false, error: "No se pudo guardar el alias." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAlias(id: string): Promise<AliasResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró" };
  const { data: removed } = await supabase.from("member_aliases").delete().eq("id", id).eq("member_id", user.id).select("is_primary").maybeSingle();
  // Si era el principal, el primero que quede pasa a ser principal.
  if (removed?.is_primary) {
    const { data: next } = await supabase.from("member_aliases").select("id").eq("member_id", user.id).order("created_at").limit(1).maybeSingle();
    if (next) await supabase.rpc("set_primary_alias", { p_alias_id: next.id });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function makePrimaryAlias(id: string): Promise<AliasResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_primary_alias", { p_alias_id: id });
  if (error) return { ok: false, error: "No se pudo marcar como principal." };
  revalidatePath("/", "layout");
  return { ok: true };
}
