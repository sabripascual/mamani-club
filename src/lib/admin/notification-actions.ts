"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { pushConfigured } from "@/lib/push/send";
import { sendBroadcast } from "@/lib/push/calendar-daily";

export type NResult = { ok: boolean; error?: string; sent?: number };
type Kind = "weekly" | "birthday" | "birthday_week" | "event_new";

export async function addMessage(kind: Kind, title: string, body: string): Promise<NResult> {
  const { profile } = await requireAdmin();
  if (!title.trim() || !body.trim()) return { ok: false, error: "Completá título y texto" };
  const supabase = await createClient();
  const { error } = await supabase.from("notification_messages").insert({ kind, title: title.trim().slice(0, 80), body: body.trim().slice(0, 200), created_by: profile.id });
  if (error) return { ok: false, error: "No se pudo guardar (título hasta 80 caracteres, texto hasta 200)." };
  revalidatePath("/admin/notificaciones");
  return { ok: true };
}

export async function toggleMessage(id: string, active: boolean): Promise<NResult> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("notification_messages").update({ active }).eq("id", id);
  revalidatePath("/admin/notificaciones");
  return { ok: true };
}

export async function deleteMessage(id: string): Promise<NResult> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("notification_messages").delete().eq("id", id);
  revalidatePath("/admin/notificaciones");
  return { ok: true };
}

/** Envío manual inmediato a todas o a algunas integrantes activas. */
export async function broadcast(title: string, body: string, recipients: string[] | "all", url: string): Promise<NResult> {
  await requireAdmin();
  if (!pushConfigured()) return { ok: false, error: "Faltan las claves de notificaciones en Vercel." };
  if (!title.trim() || !body.trim()) return { ok: false, error: "Completá título y texto" };
  const supabase = await createClient();
  const { data: active } = await supabase.from("profiles").select("id").eq("status", "active");
  const ids = (active ?? []).map((a) => a.id as string).filter((id) => recipients === "all" || recipients.includes(id));
  if (ids.length === 0) return { ok: false, error: "Elegí al menos una destinataria" };
  const safeUrl = url.startsWith("/") ? url : "/";
  const sent = await sendBroadcast(ids, title.trim().slice(0, 80), body.trim().slice(0, 200), safeUrl);
  revalidatePath("/admin/notificaciones");
  return { ok: true, sent };
}
