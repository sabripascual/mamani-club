import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, sendToMember } from "./send";

/** Avisa a las admins (con notificaciones activadas) que alguien pidió acceso. */
export async function notifyAdminsNewRequest(displayName: string) {
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
      return sendToMember(id, {
        title: "Nueva solicitud de acceso",
        body: `${displayName} quiere sumarse al club. Tocá para aprobarla.`,
        url: "/admin/solicitudes",
        tag: "solicitudes",
      }, mine);
    }),
  );
}
