"use server";

import { createClient } from "@/lib/supabase/server";
import { sendToMember, pushConfigured } from "./send";

export type PushResult = { ok: boolean; error?: string };

type BrowserSub = { endpoint: string; keys?: { p256dh?: string; auth?: string } };

export async function saveSubscription(sub: BrowserSub, userAgent: string): Promise<PushResult> {
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false, error: "Suscripción inválida" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró" };
  // Si el navegador reusa el endpoint, lo reemplazamos (borrar + insertar respeta RLS).
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    member_id: user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent.slice(0, 300),
  });
  if (error) return { ok: false, error: "No se pudo activar en este dispositivo" };
  return { ok: true };
}

export async function removeSubscription(endpoint: string): Promise<PushResult> {
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

export async function sendTestNotification(): Promise<PushResult> {
  if (!pushConfigured()) return { ok: false, error: "Faltan configurar las claves de notificaciones en Vercel" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró" };
  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("member_id", user.id);
  if (!subs?.length) return { ok: false, error: "No hay dispositivos activados" };
  const delivered = await sendToMember(user.id, {
    title: "¡Notificaciones activadas!",
    body: "Así te van a llegar los recordatorios de MAMANÍ CLUB.",
    url: "/perfil",
    tag: "prueba",
  }, subs);
  return delivered > 0 ? { ok: true } : { ok: false, error: "No llegó a ningún dispositivo. Probá desactivar y volver a activar." };
}
