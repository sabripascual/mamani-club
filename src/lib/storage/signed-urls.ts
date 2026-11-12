import "server-only";
import { createClient } from "@/lib/supabase/server";

/*
 * URLs firmadas reutilizables.
 *
 * Supabase genera una URL distinta cada vez que se firma, así que el navegador no
 * podía cachear fotos ni avatares. Acá guardamos en memoria del servidor la URL
 * firmada (válida 2 h) y la reutilizamos hasta 90 min: la misma foto tiene la misma
 * URL y el celular la cachea.
 *
 * Se firma con la SESIÓN de quien mira (respeta las reglas de Storage). Una URL
 * firmada por una integrante puede reutilizarse para otra porque las reglas de
 * lectura son las mismas para todas las integrantes activas.
 */
const TTL_SECONDS = 2 * 60 * 60;
const REUSE_MS = 90 * 60 * 1000;
const MAX_ENTRIES = 5000;

type Entry = { url: string; until: number };
const cache = new Map<string, Entry>();

export async function signUrls(bucket: "photos" | "avatars", paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const now = Date.now();
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const p of unique) {
    const hit = cache.get(`${bucket}:${p}`);
    if (hit && hit.until > now) out.set(p, hit.url);
    else missing.push(p);
  }
  if (missing.length) {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, TTL_SECONDS);
    if (error) console.error(`[storage] no se pudieron firmar URLs de ${bucket}:`, error.message);
    if (cache.size > MAX_ENTRIES) cache.clear();
    for (const d of data ?? []) {
      if (d.error) console.error(`[storage] ${bucket}/${d.path}: ${d.error}`);
      if (!d.path || !d.signedUrl) continue;
      out.set(d.path, d.signedUrl);
      cache.set(`${bucket}:${d.path}`, { url: d.signedUrl, until: now + REUSE_MS });
    }
  }
  return out;
}
