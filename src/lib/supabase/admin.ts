import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave secreta: saltea RLS. Usar SOLO en el servidor y solo para
 * operaciones administrativas puntuales (p. ej. contraseña temporal), siempre auditadas.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
