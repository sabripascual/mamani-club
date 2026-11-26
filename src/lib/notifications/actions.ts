"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Marca como leídas todas mis notificaciones (al abrir la campanita). */
export async function markNotificationsRead() {
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read");
  revalidatePath("/");
}
