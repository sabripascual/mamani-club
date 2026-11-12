import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_COLUMNS, type Profile } from "@/lib/auth/types";
import { signAvatarUrls } from "@/lib/storage/avatars";

export type MemberWithAvatar = Profile & { avatar_url: string | null };

export async function listMembers(statuses: Profile["status"][]): Promise<MemberWithAvatar[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .returns<Profile[]>();
  const rows = data ?? [];
  const urls = await signAvatarUrls(rows.map((r) => r.avatar_path));
  return rows.map((r) => ({ ...r, avatar_url: r.avatar_path ? (urls.get(r.avatar_path) ?? null) : null }));
}
