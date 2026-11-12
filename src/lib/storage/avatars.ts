import "server-only";
import { createClient } from "@/lib/supabase/server";

/** URLs firmadas (1 h) para avatares del bucket privado. Devuelve un mapa path → url. */
export async function signAvatarUrls(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("avatars").createSignedUrls(unique, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}
