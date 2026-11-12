import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, ReceiptText } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getAlbum } from "@/lib/photos/queries";
import { getMembers } from "@/lib/expenses/queries";
import { createClient } from "@/lib/supabase/server";
import { toMiniMembers } from "@/lib/photos/members";
import { formatDayLong } from "@/lib/dates";
import { EmptyState } from "@/components/ui/empty-state";
import { Gallery } from "@/components/photos/gallery";
import { PhotoUploader } from "@/components/photos/photo-uploader";

export const metadata: Metadata = { title: "Álbum · MAMANÍ CLUB" };

export default async function AlbumPage({ params, searchParams }: { params: Promise<{ expenseId: string }>; searchParams: Promise<{ foto?: string }> }) {
  const { expenseId } = await params;
  const { foto } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(expenseId)) notFound();
  const { profile } = await requireActiveMember();
  const supabase = await createClient();
  const { data: expense } = await supabase.from("expenses").select("id, title, occurred_on, status").eq("id", expenseId).maybeSingle();
  if (!expense || expense.status !== "active") notFound();
  const [{ photos, total }, { members }] = await Promise.all([getAlbum(expenseId, profile.id), getMembers()]);
  const likes = photos.reduce((a, p) => a + p.likes, 0);
  const contributors = new Set(photos.map((p) => p.uploaded_by)).size;

  return (
    <>
      <Link href="/recuerdos" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite">
        <ArrowLeft className="size-4" /> Recuerdos
      </Link>
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-dark">Álbum</p>
        <h1 className="mt-1 font-display text-[2rem] leading-tight font-semibold">{expense.title}</h1>
        <p className="mt-1 text-sm text-graphite/60 first-letter:uppercase">{formatDayLong(expense.occurred_on)}</p>
        {total > 0 && (
          <p className="mt-2 text-sm text-graphite/60">
            {total} {total === 1 ? "foto" : "fotos"} · {likes} likes · {contributors} {contributors === 1 ? "aportó" : "aportaron"}
          </p>
        )}
      </header>
      <div className="mb-5 flex flex-wrap items-start gap-2">
        <PhotoUploader expenseId={expenseId} />
        <Link href={`/gastos/${expenseId}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-white/70 px-5 text-sm font-semibold ring-1 ring-graphite/10">
          <ReceiptText className="size-4" /> Ver la cuenta
        </Link>
      </div>
      {photos.length === 0 ? (
        <EmptyState icon={Camera} title="Este álbum está vacío">Subí las primeras fotos de la juntada.</EmptyState>
      ) : (
        <Gallery photos={photos} members={toMiniMembers(members)} meId={profile.id} isAdmin={profile.role === "admin"} expenseId={expenseId} columns={4} initialPhotoId={foto} />
      )}
    </>
  );
}
