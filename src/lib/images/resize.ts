/**
 * Achica una imagen en el navegador antes de subirla (ahorra espacio del plan gratuito).
 * Devuelve WebP; si el navegador no lo soporta, JPEG.
 */
export async function resizeImage(
  file: File,
  opts: { maxSize: number; quality?: number; square?: boolean },
): Promise<Blob> {
  return (await resizeImageWithSize(file, opts)).blob;
}

/** Igual que resizeImage, pero también devuelve el tamaño final en píxeles. */
export async function resizeImageWithSize(
  file: File | Blob,
  { maxSize, quality = 0.85, square = false }: { maxSize: number; quality?: number; square?: boolean },
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  let sx = 0,
    sy = 0,
    sw = bitmap.width,
    sh = bitmap.height;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = sh = side;
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const size = { width: canvas.width, height: canvas.height };
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, ...size };
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("No se pudo procesar la imagen");
  return { blob: jpeg, ...size };
}

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
