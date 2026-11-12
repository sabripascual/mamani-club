/**
 * "Mantener la sesión iniciada".
 * Por defecto Supabase guarda la sesión 400 días. Si la persona destilda la opción
 * (por ejemplo, en un celular prestado), guardamos esta marca y las cookies de
 * sesión pasan a ser "de navegador": se borran al cerrarlo.
 */
export const REMEMBER_COOKIE = "mc_recordar";
const YEAR = 400 * 24 * 60 * 60;

export function cookieOptionsFor(rememberFlag: string | undefined) {
  return rememberFlag === "0" ? { maxAge: undefined } : { maxAge: YEAR };
}

export function rememberCookie(remember: boolean) {
  return {
    name: REMEMBER_COOKIE,
    value: remember ? "1" : "0",
    options: { path: "/", sameSite: "lax" as const, maxAge: remember ? YEAR : undefined },
  };
}
