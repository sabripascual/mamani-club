import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * URLs firmadas reutilizables.
 *
 * Supabase genera una URL distinta cada vez que se firma, así que el navegador no
 * podía cachear fotos ni avatares: cada pantalla las volvía a descargar. Acá
 * guardamos en memoria del servidor la URL firmada (válida 2 h) y la reutilizamos
 * hasta 90 min, así la misma foto tiene la misma URL y el celular la cachea.
 *
 * Seguridad: solo se firman rutas que la página ya obtuvo con consultas protegidas
 * por RLS (o sea, que la integrante puede ver). Las URLs vencen igual a las 2 h.
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
    const { data } = await createAdminClient().storage.from(bucket).createSignedUrls(missing, TTL_SECONDS);
    if (cache.size > MAX_ENTRIES) cache.clear();
    for (const d of data ?? []) {
      if (!d.path || !d.signedUrl) continue;
      out.set(d.path, d.signedUrl);
      cache.set(`${bucket}:${d.path}`, { url: d.signedUrl, until: now + REUSE_MS });
    }
  }
  return out;
}
