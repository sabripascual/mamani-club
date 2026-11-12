import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_COLUMNS, type Profile } from "./types";

/** Usuaria logueada + su perfil (una sola consulta por request gracias a cache()). */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single<Profile>();
  return profile ? { user, profile } : null;
});

/** Para páginas privadas: exige integrante activa. */
export async function requireActiveMember() {
  const session = await getSession();
  if (!session) redirect("/ingresar");
  if (session.profile.status !== "active") redirect("/pendiente");
  return session;
}

export async function requireAdmin() {
  const session = await requireActiveMember();
  if (session.profile.role !== "admin") redirect("/");
  return session;
}
