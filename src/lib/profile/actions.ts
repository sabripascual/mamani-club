"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { flattenErrors } from "@/lib/auth/schemas";
import type { FormState } from "@/lib/auth/actions";

const schema = z.object({
  first_name: z.string().trim().min(1, "Requerido").max(60),
  last_name: z.string().trim().min(1, "Requerido").max(60),
  nickname: z.string().trim().max(40).transform((v) => v || null),
});

export async function updateMyProfile(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    first_name: formData.get("first_name") ?? "",
    last_name: formData.get("last_name") ?? "",
    nickname: formData.get("nickname") ?? "",
  });
  if (!parsed.success) return { fields: flattenErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Volvé a ingresar." };

  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: "No pudimos guardar los cambios." };
  revalidatePath("/", "layout");
  return { ok: true };
}
