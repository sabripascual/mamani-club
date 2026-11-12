import "server-only";
import * as webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = { title: string; body: string; url: string; tag: string };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  // "subject" identifica a quien envía ante los servicios de push (Apple/Google).
  const site = process.env.VAPID_SUBJECT
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://mamani-club.vercel.app");
  webpush.setVapidDetails(site, pub, priv);
  configured = true;
  return true;
}

export function pushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Manda una notificación a todos los dispositivos de una integrante. Limpia los
 * dispositivos que ya no existen (el navegador los dio de baja). Devuelve a
 * cuántos llegó.
 */
export async function sendToMember(memberId: string, payload: PushPayload, subs?: Sub[]) {
  if (!configure()) throw new Error("Faltan las claves VAPID");
  const admin = createAdminClient();
  const list = subs ?? ((await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("member_id", memberId)).data ?? []);
  let delivered = 0;
  await Promise.all(
    list.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: "normal", topic: payload.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "") },
        );
        delivered++;
        await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failed_count: 0 }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
        else await admin.from("push_subscriptions").update({ failed_count: 1 }).eq("id", s.id);
      }
    }),
  );
  return delivered;
}
