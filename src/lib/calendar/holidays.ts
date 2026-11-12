import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Feriados de Argentina desde ArgentinaDatos (API pública y gratuita):
 * GET https://api.argentinadatos.com/v1/feriados/{año} → [{ fecha, tipo, nombre }]
 * Se cargan una vez por año en la tabla `holidays`. Si la API falla, el
 * calendario funciona igual, solo sin feriados.
 */
const loaded = new Set<number>();

export async function ensureHolidays(year: number) {
  if (loaded.has(year)) return;
  const admin = createAdminClient();
  const { count } = await admin.from("holidays").select("day", { count: "exact", head: true })
    .gte("day", `${year}-01-01`).lte("day", `${year}-12-31`);
  if ((count ?? 0) > 0) { loaded.add(year); return; }
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const rows = (await res.json()) as { fecha: string; tipo?: string; nombre: string }[];
    const clean = rows
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) && r.nombre)
      .map((r) => ({ day: r.fecha, name: r.nombre.slice(0, 120), kind: r.tipo ?? null }));
    if (clean.length) {
      await admin.from("holidays").upsert(clean, { onConflict: "day,name", ignoreDuplicates: true });
      loaded.add(year);
    }
  } catch {
    // Sin feriados por ahora; se reintenta en el próximo request o en el cron.
  }
}
