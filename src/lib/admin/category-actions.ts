"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";

export type CatResult = { ok: boolean; error?: string };

function friendly(msg: string) {
  if (msg.includes("duplicate key")) return "Ya existe una con ese nombre.";
  if (msg.includes("check constraint")) return "El nombre tiene que tener entre 1 y 40 caracteres.";
  return "No se pudo guardar.";
}

// Las policies de la tabla solo permiten escribir a admins; esto además corta antes.
export async function addCategory(parentId: string | null, name: string, kind: "gasto" | "juntada" = "gasto", icon?: string): Promise<CatResult> {
  await requireAdmin();
  const supabase = await createClient();
  const base = supabase.from("categories").select("sort_order").eq("kind", kind);
  const scoped = parentId ? base.eq("parent_id", parentId) : base.is("parent_id", null);
  const { data: last } = await scoped.order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("categories").insert({
    parent_id: parentId, kind, name: name.trim(), icon: parentId ? null : (icon ?? (kind === "juntada" ? "sparkles" : null)), sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function renameCategory(id: string, name: string): Promise<CatResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").update({ name: name.trim() }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Archivar oculta la categoría para juntadas nuevas; las existentes la conservan. */
export async function setCategoryArchived(id: string, archived: boolean): Promise<CatResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").update({ archived }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Borra una categoría/subcategoría que nunca se usó (si se usó, la base pide archivarla). */
export async function deleteCategory(id: string): Promise<CatResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_category", { p_category_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
