"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Heart, Loader2, MessageCircle, Send, Trash2, X } from "lucide-react";
import { addComment, deleteComment, deletePhoto, listComments, toggleLike, type CommentItem } from "@/lib/photos/actions";
import type { PhotoItem } from "@/lib/photos/queries";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

export type MiniMember = { name: string; initials: string; avatar_url: string | null };

const fmt = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Grilla de miniaturas + visor a pantalla completa con likes y comentarios. */
export function Gallery({
  photos: initial, members, meId, isAdmin, expenseId, columns = 3, initialPhotoId,
}: {
  photos: PhotoItem[]; members: Record<string, MiniMember>; meId: string; isAdmin: boolean; expenseId: string;
  columns?: 3 | 4; initialPhotoId?: string;
}) {
  const [photos, setPhotos] = useState(initial);
  const [open, setOpen] = useState<number | null>(() => {
    const i = initialPhotoId ? initial.findIndex((p) => p.id === initialPhotoId) : -1;
    return i >= 0 ? i : null;
  });
  useEffect(() => setPhotos(initial), [initial]);

  const update = useCallback((id: string, patch: Partial<PhotoItem>) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))), []);

  return (
    <>
      <ul className={cn("grid gap-1.5", columns === 3 ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-4")}>
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              onClick={() => setOpen(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-2xl bg-blush/50"
              aria-label={`Abrir foto de ${members[p.uploaded_by]?.name ?? "alguien"}`}
            >
              {p.thumb_url && (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado
                <img src={p.thumb_url} alt="" loading="lazy" decoding="async" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              )}
              {(p.likes > 0 || p.comments > 0) && (
                <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1.5 rounded-full bg-graphite/60 px-2 py-0.5 text-[11px] font-semibold text-cream backdrop-blur">
                  {p.likes > 0 && <><Heart className="size-3 fill-current" />{p.likes}</>}
                  {p.comments > 0 && <><MessageCircle className="size-3" />{p.comments}</>}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && photos[open] && (
        <Lightbox
          photos={photos}
          index={open}
          setIndex={setOpen}
          onClose={() => setOpen(null)}
          members={members}
          meId={meId}
          isAdmin={isAdmin}
          expenseId={expenseId}
          update={update}
          onDeleted={(id) => {
            setPhotos((ps) => ps.filter((p) => p.id !== id));
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

function Lightbox({
  photos, index, setIndex, onClose, members, meId, isAdmin, expenseId, update, onDeleted,
}: {
  photos: PhotoItem[]; index: number; setIndex: (i: number) => void; onClose: () => void; members: Record<string, MiniMember>;
  meId: string; isAdmin: boolean; expenseId: string; update: (id: string, patch: Partial<PhotoItem>) => void; onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const p = photos[index];
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [likers, setLikers] = useState<string[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const touch = useRef<number | null>(null);
  const prev = useCallback(() => index > 0 && setIndex(index - 1), [index, setIndex]);
  const next = useCallback(() => index < photos.length - 1 && setIndex(index + 1), [index, photos.length, setIndex]);

  // Teclado + bloquear el scroll de fondo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  // Cargar comentarios de la foto actual.
  useEffect(() => {
    let alive = true;
    setComments(null);
    setError(null);
    listComments(p.id).then((r) => {
      if (!alive) return;
      if (r.ok && r.data) {
        setComments(r.data.comments);
        setLikers(r.data.likers);
      } else setError(r.error ?? "Error");
    });
    return () => { alive = false; };
  }, [p.id]);

  function like() {
    const liked = !p.liked_by_me;
    update(p.id, { liked_by_me: liked, likes: p.likes + (liked ? 1 : -1) }); // optimista
    setLikers((l) => (liked ? [...l, meId] : l.filter((x) => x !== meId)));
    toggleLike(p.id).then((r) => {
      if (!r.ok || r.data !== liked) {
        update(p.id, { liked_by_me: !liked, likes: p.likes });
        setError(r.error ?? null);
      }
    });
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const r = await addComment(p.id, body);
      if (r.ok && r.data) {
        setComments((c) => [...(c ?? []), r.data!]);
        update(p.id, { comments: p.comments + 1 });
        setText("");
      } else setError(r.error ?? "Error");
    });
  }

  function removeComment(c: CommentItem) {
    const mod = c.author_id !== meId;
    const reason = mod ? window.prompt("Motivo de la moderación (queda en la auditoría)") : null;
    if (mod && !reason?.trim()) return;
    if (!mod && !window.confirm("¿Borrar tu comentario?")) return;
    start(async () => {
      const r = await deleteComment(c.id, reason ?? undefined);
      if (r.ok) {
        setComments((cs) => (cs ?? []).filter((x) => x.id !== c.id));
        update(p.id, { comments: Math.max(0, p.comments - 1) });
      } else setError(r.error ?? "Error");
    });
  }

  function removePhoto() {
    const mod = p.uploaded_by !== meId;
    const reason = mod ? window.prompt("Motivo de la moderación (queda en la auditoría)") : null;
    if (mod && !reason?.trim()) return;
    if (!mod && !window.confirm("¿Borrar esta foto? No se puede deshacer.")) return;
    start(async () => {
      const r = await deletePhoto(p.id, expenseId, reason ?? undefined);
      if (r.ok) {
        onDeleted(p.id);
        router.refresh();
      } else setError(r.error ?? "Error");
    });
  }

  const uploader = members[p.uploaded_by];
  const canDelete = p.uploaded_by === meId || isAdmin;

  return (
    <div role="dialog" aria-modal="true" aria-label="Foto" className="fixed inset-0 z-[60] flex flex-col bg-[#1d1a1f] text-cream lg:flex-row">
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
          touch.current = null;
        }}
      >
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          {uploader && <Avatar src={uploader.avatar_url} initials={uploader.initials} size="sm" className="ring-0" />}
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-semibold">{uploader?.name ?? "Alguien"}</p>
            <p className="text-xs text-cream/60">{fmt.format(new Date(p.created_at))} · {index + 1} de {photos.length}</p>
          </div>
          {canDelete && (
            <button onClick={removePhoto} disabled={pending} aria-label="Borrar foto" className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/10">
              <Trash2 className="size-5" />
            </button>
          )}
          <button onClick={onClose} aria-label="Cerrar" className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/10">
            <X className="size-6" />
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={p.id} src={p.full_url ?? p.thumb_url ?? ""} alt="" className="max-h-full max-w-full object-contain" style={{ aspectRatio: `${p.width} / ${p.height}` }} />

        {index > 0 && (
          <button onClick={prev} aria-label="Foto anterior" className="absolute left-3 hidden size-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 sm:inline-flex">
            <ChevronLeft className="size-6" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button onClick={next} aria-label="Foto siguiente" className="absolute right-3 hidden size-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 sm:inline-flex">
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {/* Barra de acciones (mobile) */}
      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <LikeButton liked={p.liked_by_me} count={p.likes} onClick={like} />
        <button onClick={() => setShowPanel(true)} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-white/10">
          <MessageCircle className="size-5" /> {p.comments > 0 ? p.comments : "Comentar"}
        </button>
      </div>

      {/* Panel de comentarios: hoja inferior en mobile, columna en desktop */}
      <aside
        className={cn(
          "flex flex-col bg-cream text-graphite",
          "fixed inset-x-0 bottom-0 z-20 max-h-[75dvh] rounded-t-3xl shadow-2xl transition-transform duration-300 lg:static lg:max-h-none lg:w-96 lg:translate-y-0 lg:rounded-none",
          showPanel ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-graphite/5 px-5 py-3">
          <div className="hidden lg:block"><LikeButton liked={p.liked_by_me} count={p.likes} onClick={like} dark /></div>
          <p className="font-display text-lg lg:hidden">Comentarios</p>
          <button onClick={() => setShowPanel(false)} aria-label="Cerrar comentarios" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-graphite/5 lg:hidden">
            <X className="size-5" />
          </button>
        </div>
        {likers.length > 0 && (
          <p className="px-5 pt-3 text-xs text-graphite/60">
            <Heart className="mr-1 inline size-3 fill-rose text-rose" />
            {likers.map((id) => (id === meId ? "Vos" : members[id]?.name ?? "—")).join(", ")}
          </p>
        )}
        <ul className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {comments === null && !error && <li className="flex justify-center"><Loader2 className="size-5 animate-spin text-graphite/40" /></li>}
          {comments?.length === 0 && <li className="text-center text-sm text-graphite/50">Todavía no hay comentarios. ¡Arrancá vos!</li>}
          {comments?.map((c) => {
            const a = members[c.author_id];
            return (
              <li key={c.id} className="flex gap-3">
                <Avatar src={a?.avatar_url} initials={a?.initials ?? "?"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><strong>{c.author_id === meId ? "Vos" : a?.name ?? "—"}</strong> <span className="break-words">{c.body}</span></p>
                  <p className="mt-0.5 text-xs text-graphite/50">
                    {fmt.format(new Date(c.created_at))}
                    {(c.author_id === meId || isAdmin) && (
                      <button onClick={() => removeComment(c)} className="ml-2 font-semibold hover:text-rose-dark">Borrar</button>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {error && <p className="px-5 pb-2 text-sm text-rose-dark">{error}</p>}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-2 border-t border-graphite/5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Escribí un comentario…"
            aria-label="Comentario"
            className="h-11 flex-1 rounded-full border border-graphite/10 bg-white px-4 text-base outline-none focus:border-rose focus:ring-4 focus:ring-rose/15"
          />
          <button disabled={pending || !text.trim()} aria-label="Publicar" className="inline-flex size-11 items-center justify-center rounded-full bg-graphite text-cream disabled:opacity-40">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </aside>
    </div>
  );
}

function LikeButton({ liked, count, onClick, dark }: { liked: boolean; count: number; onClick: () => void; dark?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={liked}
      aria-label={liked ? "Quitar like" : "Dar like"}
      className={cn("inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition active:scale-90", dark ? "hover:bg-graphite/5" : "hover:bg-white/10")}
    >
      <Heart className={cn("size-5 transition", liked && "fill-rose text-rose")} /> {count}
    </button>
  );
}
