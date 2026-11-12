import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** Cliente para Server Components, Server Actions y Route Handlers (sesión de la usuaria). */
export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión.
        }
      },
    },
  });
}
