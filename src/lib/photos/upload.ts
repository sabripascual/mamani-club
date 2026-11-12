import { createClient } from "@/lib/supabase/client";
import { resizeImageWithSize } from "@/lib/images/resize";

export const MAX_PHOTO_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Sube fotos a una juntada:
 *  1. achica en el celular (grande ~1600 px y miniatura ~480 px) para cuidar el
 *     espacio gratuito (~300 KB + ~30 KB por foto);
 *  2. sube ambos archivos a photos/<juntada>/<usuaria>/;
 *  3. registra la foto en la base (add_photo valida carpeta y archivos).
 * Si algo falla a mitad de camino, borra lo que haya subido de esa foto.
 */
export async function uploadPhotos(
  expenseId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; failed: { name: string; reason: string }[] }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sin sesión");

  let ok = 0;
  const failed: { name: string; reason: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length);
    if (file.size > MAX_PHOTO_INPUT_BYTES) {
      failed.push({ name: file.name, reason: "es demasiado grande (máx. 25 MB)" });
      continue;
    }
    let full, thumb;
    try {
      full = await resizeImageWithSize(file, { maxSize: 1600, quality: 0.82 });
      thumb = await resizeImageWithSize(full.blob, { maxSize: 480, quality: 0.75 });
    } catch {
      failed.push({ name: file.name, reason: "no se pudo leer (probá con JPG o PNG)" });
      continue;
    }
    const id = crypto.randomUUID();
    const ext = full.blob.type === "image/webp" ? "webp" : "jpg";
    const base = `${expenseId}/${user.id}/${id}`;
    const fullPath = `${base}.${ext}`;
    const thumbPath = `${base}-thumb.${ext}`;
    const bucket = supabase.storage.from("photos");

    const up1 = await bucket.upload(fullPath, full.blob, { contentType: full.blob.type, cacheControl: "31536000" });
    const up2 = up1.error ? up1 : await bucket.upload(thumbPath, thumb.blob, { contentType: thumb.blob.type, cacheControl: "31536000" });
    const reg = up2.error
      ? { error: up2.error }
      : await supabase.rpc("add_photo", {
          p_juntada_id: expenseId,
          p_storage_path: fullPath,
          p_thumb_path: thumbPath,
          p_width: full.width,
          p_height: full.height,
          p_size_bytes: full.blob.size,
          p_thumb_size_bytes: thumb.blob.size,
          p_mime_type: full.blob.type,
        });
    if (reg.error) {
      await bucket.remove([fullPath, thumbPath]);
      failed.push({ name: file.name, reason: "no se pudo subir" });
    } else {
      ok++;
    }
  }
  onProgress?.(files.length, files.length);
  return { ok, failed };
}
