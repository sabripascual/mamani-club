"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authErrorMessage } from "./errors";
import { flattenErrors, newPasswordSchema, signInSchema, signUpSchema, type FieldErrors } from "./schemas";

export type FormState = { ok?: boolean; error?: string; fields?: FieldErrors; values?: Record<string, string> };

function values(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const raw = values(formData, ["first_name", "last_name", "nickname", "username", "email", "password"]);
  const keep = { ...raw, password: "" };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { fields: flattenErrors(parsed.error), values: keep };

  const supabase = await createClient();
  const { data: available } = await supabase.rpc("username_available", { candidate: parsed.data.username });
  if (available === false) return { fields: { username: "Ese username ya está en uso" }, values: keep };

  const { email, password, ...meta } = parsed.data;
  const { error } = await supabase.auth.signUp({ email, password, options: { data: meta } });
  if (error) return { error: authErrorMessage(error.message), values: keep };

  // La sesión ya quedó abierta (sin confirmación de email). El cliente sube el avatar y navega.
  return { ok: true };
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const raw = values(formData, ["identifier", "password"]);
  const keep = { identifier: raw.identifier };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { fields: flattenErrors(parsed.error), values: keep };

  let email = parsed.data.identifier.toLowerCase();
  if (!email.includes("@")) {
    // Username → email, del lado del servidor (la función solo la puede ejecutar service_role).
    const { data } = await createAdminClient().rpc("email_for_login", { identifier: email });
    if (!data) return { error: "Usuario o contraseña incorrectos.", values: keep };
    email = data as string;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) return { error: authErrorMessage(error.message), values: keep };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/ingresar");
}

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(values(formData, ["password", "confirm"]));
  if (!parsed.success) return { fields: flattenErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.message.toLowerCase().includes("different from the old"))
      return { fields: { password: "Tiene que ser distinta a la anterior" } };
    return { error: authErrorMessage(error.message) };
  }
  await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
  return { ok: true };
}
