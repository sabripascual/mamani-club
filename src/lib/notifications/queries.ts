import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InboxItem = { id: number; title: string; body: string; url: string; created_at: string; read_at: string | null };
export type PendingEvent = { id: string; title: string; starts_at: string; all_day: boolean };

/** Eventos que vienen y todavía no respondí (sin contar los que creé yo). */
export async function pendingRsvps(me: string): Promise<PendingEvent[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const [{ data: events }, { data: mine }] = await Promise.all([
    supabase.from("events").select("id, title, starts_at, all_day, created_by").eq("status", "active").gte("starts_at", since).neq("created_by", me).order("starts_at").limit(30),
    supabase.from("event_rsvps").select("event_id").eq("member_id", me),
  ]);
  const answered = new Set((mine ?? []).map((r) => r.event_id as string));
  return (events ?? []).filter((e) => !answered.has(e.id as string))
    .map((e) => ({ id: e.id as string, title: e.title as string, starts_at: e.starts_at as string, all_day: !!e.all_day }));
}

/** Cuántas cosas nuevas hay para la campanita: avisos sin leer + eventos sin responder. */
export async function bellCount(me: string) {
  const supabase = await createClient();
  const [{ count }, pending] = await Promise.all([
    supabase.from("member_notifications").select("id", { count: "exact", head: true }).eq("member_id", me).is("read_at", null),
    pendingRsvps(me),
  ]);
  return (count ?? 0) + pending.length;
}

export async function listInbox(me: string, limit = 60): Promise<InboxItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("member_notifications").select("id, title, body, url, created_at, read_at")
    .eq("member_id", me).order("created_at", { ascending: false }).limit(limit).returns<InboxItem[]>();
  return data ?? [];
}
