import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PhotoItem = {
  id: string;
  expense_id: string;
  uploaded_by: string;
  created_at: string;
  width: number;
  height: number;
  thumb_url: string | null;
  full_url: string | null;
  likes: number;
  comments: number;
  liked_by_me: boolean;
};

const URL_TTL = 60 * 60; // 1 hora

async function signMany(paths: string[]) {
  if (paths.length === 0) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("photos").createSignedUrls(paths, URL_TTL);
  return new Map((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
}

type Row = { id: string; expense_id: string; uploaded_by: string; created_at: string; width: number; height: number; storage_path: string; thumb_path: string };

async function decorate(rows: Row[], me: string, opts: { full: boolean }): Promise<PhotoItem[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const ids = rows.map((r) => r.id);
  const [{ data: stats }, { data: mine }, urls] = await Promise.all([
    supabase.from("v_photo_stats").select("photo_id, likes, comments").in("photo_id", ids),
    supabase.from("photo_likes").select("photo_id").eq("member_id", me).in("photo_id", ids),
    signMany(rows.flatMap((r) => (opts.full ? [r.thumb_path, r.storage_path] : [r.thumb_path]))),
  ]);
  const st = new Map((stats ?? []).map((s) => [s.photo_id as string, s]));
  const liked = new Set((mine ?? []).map((l) => l.photo_id as string));
  return rows.map((r) => ({
    id: r.id,
    expense_id: r.expense_id,
    uploaded_by: r.uploaded_by,
    created_at: r.created_at,
    width: r.width,
    height: r.height,
    thumb_url: urls.get(r.thumb_path) ?? null,
    full_url: opts.full ? (urls.get(r.storage_path) ?? null) : null,
    likes: Number(st.get(r.id)?.likes ?? 0),
    comments: Number(st.get(r.id)?.comments ?? 0),
    liked_by_me: liked.has(r.id),
  }));
}

const COLS = "id, expense_id, uploaded_by, created_at, width, height, storage_path, thumb_path";

/** Fotos de una juntada (más recientes primero). */
export async function getAlbum(expenseId: string, me: string, opts: { full?: boolean; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase.from("photos").select(COLS, { count: "exact" }).eq("expense_id", expenseId).order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, count } = await q.returns<Row[]>();
  return { photos: await decorate(data ?? [], me, { full: opts.full ?? true }), total: count ?? 0 };
}

export type AlbumSummary = {
  expense_id: string;
  title: string;
  occurred_on: string;
  photo_count: number;
  likes: number;
  comments: number;
  cover_url: string | null;
  last_photo_at: string;
};

/**
 * Álbumes con fotos, ordenados por la foto más reciente (para el carrusel y la
 * página de recuerdos). La portada es la foto con más likes del álbum.
 */
export async function getAlbums(opts: { limit?: number } = {}): Promise<AlbumSummary[]> {
  const supabase = await createClient();
  const [{ data: photos }, { data: stats }] = await Promise.all([
    supabase.from("photos").select("id, expense_id, created_at, thumb_path").order("created_at", { ascending: false }).limit(2000),
    supabase.from("v_photo_stats").select("photo_id, expense_id, likes, comments").limit(2000),
  ]);
  const st = new Map((stats ?? []).map((s) => [s.photo_id as string, { likes: Number(s.likes), comments: Number(s.comments) }]));
  const groups = new Map<string, { last: string; count: number; likes: number; comments: number; cover: { path: string; likes: number } }>();
  for (const p of photos ?? []) {
    const s = st.get(p.id) ?? { likes: 0, comments: 0 };
    const g = groups.get(p.expense_id);
    if (!g) {
      groups.set(p.expense_id, { last: p.created_at, count: 1, likes: s.likes, comments: s.comments, cover: { path: p.thumb_path, likes: s.likes } });
    } else {
      g.count++;
      g.likes += s.likes;
      g.comments += s.comments;
      if (s.likes > g.cover.likes) g.cover = { path: p.thumb_path, likes: s.likes };
    }
  }
  const ordered = [...groups].sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, opts.limit ?? 1000);
  if (ordered.length === 0) return [];
  const [{ data: expenses }, urls] = await Promise.all([
    supabase.from("expenses").select("id, title, occurred_on").in("id", ordered.map(([id]) => id)).eq("status", "active"),
    signMany(ordered.map(([, g]) => g.cover.path)),
  ]);
  const byId = new Map((expenses ?? []).map((e) => [e.id as string, e]));
  return ordered
    .filter(([id]) => byId.has(id))
    .map(([id, g]) => ({
      expense_id: id,
      title: byId.get(id)!.title,
      occurred_on: byId.get(id)!.occurred_on,
      photo_count: g.count,
      likes: g.likes,
      comments: g.comments,
      cover_url: urls.get(g.cover.path) ?? null,
      last_photo_at: g.last,
    }));
}
