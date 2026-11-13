import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, sendToMember } from "./send";

type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };

/**
 * "📸 Nuevo recuerdo": a todo el grupo (menos a quien subió) cuando alguien carga fotos
 * de una juntada. Cuenta las fotos que subió en los últimos minutos (no confía en el
 * número que manda el teléfono). Abre el álbum de la juntada.
 */
export async function notifyNewPhotos(juntadaId: string, uploaderId: string) {
  if (!pushConfigured()) return;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const [{ count }, { data: j }, { data: who }, { data: people }] = await Promise.all([
    admin.from("photos").select("id", { count: "exact", head: true })
      .eq("juntada_id", juntadaId).eq("uploaded_by", uploaderId).is("deleted_at", null).gte("created_at", since),
    admin.from("juntadas").select("title").eq("id", juntadaId).maybeSingle(),
    admin.from("profiles").select("first_name, nickname").eq("id", uploaderId).maybeSingle(),
    admin.from("profiles").select("id").eq("status", "active").neq("id", uploaderId),
  ]);
  if (!count || !j) return;
  const ids = (people ?? []).map((p) => p.id as string);
  if (ids.length === 0) return;
  const { data: subs } = await admin.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", ids);
  const byMember = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byMember.set(s.member_id, [...(byMember.get(s.member_id) ?? []), s]);
  const name = who ? who.nickname || who.first_name : "Alguien";
  const body = count === 1 ? `${name} cargó un recuerdo de ${j.title}` : `${name} cargó ${count} recuerdos de ${j.title}`;
  await Promise.all([...byMember].map(([memberId, mine]) =>
    sendToMember(memberId, { title: "📸 ¡Nuevo recuerdo!", body, url: `/recuerdos/${juntadaId}`, tag: `fotos-${juntadaId}-${uploaderId}` }, mine)));
}
