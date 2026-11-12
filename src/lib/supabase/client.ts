import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";
import { REMEMBER_COOKIE, cookieOptionsFor } from "./remember";

/** Cliente para componentes de navegador. Usa solo la clave pública. */
export function createClient() {
  const { url, key } = supabaseEnv();
  const flag = typeof document === "undefined" ? undefined : document.cookie.match(new RegExp(`(?:^|; )${REMEMBER_COOKIE}=([^;]*)`))?.[1];
  return createBrowserClient(url, key, { cookieOptions: cookieOptionsFor(flag) });
}
