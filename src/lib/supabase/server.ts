import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";
import { REMEMBER_COOKIE, cookieOptionsFor } from "./remember";

/** Cliente para Server Components, Server Actions y Route Handlers (sesión de la usuaria). */
/** `remember` permite forzar la opción en el mismo request en que se elige (al ingresar). */
export async function createClient(opts: { remember?: boolean } = {}) {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookieOptions: cookieOptionsFor(opts.remember === undefined ? cookieStore.get(REMEMBER_COOKIE)?.value : opts.remember ? "1" : "0"),
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
