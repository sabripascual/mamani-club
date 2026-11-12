import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Undo2 } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getExpense, getMembers } from "@/lib/expenses/queries";
import { formatMoney } from "@/lib/money/format";
import { formatDayLong, formatTimestamp, formatDay } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { StatusChip } from "@/components/expenses/status-chip";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";
import { MarkPaidButton, UndoPaymentButton, VoidExpenseButton } from "./actions-client";
import { getAlbum } from "@/lib/photos/queries";
import { toMiniMembers } from "@/lib/photos/members";
import { Gallery } from "@/components/photos/gallery";
import { PhotoUploader } from "@/components/photos/photo-uploader";

export const metadata: Metadata = { title: "Juntada · MAMANÍ CLUB" };

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { byId: catById }, { members, byId: memberById }, album] = await Promise.all([
    getExpense(id), getCategories(true), getMembers(), getAlbum(id, profile.id, { limit: 6 }),
  ]);
  if (!data) notFound();
  const { expense: e, shares, payments, status } = data;

  const me = profile.id;
  const isAdmin = profile.role === "admin";
  const canEdit = e.status === "active" && (isAdmin || e.created_by === me);
  const category = catById.get(e.category_id);
  const sub = e.subcategory_id ? catById.get(e.subcategory_id) : undefined;
  const payer = memberById.get(e.paid_by);
  const activePayments = payments.filter((p) => p.status === "active");
  const payerShare = shares.find((s) => s.is_payer);
  const debtorShares = shares.filter((s) => !s.is_payer).sort((a, b) => Number(b.outstanding_cents !== 0) - Number(a.outstanding_cents !== 0));
  const myShare = shares.find((s) => s.member_id === me && !s.is_payer);

  return (
    <>
      <Link href="/gastos" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite">
        <ArrowLeft className="size-4" /> Juntadas
      </Link>

      {e.status === "void" && (
        <div className="mb-4"><Alert>Esta juntada fue anulada{e.void_reason ? `: ${e.void_reason}` : ""}. No cuenta en los saldos.</Alert></div>
      )}

      <header className="mb-6 flex items-start gap-4">
        <CategoryIcon icon={category?.icon ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-dark">{sub ? `${category?.name} · ${sub.name}` : category?.name}</p>
          <h1 className="mt-1 font-display text-[1.9rem] leading-tight font-semibold">{e.title}</h1>
          <p className="mt-1 text-sm text-graphite/60 first-letter:uppercase">{formatDayLong(e.occurred_on)}</p>
        </div>
      </header>

      <Card className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-graphite/60">Total</p>
            <p className="font-display text-4xl font-semibold tabular-nums">{formatMoney(e.amount_cents, e.currency)}</p>
            {e.currency !== "ARS" && (
              <p className="text-xs text-graphite/55">= {formatMoney(e.base_amount_cents)} (cotización {e.fx_rate} del {formatDay(e.fx_rate_date)})</p>
            )}
          </div>
          {status && <StatusChip status={status.settlement_status} />}
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-cream/80 p-3">
          <MemberAvatar m={payer} size="md" />
          <div className="text-sm">
            <p><strong>{e.paid_by === me ? "Vos adelantaste" : `${memberName(payer)} adelantó`}</strong> la plata</p>
            <p className="text-graphite/60">
              {payerShare ? `Su consumo: ${formatMoney(payerShare.amount_cents, e.currency)}` : "No participó del consumo"}
              {status && status.outstanding_cents > 0 && ` · Falta devolver ${formatMoney(status.outstanding_cents, e.currency)}`}
            </p>
          </div>
        </div>
        {myShare && myShare.outstanding_cents > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-rose/20 p-3">
            <p className="text-sm"><strong>Le debés {formatMoney(myShare.outstanding_cents, e.currency)}</strong> a {memberName(payer)}</p>
            <MarkPaidButton shareId={myShare.share_id} expenseId={e.id} label="Ya pagué" />
          </div>
        )}
      </Card>

      <h2 className="mb-3 font-display text-xl">Participantes</h2>
      <ul className="mb-8 flex flex-col gap-2">
        {payerShare && (
          <li className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 p-3">
            <span className="flex items-center gap-3"><MemberAvatar m={payer} /><span className="font-semibold">{memberName(payer, me)}</span></span>
            <span className="text-right text-sm">
              <span className="block font-semibold tabular-nums">{formatMoney(payerShare.amount_cents, e.currency)}</span>
              <span className="text-xs text-graphite/55">Pagó el total</span>
            </span>
          </li>
        )}
        {debtorShares.map((s) => {
          const m = memberById.get(s.member_id);
          const canMark = e.status === "active" && s.outstanding_cents !== 0 && (isAdmin || me === s.member_id || me === e.paid_by);
          return (
            <li key={s.share_id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 p-3">
              <span className="flex min-w-0 items-center gap-3">
                <MemberAvatar m={m} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{memberName(m, me)}</span>
                  {!s.is_participant && <span className="text-xs text-graphite/55">Ya no participa</span>}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-right text-sm">
                  <span className="block font-semibold tabular-nums">{formatMoney(s.amount_cents, e.currency)}</span>
                  <span className={s.outstanding_cents > 0 ? "text-xs font-semibold text-rose-dark" : "text-xs text-graphite/55"}>
                    {s.outstanding_cents > 0
                      ? s.paid_cents > 0 ? `Falta ${formatMoney(s.outstanding_cents, e.currency)}` : "Pendiente"
                      : s.outstanding_cents < 0
                        ? `Reintegrar ${formatMoney(-s.outstanding_cents, e.currency)}`
                        : "Pagado ✓"}
                  </span>
                </span>
                {canMark && (
                  <MarkPaidButton
                    shareId={s.share_id}
                    expenseId={e.id}
                    label={s.outstanding_cents < 0 ? "Reintegrado" : "Pagado"}
                    compact
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {payments.length > 0 && (
        <>
          <h2 className="mb-3 font-display text-xl">Pagos</h2>
          <ul className="mb-8 flex flex-col gap-2">
            {payments.map((p) => {
              const canUndo = p.status === "active" && e.status === "active" && (isAdmin || [p.from_member, p.to_member, p.created_by].includes(me));
              return (
                <li key={p.id} className={`flex items-center justify-between gap-3 rounded-2xl bg-white/50 p-3 text-sm ${p.status === "void" ? "opacity-55" : ""}`}>
                  <div>
                    <p className={p.status === "void" ? "line-through" : undefined}>
                      <strong>{memberName(memberById.get(p.from_member), me)}</strong> {p.kind === "refund" ? "reintegró" : "le pagó"}{" "}
                      <strong>{formatMoney(p.amount_cents, p.currency)}</strong> a {memberName(memberById.get(p.to_member), me)}
                    </p>
                    <p className="text-xs text-graphite/55">
                      {formatDay(p.paid_on)}
                      {p.created_by !== p.from_member && ` · registrado por ${memberName(memberById.get(p.created_by), me)}`}
                      {p.status === "void" && ` · deshecho${p.void_reason ? `: ${p.void_reason}` : ""}`}
                    </p>
                  </div>
                  {canUndo && <UndoPaymentButton paymentId={p.id} expenseId={e.id} />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {e.status === "active" && (
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl">Fotos{album.total > 0 && <span className="ml-2 text-base text-graphite/50">{album.total}</span>}</h2>
            {album.total > 0 && <Link href={`/recuerdos/${e.id}`} className="text-sm font-semibold text-rose-dark">Ver álbum</Link>}
          </div>
          {album.total > 0 && (
            <div className="mb-3">
              <Gallery photos={album.photos} members={toMiniMembers(members)} meId={me} isAdmin={isAdmin} expenseId={e.id} />
            </div>
          )}
          <PhotoUploader expenseId={e.id} variant={album.total > 0 ? "subtle" : "primary"} />
        </section>
      )}

      {e.description && (
        <>
          <h2 className="mb-2 font-display text-xl">Descripción</h2>
          <p className="mb-8 whitespace-pre-line text-graphite/75">{e.description}</p>
        </>
      )}

      <p className="mb-6 text-xs text-graphite/50">
        Cargada por {memberName(memberById.get(e.created_by), me)} el {formatTimestamp(e.created_at)}
        {e.updated_at !== e.created_at && ` · última edición ${formatTimestamp(e.updated_at)}`}
      </p>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/gastos/${e.id}/editar`} className="inline-flex h-11 items-center gap-2 rounded-full bg-graphite px-5 text-sm font-semibold text-cream">
            <Pencil className="size-4" /> Editar
          </Link>
          <VoidExpenseButton expenseId={e.id} disabled={activePayments.length > 0} />
        </div>
      )}
      {canEdit && activePayments.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs text-graphite/50"><Undo2 className="size-3" /> Para anularla primero hay que deshacer los pagos.</p>
      )}
    </>
  );
}
