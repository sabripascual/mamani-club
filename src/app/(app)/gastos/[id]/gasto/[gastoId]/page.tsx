import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getGasto, getMembers } from "@/lib/expenses/queries";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money/format";
import { formatTimestamp } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";

export const metadata: Metadata = { title: "Gasto · MAMANÍ CLUB" };

/** Detalle de un gasto en solo lectura (todas). Editar: quien lo cargó o una admin. */
export default async function GastoPage({ params }: { params: Promise<{ id: string; gastoId: string }> }) {
  const { id, gastoId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(gastoId)) notFound();
  const { profile } = await requireActiveMember();
  const supabase = await createClient();
  const [data, { byId: catById }, { byId: memberById }, { data: juntada }] = await Promise.all([
    getGasto(gastoId), getCategories(true), getMembers(), supabase.from("juntadas").select("title, status").eq("id", id).maybeSingle(),
  ]);
  if (!data || data.gasto.juntada_id !== id) notFound();
  const { gasto: g, shares } = data;
  const me = profile.id;
  const canEdit = g.status === "active" && juntada?.status === "active" && (profile.role === "admin" || g.created_by === me);
  const cat = catById.get(g.category_id);
  const sub = g.subcategory_id ? catById.get(g.subcategory_id) : undefined;
  const parts = shares.filter((s) => s.is_participant).sort((a, b) => b.amount_cents - a.amount_cents);

  return (
    <>
      <Link href={`/gastos/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite">
        <ArrowLeft className="size-4" /> {juntada?.title ?? "Juntada"}
      </Link>

      <header className="mb-6 flex items-start gap-4">
        <CategoryIcon icon={cat?.icon ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-dark">{cat?.name}</p>
          <h1 className="mt-1 font-display text-[1.9rem] leading-tight font-semibold">{sub?.name ?? g.title}</h1>
          {g.status === "void" && <p className="mt-1 text-sm text-rose-dark">Gasto quitado{g.void_reason ? `: ${g.void_reason}` : ""}</p>}
        </div>
        {canEdit && (
          <Link href={`/gastos/${id}/gasto/${gastoId}/editar`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-graphite px-4 text-sm font-semibold text-cream">
            <Pencil className="size-4" /> Editar
          </Link>
        )}
      </header>

      <Card className="mb-6">
        <p className="text-sm text-graphite/60">Importe</p>
        <p className="font-display text-4xl font-semibold tabular-nums">{formatMoney(g.amount_cents, g.currency)}</p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-cream/80 p-3 text-sm">
          <MemberAvatar m={memberById.get(g.paid_by)} />
          <p><strong>{g.paid_by === me ? "Pagaste vos" : `Pagó ${memberName(memberById.get(g.paid_by))}`}</strong>
            <span className="block text-xs text-graphite/60">División {g.split_type === "equal" ? "igualitaria" : "personalizada"} entre {parts.length}</span>
          </p>
        </div>
        {g.description && <p className="mt-4 whitespace-pre-line text-sm text-graphite/75">{g.description}</p>}
      </Card>

      <h2 className="mb-3 font-display text-xl">Parte de cada una</h2>
      <ul className="mb-8 flex flex-col gap-2">
        {parts.map((s) => (
          <li key={s.member_id} className={`flex items-center justify-between gap-3 rounded-2xl p-3 ${s.member_id === me ? "bg-white ring-1 ring-rose/40" : "bg-white/60"}`}>
            <span className="flex items-center gap-3"><MemberAvatar m={memberById.get(s.member_id)} /><span className="font-semibold">{memberName(memberById.get(s.member_id), me)}</span></span>
            <span className="font-semibold tabular-nums">{formatMoney(s.amount_cents, g.currency)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-graphite/50">
        Cargado por {memberName(memberById.get(g.created_by), me)} el {formatTimestamp(g.created_at)}
        {g.updated_at !== g.created_at && ` · editado ${formatTimestamp(g.updated_at)}`}
      </p>
      <p className="mt-2 text-xs text-graphite/50">Las deudas se saldan desde la juntada, en “Cómo saldamos”.</p>
    </>
  );
}
