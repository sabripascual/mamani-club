import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MemberAlias = { id: string; member_id: string; alias: string; label: string | null; is_primary: boolean };

/** Alias de una o varias integrantes, el principal primero. */
export async function getAliases(memberIds: string[]) {
  if (memberIds.length === 0) return new Map<string, MemberAlias[]>();
  const supabase = await createClient();
  const { data } = await supabase
    .from("member_aliases")
    .select("id, member_id, alias, label, is_primary")
    .in("member_id", memberIds)
    .order("is_primary", { ascending: false })
    .order("created_at")
    .returns<MemberAlias[]>();
  const out = new Map<string, MemberAlias[]>();
  for (const a of data ?? []) out.set(a.member_id, [...(out.get(a.member_id) ?? []), a]);
  return out;
}

/** "Día y mes · edad" a partir de la fecha de nacimiento. */
export function birthdayLabel(birth: string | null, today: string) {
  if (!birth) return null;
  const [y, m, d] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age--;
  const day = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(Date.UTC(2000, m - 1, d)));
  return { day, age };
}
