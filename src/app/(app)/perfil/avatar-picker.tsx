"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { uploadMyAvatar } from "@/lib/images/avatar-upload";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/images/resize";

export function AvatarPicker({ src, initials }: { src: string | null; initials: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file?: File) {
    if (!file) return;
    setError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return setError("Usá JPG, PNG o WebP");
    setBusy(true);
    try {
      await uploadMyAvatar(file);
      router.refresh();
    } catch {
      setError("No se pudo subir la foto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={() => ref.current?.click()} className="relative" aria-label="Cambiar foto de perfil">
        <Avatar src={src} initials={initials} size="lg" />
        <span className="absolute right-0 bottom-0 inline-flex size-8 items-center justify-center rounded-full bg-graphite text-cream ring-2 ring-cream">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </span>
      </button>
      {error && <p className="text-xs text-rose-dark">{error}</p>}
      <input ref={ref} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
    </div>
  );
}
