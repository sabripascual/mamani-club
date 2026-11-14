import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, HandCoins, Pencil } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/expenses/queries";
import { getCuotita } from "@/lib/cuotitas/queries";
import { KIND_LABEL, monthLabel, monthOf } from "@/lib/cuotitas/types";
import { getAliases } from "@/lib/profile/aliases";
import { formatMoney } from "@/lib/money/format";
import { formatTimestamp, todayAR } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";
import { CopyAlias } from "@/components/copy-alias";
import { PayInstallmentsButton, UnpayInstallmentButton, VoidCuotitaButton } from "@/components/cuotitas/actions-client";

export const metadata: Metadata = { title: "Cuotita · MAMANÍ CLUB" };

export default async function CuotitaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const { id } = await params;
  const { nueva } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { byId: memberById }] = await Promise.all([getCuotita(id), getMembers()]);
  if (!data) notFound();
  const { cuotita: c, parts, installments } = data;
  const me = profile.id;
  const isAdmin = profile.role === "admin";
  const active = c.status === "active";
  const canEdit = active && (isAdmin || me === c.paid_by || me === c.created_by);
  const month = monthOf(todayAR());
  const alias = c.refund_alias ?? (await getAliases([c.paid_by])).get(c.paid_by)?.[0]?.alias ?? null;
  const paidCount = installments.filter((i) => i.paid_at).length;
  const pendingCents = installments.filter((i) => !i.paid_at).reduce((a, i) => a + i.amount_cents, 0);
  const debtors = [...new Set(installments.map((i) => i.member_id))];
  const Icon = c.kind === "tarjeta" ? CreditCard : HandCoins;

  return (
    <>
      <Link href="/cuotitas" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite">
        <ArrowLeft className="size-4" /> Las Cuotitas
      </Link>
      {nueva && <div className="mb-4"><Alert>¡Cuotita cargada! Les avisamos a las que deben. 💳</Alert></div>}
      {!active && <div className="mb-4"><Alert>Esta cuotita fue anulada{c.void_reason ? `: ${c.void_reason}` : ""}.</Alert></div>}

      <header className="mb-6 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime"><Icon className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-dark">{KIND_LABEL[c.kind]}</p>
          <h1 className="mt-1 font-display text-[1.9rem] leading-tight font-semibold">{c.title}</h1>
          <p className="mt-1 text-sm text-graphite/60">{c.card_label ? `${c.card_label} · ` : ""}desde {monthLabel(c.first_month)}</p>
        </div>
        {canEdit && (
          <Link href={`/cuotitas/${c.id}/editar`} aria-label="Editar cuotita" className="inline-flex size-10 items-center justify-center rounded-full bg-white/70 ring-1 ring-graphite/10">
            <Pencil className="size-4" />
          </Link>
        )}
      </header>

      <Card className="mb-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-graphite/60">Total</p>
            <p className="font-display text-4xl font-semibold tabular-nums">{formatMoney(c.total_cents)}</p>
            <p className="text-xs text-graphite/55">{c.installments} {c.installments === 1 ? "cuota" : "cuotas"} · {paidCount} de {installments.length} pagadas</p>
          </div>
          {pendingCents > 0 && active && <p className="text-right text-sm"><span className="block text-graphite/60">Falta</span><strong className="tabular-nums">{formatMoney(pendingCents)}</strong></p>}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-cream/80 p-3 text-sm">
          <MemberAvatar m={memberById.get(c.paid_by)} />
          <div className="min-w-0 flex-1">
            <p><strong>{c.paid_by === me ? (c.kind === "prestamo" ? "Prestaste vos" : "Pagaste vos") : `${c.kind === "prestamo" ? "Prestó" : "Pagó"} ${memberName(memberById.get(c.paid_by))}`}</strong></p>
            {alias && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-graphite/65">alias <span className="truncate font-mono font-semibold text-graphite">{alias}</span><CopyAlias alias={alias} label /></p>}
          </div>
        </div>
        {c.description && <p className="mt-4 whitespace-pre-line text-sm text-graphite/75">{c.description}</p>}
      </Card>

      <h2 className="mb-3 font-display text-xl">Cuotas de cada una</h2>
      <div className="mb-8 flex flex-col gap-4">
        {debtors.map((d) => {
          const mine = installments.filter((i) => i.member_id === d).sort((a, b) => a.number - b.number);
          const owed = mine.filter((i) => !i.paid_at && i.due_month <= month);
          const canMark = active && (isAdmin || me === d || me === c.paid_by);
          const debtNow = owed.length > 0;
          return (
            <Card key={d} className={d === me ? "ring-1 ring-rose/40" : undefined}>
              <div className="mb-3 flex items-center gap-3">
                <MemberAvatar m={memberById.get(d)} />
                <p className="min-w-0 flex-1 font-semibold">
                  {memberName(memberById.get(d), me)}
                  {debtNow ? <span className="ml-1.5" role="img" aria-label="debe">🐀</span> : mine.every((i) => i.paid_at) && <span className="ml-1.5" role="img" aria-label="pagó todo">🤑</span>}
                </p>
                <span className="text-sm tabular-nums text-graphite/60">{formatMoney(parts.find((p) => p.member_id === d)?.amount_cents ?? 0)}</span>
              </div>
              {canMark && owed.length > 1 && (
                <div className="mb-3 flex justify-end">
                  <PayInstallmentsButton ids={owed.map((i) => i.id)} cuotitaId={c.id} toMe={me === c.paid_by}
                    label={`Pagar las ${owed.length} vencidas (${formatMoney(owed.reduce((a, i) => a + i.amount_cents, 0))})`} />
                </div>
              )}
              <ul className="divide-y divide-graphite/5">
                {mine.map((i) => {
                  const late = !i.paid_at && i.due_month < month;
                  const now = i.due_month === month;
                  return (
                    <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-14 shrink-0 text-xs font-semibold text-graphite/55">{i.number}/{c.installments}</span>
                      <span className={`min-w-0 flex-1 ${now ? "font-semibold" : ""}`}>
                        {monthLabel(i.due_month)}
                        {late && <span className="ml-1 text-xs font-semibold text-rose-dark">atrasada</span>}
                        {now && !i.paid_at && <span className="ml-1 text-xs font-semibold text-rose-dark">este mes</span>}
                      </span>
                      <span className="tabular-nums">{formatMoney(i.amount_cents)}</span>
                      <span className="w-6 text-center" role="img" aria-label={i.paid_at ? "pagada" : "pendiente"}>{i.paid_at ? "🤑" : i.due_month <= month ? "🐀" : "·"}</span>
                      {canMark && (i.paid_at
                        ? <UnpayInstallmentButton id={i.id} cuotitaId={c.id} />
                        : <PayInstallmentsButton ids={[i.id]} cuotitaId={c.id} toMe={me === c.paid_by} small label={me === c.paid_by ? "Me pagó" : "Pagado"} />)}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-graphite/50">Cargada por {memberName(memberById.get(c.created_by), me)} el {formatTimestamp(c.created_at)}</p>
      {canEdit && <div className="mt-8 border-t border-graphite/10 pt-6"><VoidCuotitaButton id={c.id} /></div>}
    </>
  );
}
