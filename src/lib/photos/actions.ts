"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Result<T = undefined> = { ok: boolean; error?: string; data?: T };

export async function toggleLike(photoId: string): Promise<Result<boolean>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_like", { p_photo_id: photoId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as boolean };
}

export type CommentItem = { id: string; author_id: string; body: string; created_at: string };

export async function listComments(photoId: string): Promise<Result<{ comments: CommentItem[]; likers: string[] }>> {
  const supabase = await createClient();
  const [{ data, error }, { data: likes }] = await Promise.all([
    supabase.from("photo_comments").select("id, author_id, body, created_at").eq("photo_id", photoId).order("created_at"),
    supabase.from("photo_likes").select("member_id").eq("photo_id", photoId).order("created_at"),
  ]);
  if (error) return { ok: false, error: "No se pudieron cargar los comentarios" };
  return { ok: true, data: { comments: data ?? [], likers: (likes ?? []).map((l) => l.member_id as string) } };
}

export async function addComment(photoId: string, body: string): Promise<Result<CommentItem>> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Escribí algo" };
  if (text.length > 500) return { ok: false, error: "Máximo 500 caracteres" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró" };
  const { data, error } = await supabase
    .from("photo_comments")
    .insert({ photo_id: photoId, author_id: user.id, body: text })
    .select("id, author_id, body, created_at")
    .single();
  if (error) return { ok: false, error: "No se pudo publicar el comentario" };
  return { ok: true, data };
}

export async function deleteComment(commentId: string, reason?: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_comment", { p_comment_id: commentId, p_reason: reason || null });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Borra la foto (lógicamente, con auditoría) y después sus archivos en Storage. */
export async function deletePhoto(photoId: string, expenseId: string, reason?: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_photo", { p_photo_id: photoId, p_reason: reason || null });
  if (error) return { ok: false, error: error.message };
  const paths = ((data ?? []) as { storage_path: string; thumb_path: string }[]).flatMap((r) => [r.storage_path, r.thumb_path]);
  if (paths.length) await supabase.storage.from("photos").remove(paths);
  revalidatePath(`/recuerdos/${expenseId}`);
  revalidatePath(`/gastos/${expenseId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function refreshAlbum(expenseId: string) {
  revalidatePath(`/recuerdos/${expenseId}`);
  revalidatePath(`/gastos/${expenseId}`);
  revalidatePath("/");
  revalidatePath("/recuerdos");
}
