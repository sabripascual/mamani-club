import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Solicitudes pendientes: de acceso y de contraseña (RLS: solo una admin las ve). */
export const pendingRequestsCount = cache(async () => {
  const supabase = await createClient();
  const [{ count: access }, { count: passwords }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("password_reset_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return (access ?? 0) + (passwords ?? 0);
});
