"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { RESET_PHRASE } from "./reset-phrase";


export type ResetResult = { ok: boolean; error?: string; deleted?: Record<string, number>; files?: number };

/**
 * Tablas a vaciar, en orden (primero lo que depende de otras). Cada una con una columna
 * que nunca es nula: Supabase rechaza borrados sin condición (pg-safeupdate).
 */
const TABLES: [table: string, column: string, label: string][] = [
  ["cuotita_installments", "id", "cuotas"],
  ["cuotita_parts", "cuotita_id", "partes de cuotitas"],
  ["cuotitas", "id", "cuotitas"],
  ["photo_comments", "id", "comentarios"],
  ["photo_likes", "photo_id", "likes"],
  ["photos", "id", "fotos"],
  ["settlements", "id", "transferencias"],
  ["payments", "id", "pagos viejos"],
  ["expense_shares", "id", "partes de gastos"],
  ["expenses", "id", "gastos"],
  ["event_rsvps", "event_id", "respuestas a eventos"],
  ["events", "id", "eventos"],
  ["juntada_attendees", "juntada_id", "asistencias"],
  ["notification_log", "juntada_id", "avisos de juntadas"], // solo los que apuntan a una juntada
  ["juntadas", "id", "juntadas"],
];

/** Borra todos los archivos del bucket "photos" (las fotos de perfil están en "avatars"). */
async function emptyPhotosBucket(admin: ReturnType<typeof createAdminClient>) {
  const bucket = admin.storage.from("photos");
  const files: string[] = [];
  const walk = async (prefix: string, depth: number) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`No se pudieron listar las fotos: ${error.message}`);
      for (const item of data ?? []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) files.push(path); // archivo
        else if (depth < 4) await walk(path, depth + 1); // carpeta
      }
      if (!data || data.length < 1000) break;
    }
  };
  await walk("", 0);
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await bucket.remove(files.slice(i, i + 100));
    if (error) throw new Error(`No se pudieron borrar las fotos: ${error.message}`);
  }
  return files.length;
}

/**
 * Empieza las pruebas de cero: borra juntadas, gastos, eventos, fotos (y sus archivos),
 * cuotitas y la auditoría. Conserva usuarias, alias, tarjetas, dispositivos, categorías,
 * configuración y las frases y el historial de notificaciones que no son de juntadas.
 */
export async function resetTestData(confirmation: string): Promise<ResetResult> {
  await requireAdmin();
  if (confirmation.trim().toUpperCase() !== RESET_PHRASE) return { ok: false, error: `Escribí ${RESET_PHRASE} para confirmar` };
  const admin = createAdminClient();
  const deleted: Record<string, number> = {};
  try {
    for (const [table, column, label] of TABLES) {
      const { count, error } = await admin.from(table).delete({ count: "exact" }).not(column, "is", null);
      if (error) throw new Error(`No se pudo borrar ${label}: ${error.message}`);
      deleted[label] = count ?? 0;
    }
    const files = await emptyPhotosBucket(admin);
    // La auditoría al final: los borrados de arriba también dejan registros.
    const { error } = await admin.from("audit_log").delete().not("id", "is", null);
    if (error) throw new Error(`No se pudo vaciar la auditoría: ${error.message}`);
    await admin.from("notification_messages").update({ last_sent_at: null }).not("id", "is", null);
    revalidatePath("/", "layout");
    return { ok: true, deleted, files };
  } catch (e) {
    revalidatePath("/", "layout");
    return { ok: false, deleted, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
