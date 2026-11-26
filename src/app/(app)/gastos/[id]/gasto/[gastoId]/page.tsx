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
import { GuestPaidButton } from "../../actions-client";

export const metadata: Metadata = { title: "Gasto · MAMANÍ CLUB" };

/** Detalle de un gasto en solo lectura (todas). Editar: quien lo cargó, la responsable de una invitada o una admin. */
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
  const guestResponsible = shares.some((s) => s.guest_name && s.member_id === me);
  // Editar: quien lo cargó, quien lo pagó (aunque lo haya cargado otra), la responsable de una invitada o una admin.
  const canEdit = g.status === "active" && juntada?.status === "active" && (profile.role === "admin" || g.created_by === me || g.paid_by === me || guestResponsible);
  const cat = catById.get(g.category_id);
  const sub = g.subcategory_id ? catById.get(g.subcategory_id) : undefined;
  const parts = shares.filter((s) => s.is_participant).sort((a, b) => b.amount_cents - a.amount_cents);
  // Mi saldo en TODA la juntada: las deudas se calculan con todos los gastos juntos.
  const { data: allTransfers } = await supabase.rpc("juntada_transfers", { p_juntada: id });
  const transfers = ((allTransfers ?? []) as { from_member: string; to_member: string; amount_cents: number }[]).map((t) => ({ ...t, amount_cents: Number(t.amount_cents) }));
  const iOwe = transfers.filter((t) => t.from_member === me).reduce((a, t) => a + t.amount_cents, 0);
  const owedToMe = transfers.filter((t) => t.to_member === me).reduce((a, t) => a + t.amount_cents, 0);
  const isAdmin = profile.role === "admin";

  return (
    <>
      <Link href={`/gastos/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite">
        <ArrowLeft className="size-4" /> {juntada?.title ?? "Juntada"}
      </Link>

      <header className="mb-6 flex items-start gap-4">
        <CategoryIcon icon={cat?.icon ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-dark">{cat?.name}{sub ? ` › ${sub.name}` : ""}</p>
          <h1 className="mt-1 font-display text-[1.9rem] leading-tight font-semibold">{g.title}</h1>
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

      {juntada?.status === "active" && (
        <Link href={`/gastos/${id}#saldar`}
          className={`mb-6 flex items-center gap-3 rounded-[var(--radius-card)] p-4 ring-1 transition hover:brightness-95 ${iOwe ? "bg-rose/15 ring-rose/30" : owedToMe ? "bg-lime/50 ring-lime" : "bg-white/70 ring-graphite/10"}`}>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-semibold">
              {iOwe ? `En toda la juntada debés ${formatMoney(iOwe, g.currency)}` : owedToMe ? `En toda la juntada te deben ${formatMoney(owedToMe, g.currency)}` : "En esta juntada estás a mano 🤑"}
            </span>
            <span className="block text-xs text-graphite/60">Las deudas se calculan sumando todos los gastos de la juntada: lo que puso cada una menos lo que le toca.</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-rose-dark">Cómo saldamos ›</span>
        </Link>
      )}

      <h2 className="mb-1 font-display text-xl">Le toca a cada una</h2>
      <p className="mb-3 text-xs text-graphite/55">Lo que consumió cada una de este gasto. {g.paid_by === me ? "Lo pagaste vos" : `Lo pagó ${memberName(memberById.get(g.paid_by))}`}.</p>
      <ul className="mb-8 flex flex-col gap-2">
        {parts.map((s) => (
          <li key={`${s.member_id}|${s.guest_name ?? ""}`} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 ${s.member_id === me ? "bg-white ring-1 ring-rose/40" : "bg-white/60"}`}>
            {s.guest_name ? (
              <span className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-lime text-xs font-bold">{s.guest_name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-semibold">{s.guest_name}{!s.guest_paid_at && <span className="ml-1.5" role="img" aria-label="debe" title="Debe">🐀</span>}</span>
                  <span className="block truncate text-xs text-graphite/55">{s.member_id === me ? "tu invitada" : `invitada de ${memberName(memberById.get(s.member_id))}`} · le paga a {memberName(memberById.get(g.paid_by), me)}</span>
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-3"><MemberAvatar m={memberById.get(s.member_id)} />
                <span className="font-semibold">{memberName(memberById.get(s.member_id), me)}</span>
              </span>
            )}
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-semibold tabular-nums">{formatMoney(s.amount_cents, g.currency)}</span>
              {s.guest_name && s.guest_paid_at && <span className="text-lg leading-none" role="img" aria-label="pagó" title="Pagó">🤑</span>}
              {s.guest_name && g.status === "active" && juntada?.status === "active" && (isAdmin || s.member_id === me) && (
                <GuestPaidButton shareId={s.id} juntadaId={id} paid={!!s.guest_paid_at} />
              )}
            </span>
          </li>
        ))}
      </ul>
      {parts.some((p) => p.guest_name) && <p className="-mt-6 mb-8 text-xs text-graphite/50">Cada invitada le paga su parte directo a quien pagó el gasto (🐀 debe · 🤑 pagó).</p>}
      <p className="text-xs text-graphite/50">
        Cargado por {memberName(memberById.get(g.created_by), me)} el {formatTimestamp(g.created_at)}
        {g.updated_at !== g.created_at && ` · editado ${formatTimestamp(g.updated_at)}`}
      </p>

    </>
  );
}
