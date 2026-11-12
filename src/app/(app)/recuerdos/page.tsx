import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Heart, Images } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getAlbums } from "@/lib/photos/queries";
import { formatDay, formatMonth } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Recuerdos · MAMANÍ CLUB" };

export default async function MemoriesPage() {
  await requireActiveMember();
  const albums = await getAlbums();
  // Agrupados por mes de la juntada, para recorrerlos en orden cronológico inverso.
  const byMonth = new Map<string, typeof albums>();
  for (const a of [...albums].sort((x, y) => y.occurred_on.localeCompare(x.occurred_on))) {
    const k = a.occurred_on.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), a]);
  }
  return (
    <>
      <PageHeader eyebrow="Recuerdos" title="Así la pasamos" />
      {albums.length === 0 ? (
        <EmptyState icon={Camera} title="Todavía no hay fotos">Entrá a una juntada y subí las primeras.</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {[...byMonth].map(([k, list]) => (
            <section key={k}>
              <h2 className="mb-3 font-display text-xl">{formatMonth(k)}</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {list.map((a) => (
                  <li key={a.expense_id}>
                    <Link href={`/recuerdos/${a.expense_id}`} className="group relative block aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] bg-blush">
                      {a.cover_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.cover_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-graphite/80 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3 text-cream">
                        <p className="truncate font-semibold">{a.title}</p>
                        <p className="text-xs text-cream/75">{formatDay(a.occurred_on)}</p>
                        <p className="mt-1 flex gap-3 text-xs font-semibold">
                          <span className="inline-flex items-center gap-1"><Images className="size-3.5" />{a.photo_count}</span>
                          <span className="inline-flex items-center gap-1"><Heart className="size-3.5" />{a.likes}</span>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
