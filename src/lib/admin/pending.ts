import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Cantidad de solicitudes de acceso pendientes (RLS: solo una admin ve las pendientes). */
export const pendingRequestsCount = cache(async () => {
  const supabase = await createClient();
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
});
