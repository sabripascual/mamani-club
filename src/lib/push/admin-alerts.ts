import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, sendToMember } from "./send";

/** Manda una notificación a todas las admins activas con dispositivos activados. */
export async function notifyAdmins(payload: { title: string; body: string; url: string; tag: string }) {
  if (!pushConfigured()) return;
  const admin = createAdminClient();
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("status", "active");
  const ids = (admins ?? []).map((a) => a.id as string);
  if (ids.length === 0) return;
  const { data: subs } = await admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", ids);
  await Promise.all(
    ids.map((id) => {
      const mine = (subs ?? []).filter((s) => s.member_id === id);
      if (mine.length === 0) return 0;
      return sendToMember(id, payload, mine);
    }),
  );
}

/** Alguien pidió acceso al club. */
export function notifyAdminsNewRequest(displayName: string) {
  return notifyAdmins({
    title: "Nueva solicitud de acceso",
    body: `${displayName} quiere sumarse al club. Tocá para aprobarla.`,
    url: "/admin/solicitudes",
    tag: "solicitudes",
  });
}

/** Alguien olvidó su contraseña y pide una temporal. */
export function notifyAdminsPasswordRequest(displayName: string) {
  return notifyAdmins({
    title: "Pedido de cambio de contraseña",
    body: `${displayName} olvidó su contraseña. Tocá para generarle una temporal.`,
    url: "/admin/solicitudes",
    tag: "contrasenas",
  });
}
