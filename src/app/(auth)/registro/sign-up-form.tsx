"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { signUp, type FormState } from "@/lib/auth/actions";
import { uploadMyAvatar } from "@/lib/images/avatar-upload";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/images/resize";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function SignUpForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cuando la cuenta se creó, subimos el avatar (si eligió uno) y vamos a "pendiente".
  useEffect(() => {
    if (!state.ok) return;
    setFinishing(true);
    (async () => {
      if (avatar) {
        try {
          await uploadMyAvatar(avatar);
        } catch {
          // La cuenta ya existe: el avatar se puede cargar después desde el perfil.
        }
      }
      router.replace("/pendiente");
      router.refresh();
    })();
  }, [state.ok, avatar, router]);

  function onPick(file: File | undefined) {
    setAvatarError(null);
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return setAvatarError("Usá una foto JPG, PNG o WebP.");
    if (file.size > 15 * 1024 * 1024) return setAvatarError("La foto es demasiado grande (máx. 15 MB).");
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  }

  const v = state.values ?? {};
  const f = state.fields ?? {};
  const busy = pending || finishing;

  return (
    <form action={action} className="mt-8 flex flex-col gap-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative inline-flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush ring-2 ring-white transition hover:ring-rose"
          aria-label="Elegir foto de perfil"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <Camera className="size-7 text-rose-dark" strokeWidth={1.6} />
          )}
        </button>
        <div className="text-sm">
          <p className="font-semibold">Foto de perfil</p>
          <p className="text-graphite/55">Opcional. La podés cambiar después.</p>
          {avatarError && <p className="mt-1 text-rose-dark">{avatarError}</p>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" name="first_name" autoComplete="given-name" defaultValue={v.first_name} error={f.first_name} />
        <Field label="Apellido" name="last_name" autoComplete="family-name" defaultValue={v.last_name} error={f.last_name} />
      </div>
      <Field label="Apodo" name="nickname" placeholder="Cómo te dicen en el grupo" defaultValue={v.nickname} error={f.nickname} hint="Opcional" />
      <Field
        label="Username"
        name="username"
        autoCapitalize="none"
        autoComplete="username"
        placeholder="ej: sofi.m"
        defaultValue={v.username}
        error={f.username}
        hint="Lo podés usar para ingresar. Minúsculas, números, punto o guion bajo."
      />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={v.email} error={f.email} />
      <Field label="Contraseña" name="password" type="password" autoComplete="new-password" error={f.password} hint="Mínimo 8 caracteres" />

      <Button type="submit" disabled={busy} className="mt-2">
        {busy ? "Creando tu cuenta…" : "Pedir acceso"}
      </Button>
      <p className="text-center text-sm text-graphite/65">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-semibold text-rose-dark underline-offset-4 hover:underline">
          Ingresá
        </Link>
      </p>
    </form>
  );
}
