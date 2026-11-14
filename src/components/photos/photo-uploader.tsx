"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { photosUploaded, refreshAlbum } from "@/lib/photos/actions";
import { cn } from "@/lib/utils";

export function PhotoUploader({ expenseId, variant = "primary" }: { expenseId: string; variant?: "primary" | "subtle" }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onFiles(list: FileList | null) {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (ref.current) ref.current.value = "";
    if (files.length === 0) return;
    setMessage(null);
    setProgress({ done: 0, total: files.length });
    try {
      // El cliente de Supabase (~70 kB) se descarga recién al subir.
      const { uploadPhotos } = await import("@/lib/photos/upload");
      const res = await uploadPhotos(expenseId, files, (done, total) => setProgress({ done, total }));
      await refreshAlbum(expenseId);
      if (res.ok > 0) photosUploaded(expenseId).catch(() => {});
      router.refresh();
      if (res.failed.length) {
        setMessage({ tone: "error", text: `${res.ok} subidas. No se pudieron subir: ${res.failed.map((f) => `${f.name} (${f.reason})`).join(", ")}` });
      } else {
        setMessage({ tone: "ok", text: res.ok === 1 ? "¡Foto subida!" : `¡${res.ok} fotos subidas!` });
      }
    } catch {
      setMessage({ tone: "error", text: "No se pudieron subir las fotos. Revisá tu conexión." });
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-70",
          variant === "primary" ? "bg-graphite text-cream" : "bg-white/70 text-graphite ring-1 ring-graphite/10",
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        {busy ? `Subiendo ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…` : "Agregar fotos"}
      </button>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {message && <p className={cn("mt-2 text-sm", message.tone === "error" ? "text-rose-dark" : "text-graphite/70")}>{message.text}</p>}
    </div>
  );
}
