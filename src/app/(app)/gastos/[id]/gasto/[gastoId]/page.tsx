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
import { getAliases } from "@/lib/profile/aliases";
import { CopyAlias } from "@/components/copy-alias";
import { SettleButton } from "../../actions-client";

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
  const canEdit = g.status === "active" && juntada?.status === "active" && (profile.role === "admin" || g.created_by === me || guestResponsible);
  const cat = catById.get(g.category_id);
  const sub = g.subcategory_id ? catById.get(g.subcategory_id) : undefined;
  const parts = shares.filter((s) => s.is_participant).sort((a, b) => b.amount_cents - a.amount_cents);
  // Lo que YO debo en esta juntada (pago neto), con el alias de quien cobra.
  const { data: myTransfers } = await supabase.rpc("juntada_transfers", { p_juntada: id });
  const mine = ((myTransfers ?? []) as { from_member: string; to_member: string; amount_cents: number }[])
    .filter((t) => t.from_member === me && juntada?.status === "active")
    .map((t) => ({ ...t, amount_cents: Number(t.amount_cents) }));
  const aliasesBy = await getAliases(mine.map((t) => t.to_member));

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

      {mine.length > 0 && (
        <section className="mb-6 rounded-[var(--radius-card)] bg-rose/15 p-4 ring-1 ring-rose/30">
          <h2 className="mb-1 font-display text-lg font-semibold">Lo que tenés que transferir</h2>
          <p className="mb-3 text-xs text-graphite/60">Es tu saldo en toda la juntada (puede incluir otros gastos).</p>
          <ul className="flex flex-col gap-2">
            {mine.map((t) => {
              const al = aliasesBy.get(t.to_member)?.[0];
              return (
                <li key={t.to_member} className="flex items-center gap-3 rounded-2xl bg-white p-3">
                  <MemberAvatar m={memberById.get(t.to_member)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p>A <strong>{memberName(memberById.get(t.to_member))}</strong>: <strong className="tabular-nums">{formatMoney(t.amount_cents, g.currency)}</strong></p>
                    {al ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-graphite/65">alias <span className="truncate font-mono font-semibold text-graphite">{al.alias}</span><CopyAlias alias={al.alias} label /></p>
                    ) : <p className="mt-1 text-xs text-graphite/45">Todavía no cargó alias</p>}
                  </div>
                  <SettleButton juntadaId={id} from={me} to={t.to_member} amountCents={t.amount_cents} alias={al?.alias} meId={me} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h2 className="mb-3 font-display text-xl">Parte de cada una</h2>
      <ul className="mb-8 flex flex-col gap-2">
        {parts.map((s) => (
          <li key={`${s.member_id}|${s.guest_name ?? ""}`} className={`flex items-center justify-between gap-3 rounded-2xl p-3 ${s.member_id === me ? "bg-white ring-1 ring-rose/40" : "bg-white/60"}`}>
            {s.guest_name ? (
              <span className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-lime text-xs font-bold">{s.guest_name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-semibold">{s.guest_name}</span>
                  <span className="block truncate text-xs text-graphite/55">{s.member_id === me ? "tu invitada · la pagás vos" : `invitada de ${memberName(memberById.get(s.member_id))} · la paga ella`}</span>
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-3"><MemberAvatar m={memberById.get(s.member_id)} /><span className="font-semibold">{memberName(memberById.get(s.member_id), me)}</span></span>
            )}
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
