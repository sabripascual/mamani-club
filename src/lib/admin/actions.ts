"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/session";
import type { MemberRole, MemberStatus } from "@/lib/auth/types";

export type AdminResult = { ok: boolean; error?: string; password?: string };

function friendly(message: string) {
  if (message.includes("al menos una administradora")) return "Tiene que quedar al menos una admin activa.";
  if (message.includes("Solo una administradora")) return "No tenés permiso para hacer esto.";
  return "No se pudo completar la acción.";
}

// Todas estas acciones las valida también la base (las funciones admin_* chequean is_admin()).
export async function setMemberStatus(memberId: string, status: MemberStatus, reason?: string): Promise<AdminResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_member_status", {
    p_member: memberId,
    p_status: status,
    p_reason: reason || null,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setMemberRole(memberId: string, role: MemberRole, reason?: string): Promise<AdminResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_member_role", {
    p_member: memberId,
    p_role: role,
    p_reason: reason || null,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Contraseña fácil de dictar por WhatsApp: palabra-palabra-número. */
function temporaryPassword() {
  const words = ["fernet", "asado", "picada", "brindis", "tercer", "tiempo", "after", "malbec", "mate", "previa", "torta", "vermut"];
  const pick = () => words[randomInt(words.length)];
  return `${pick()}-${pick()}-${randomInt(100, 1000)}`;
}

export async function resetMemberPassword(memberId: string): Promise<AdminResult> {
  const { profile } = await requireAdmin();
  if (memberId === profile.id) return { ok: false, error: "Para tu propia cuenta usá “Cambiar contraseña” en tu perfil." };

  const supabase = await createClient();
  // 1) Primero se marca y audita (la función verifica en la base que seas admin).
  const { error: markError } = await supabase.rpc("admin_mark_temporary_password", {
    p_member: memberId,
    p_reason: "Contraseña olvidada",
  });
  if (markError) return { ok: false, error: friendly(markError.message) };

  // 2) Después se cambia la contraseña con la clave secreta (solo en el servidor).
  const password = temporaryPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(memberId, { password });
  if (error) return { ok: false, error: "No se pudo generar la contraseña temporal." };

  revalidatePath("/admin", "layout");
  return { ok: true, password };
}

/** Aprueba un pedido de contraseña: lo marca resuelto (auditado) y genera la temporal. */
export async function approvePasswordRequest(requestId: string): Promise<AdminResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: memberId, error } = await supabase.rpc("admin_resolve_password_request", { p_request_id: requestId, p_status: "approved" });
  if (error) return { ok: false, error: error.message.includes("resuelta") ? "Otra admin ya resolvió este pedido." : friendly(error.message) };
  const res = await resetMemberPassword(memberId as string);
  if (!res.ok) return { ok: false, error: `${res.error} Podés generarla desde Integrantes.` };
  return res;
}

export async function rejectPasswordRequest(requestId: string): Promise<AdminResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_password_request", { p_request_id: requestId, p_status: "rejected" });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/admin", "layout");
  return { ok: true };
}
