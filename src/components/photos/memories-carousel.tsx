import Link from "next/link";
import { Camera, Heart, MessageCircle, Images } from "lucide-react";
import { formatDay } from "@/lib/dates";
import type { AlbumSummary } from "@/lib/photos/queries";

/** "Manija Memories": álbumes reales, más recientes primero, con scroll horizontal. */
export function MemoriesCarousel({ albums }: { albums: AlbumSummary[] }) {
  return (
    <section aria-label="Manija Memories">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-2xl">Manija Memories</h2>
        {albums.length > 0 && <Link href="/recuerdos" className="text-sm font-semibold text-rose-dark">Ver todos</Link>}
      </div>
      {albums.length === 0 ? (
        <div className="flex items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-rose/40 p-5">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-blush"><Camera className="size-5 text-rose-dark" strokeWidth={1.6} /></span>
          <p className="text-sm text-graphite/65">Todavía no hay fotos. Entrá a una juntada y subí las primeras.</p>
        </div>
      ) : (
        <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-5 pb-2 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
          {albums.map((a, i) => (
            <li key={a.expense_id} className="shrink-0 snap-start">
              <Link
                href={`/recuerdos/${a.expense_id}`}
                className={`group relative block overflow-hidden rounded-[1.75rem] bg-blush ${i === 0 ? "h-72 w-60" : "h-72 w-48"}`}
              >
                {a.cover_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado
                  <img src={a.cover_url} alt="" loading={i < 2 ? "eager" : "lazy"} className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-graphite/85 via-graphite/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-cream">
                  <p className="font-display text-lg leading-tight font-semibold">{a.title}</p>
                  <p className="mt-0.5 text-xs text-cream/75">{formatDay(a.occurred_on)}</p>
                  <p className="mt-2 flex items-center gap-3 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1"><Images className="size-3.5" />{a.photo_count}</span>
                    <span className="inline-flex items-center gap-1"><Heart className="size-3.5" />{a.likes}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{a.comments}</span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
