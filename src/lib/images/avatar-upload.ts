import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "./resize";

/** Sube el avatar de la usuaria logueada a avatars/<id>/… y lo guarda en su perfil. */
export async function uploadMyAvatar(file: File) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sin sesión");

  const blob = await resizeImage(file, { maxSize: 512, square: true });
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: blob.type });
  if (error) throw error;

  const { data: old } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (updateError) throw updateError;
  if (old?.avatar_path) await supabase.storage.from("avatars").remove([old.avatar_path]);
  return path;
}
