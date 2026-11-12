"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdminsPasswordRequest } from "@/lib/push/admin-alerts";

export type RecoverState = { sent?: boolean; error?: string };

/**
 * Pedido de contraseña nueva (sin sesión). Responde SIEMPRE lo mismo, exista o no
 * la cuenta, para no revelar quién está registrada.
 */
export async function requestPasswordReset(_: RecoverState, formData: FormData): Promise<RecoverState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) return { error: "Ingresá tu email o username" };
  if (identifier.length > 120) return { error: "Revisá lo que escribiste" };

  const admin = createAdminClient();
  const { data: memberId } = await admin.rpc("member_id_for_login", { identifier });
  if (memberId) {
    const { error } = await admin.from("password_reset_requests").insert({ member_id: memberId });
    // 23505 = ya tenía una pendiente: no se duplica ni se vuelve a avisar.
    if (!error) {
      const { data: p } = await admin.from("profiles").select("first_name, last_name, nickname").eq("id", memberId).single();
      const name = p ? p.nickname || `${p.first_name} ${p.last_name}` : "Una integrante";
      after(() => notifyAdminsPasswordRequest(name).catch(() => {}));
    }
  }
  return { sent: true };
}
