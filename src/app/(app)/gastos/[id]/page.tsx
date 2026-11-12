import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Pencil, Plus, Undo2 } from "lucide-react";
import { refundAliasFor } from "@/lib/expenses/refund-alias";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getJuntada, getJuntadaTypes, getMembers } from "@/lib/expenses/queries";
import { getAlbum } from "@/lib/photos/queries";
import { toMiniMembers } from "@/lib/photos/members";
import { formatMoney } from "@/lib/money/format";
import { formatDayLong, formatTimestamp, formatDay } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { StatusChip } from "@/components/expenses/status-chip";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";
import { Gallery } from "@/components/photos/gallery";
import { PhotoUploader } from "@/components/photos/photo-uploader";
import { GuestPaidButton, JoinButton, LeaveButton, SettleButton, UndoSettlementButton, VoidJuntadaButton } from "./actions-client";
import { getAliases } from "@/lib/profile/aliases";
import { CopyAlias } from "@/components/copy-alias";
import { MapsLink } from "@/components/maps-link";

export const metadata: Metadata = { title: "Juntada · MAMANÍ CLUB" };

export default async function JuntadaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { id } = await params;
  const { aviso } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { byId: typeById }, { byId: catById }, { members, byId: memberById }, album] = await Promise.all([
    getJuntada(id), getJuntadaTypes(true), getCategories(true), getMembers(), getAlbum(id, profile.id, { limit: 6 }),
  ]);
  if (!data) notFound();
  const { juntada: j, gastos, shares, attendees, nets, transfers, settlements, status } = data;
  // Deudas de invitadas: cada una le paga su parte a quien pagó ese gasto.
  const gastoById = new Map(gastos.map((g) => [g.id, g]));
  const guestDebts = shares.filter((s) => s.guest_name && gastoById.has(s.expense_id))
    .map((s) => ({ ...s, creditor: gastoById.get(s.expense_id)!.paid_by, gasto: gastoById.get(s.expense_id)! }));
  // Alias de quien tiene que cobrar: el que eligió al cargar su gasto, o su principal.
  const aliasesBy = await getAliases([...new Set([...transfers.map((t) => t.to_member), ...guestDebts.map((d) => d.creditor)])]);
  const aliasOf = (memberId: string) => refundAliasFor(gastos, memberId, aliasesBy.get(memberId)?.[0]?.alias);

  const me = profile.id;
  const isAdmin = profile.role === "admin";
  const active = j.status === "active";
  const canEditJuntada = active && (isAdmin || j.created_by === me);
  const type = typeById.get(j.type_id);
  const myNet = nets.find((n) => n.member_id === me);
  const amAttendee = attendees.includes(me);
  const activeSettlements = settlements.filter((s) => s.status === "active");
  // Una juntada saldada no admite gastos nuevos (la base también lo impide).
  const canAddGasto = active && status?.settlement_status !== "settled";
  const sharesBy = (gastoId: string) => shares.filter((s) => s.expense_id === gastoId && s.is_participant);
  const inSomeGasto = new Set([...shares.filter((s) => s.is_participant).map((s) => s.member_id), ...gastos.map((g) => g.paid_by)]);

  return (
    <>
      <Link href="/gastos" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite">
        <ArrowLeft className="size-4" /> Juntadas
      </Link>
      {aviso && <div className="mb-4"><Alert>{aviso}</Alert></div>}
      {!active && <div className="mb-4"><Alert>Esta juntada fue anulada{j.void_reason ? `: ${j.void_reason}` : ""}. No cuenta en los saldos.</Alert></div>}

      <header className="mb-6 flex items-start gap-4">
        <CategoryIcon icon={type?.icon ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-dark">{type?.name ?? "Juntada"}</p>
          <h1 className="mt-1 font-display text-[1.9rem] leading-tight font-semibold">{j.title}</h1>
          <p className="mt-1 text-sm text-graphite/60 first-letter:uppercase">{formatDayLong(j.occurred_on)}</p>
          {j.location && <MapsLink location={j.location} />}
        </div>
        {canEditJuntada && (
          <Link href={`/gastos/${j.id}/editar`} aria-label="Editar juntada" className="inline-flex size-10 items-center justify-center rounded-full bg-white/70 ring-1 ring-graphite/10">
            <Pencil className="size-4" />
          </Link>
        )}
      </header>

      {/* Resumen */}
      <Card className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-graphite/60">Total de la juntada</p>
            <p className="font-display text-4xl font-semibold tabular-nums">{formatMoney(status?.total_cents ?? 0, j.currency, { round: true })}</p>
            <p className="text-xs text-graphite/55">{gastos.length} {gastos.length === 1 ? "gasto" : "gastos"} · {attendees.length} fueron</p>
          </div>
          {status && <StatusChip status={status.settlement_status} />}
        </div>
        {myNet && myNet.net_cents !== 0 && (
          <div className={`mt-4 rounded-2xl p-3 text-sm ${myNet.net_cents < 0 ? "bg-rose/20" : "bg-lime/70"}`}>
            {myNet.net_cents < 0 ? <><strong>Debés {formatMoney(-myNet.net_cents, j.currency)}</strong> en esta juntada</> : <><strong>Te deben {formatMoney(myNet.net_cents, j.currency)}</strong> en esta juntada</>}
            <span className="block text-xs text-graphite/60">Pagaste {formatMoney(myNet.paid_cents, j.currency, { round: true })} · consumiste {formatMoney(myNet.consumed_cents, j.currency, { round: true })}</span>
          </div>
        )}
      </Card>

      {/* Cómo saldamos */}
      {active && transfers.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-display text-xl">Cómo saldamos</h2>
          <p className="mb-3 text-xs text-graphite/55">La menor cantidad de transferencias para quedar todas a mano. Se recalcula si cambia un gasto.</p>
          <ul className="flex flex-col gap-2">
            {transfers.map((t) => {
              const involved = me === t.from_member || me === t.to_member;
              const canMark = involved || isAdmin;
              return (
                <li key={`${t.from_member}-${t.to_member}`} className={`flex items-center gap-3 rounded-2xl p-3 ${involved ? "bg-white ring-1 ring-rose/40" : "bg-white/55"}`}>
                  <MemberAvatar m={memberById.get(t.from_member)} />
                  <ArrowRight className="size-4 shrink-0 text-graphite/35" />
                  <MemberAvatar m={memberById.get(t.to_member)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p><strong>{memberName(memberById.get(t.from_member), me)}</strong> → <strong>{memberName(memberById.get(t.to_member), me)}</strong></p>
                    <p className="font-semibold tabular-nums">{formatMoney(t.amount_cents, j.currency)}</p>
                    {(() => {
                      const al = aliasOf(t.to_member);
                      return al ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-graphite/65">
                          alias <span className="truncate font-mono font-semibold text-graphite">{al}</span>
                          <CopyAlias alias={al} label />
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-graphite/45">{t.to_member === me ? "Cargá tu alias en tu perfil" : "Todavía no cargó alias"}</p>
                      );
                    })()}
                  </div>
                  {canMark && <SettleButton juntadaId={j.id} from={t.from_member} to={t.to_member} amountCents={t.amount_cents} alias={aliasOf(t.to_member) ?? undefined} meId={me} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Invitadas: cada una paga su parte a quien pagó el gasto */}
      {active && guestDebts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-display text-xl">Invitadas</h2>
          <p className="mb-3 text-xs text-graphite/55">Cada invitada le paga su parte a quien pagó el gasto. Lo marcan su responsable o una admin.</p>
          <ul className="flex flex-col gap-2">
            {guestDebts.map((d) => {
              const paid = !!d.guest_paid_at;
              const canMark = isAdmin || d.member_id === me;
              const al = aliasOf(d.creditor);
              return (
                <li key={d.id} className={`flex items-center gap-3 rounded-2xl p-3 ${d.member_id === me || d.creditor === me ? "bg-white ring-1 ring-rose/40" : "bg-white/55"}`}>
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-bold">{d.guest_name!.charAt(0).toUpperCase()}</span>
                  <ArrowRight className="size-4 shrink-0 text-graphite/35" />
                  <MemberAvatar m={memberById.get(d.creditor)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p><strong>{d.guest_name}</strong> → <strong>{memberName(memberById.get(d.creditor), me)}</strong> <span aria-label={paid ? "pagó" : "debe"}>{paid ? "🤑" : "🐀"}</span></p>
                    <p className="font-semibold tabular-nums">{formatMoney(d.amount_cents, j.currency)} <span className="font-normal text-graphite/55">· {d.gasto.title}</span></p>
                    <p className="text-xs text-graphite/55">{paid ? "Ya pagó" : "Debe"} · invitada de {memberName(memberById.get(d.member_id), me)}</p>
                    {!paid && al && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-graphite/65">alias <span className="truncate font-mono font-semibold text-graphite">{al}</span><CopyAlias alias={al} label /></p>
                    )}
                  </div>
                  {canMark && <GuestPaidButton shareId={d.id} juntadaId={j.id} paid={paid} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Gastos */}
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl">Gastos</h2>
          {!canAddGasto && active && <span className="text-xs text-graphite/50">Saldada: no se agregan más gastos</span>}
        </div>
        {canAddGasto && (
          <Link
            href={`/gastos/${j.id}/gasto/nuevo`}
            className="group mb-3 flex items-center gap-4 rounded-[var(--radius-card)] bg-lime p-4 text-graphite shadow-lg shadow-rose/25 ring-4 ring-rose transition hover:brightness-105 active:scale-[0.99]"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-[2.5px] border-graphite text-graphite transition group-hover:rotate-90">
              <Plus className="size-6" strokeWidth={2.5} />
            </span>
            <span className="flex-1">
              <span className="block font-display text-xl font-semibold">Agregar gasto</span>
              <span className="text-sm text-graphite/75">{gastos.length === 0 ? "Cargá lo que se pagó en esta juntada" : "¿Alguien pagó algo más?"}</span>
            </span>
          </Link>
        )}
        {gastos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rose/40 p-5 text-center text-sm text-graphite/60">Todavía no hay gastos.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {gastos.map((g, i) => {
              const parts = sharesBy(g.id);
              const cat = catById.get(g.category_id);
              const sub = g.subcategory_id ? catById.get(g.subcategory_id) : undefined;
              const mine = g.created_by === me;
              const inner = (
                <>
                  <CategoryIcon icon={cat?.icon ?? null} index={i} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.title}</span>
                    <span className="block truncate text-xs text-graphite/55">
                      {g.paid_by === me ? "pagaste vos" : `pagó ${memberName(memberById.get(g.paid_by))}`} · {sub?.name ?? cat?.name} · entre {parts.length}
                      {parts.some((p) => p.guest_name) && ` (con ${parts.filter((p) => p.guest_name).map((p) => p.guest_name).join(", ")})`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{formatMoney(g.amount_cents, g.currency, { round: true })}</span>
                    {mine && <span className="text-[11px] font-semibold text-rose-dark">Lo cargaste vos</span>}
                  </span>
                </>
              );
              return (
                <li key={g.id}>
                  <Link href={`/gastos/${j.id}/gasto/${g.id}`} className="flex items-center gap-3 rounded-2xl bg-white/60 p-3 transition hover:bg-white">{inner}</Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Asistentes */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Fueron <span className="text-base text-graphite/50">{attendees.length}</span></h2>
          {active && !amAttendee && <JoinButton juntadaId={j.id} />}
        </div>
        <ul className="flex flex-wrap gap-2">
          {attendees.map((a) => {
            const n = nets.find((x) => x.member_id === a);
            const canRemove = active && !inSomeGasto.has(a) && (a === me || canEditJuntada);
            return (
              <li key={a} className="flex items-center gap-2 rounded-full bg-white/60 py-1 pr-2 pl-1">
                <MemberAvatar m={memberById.get(a)} />
                <span className="text-sm font-semibold">{memberName(memberById.get(a), me)}</span>
                {n && n.net_cents !== 0 && (
                  <span className={`text-xs font-semibold tabular-nums ${n.net_cents < 0 ? "text-rose-dark" : "text-graphite/60"}`}>
                    {n.net_cents < 0 ? "−" : "+"}{formatMoney(Math.abs(n.net_cents), j.currency, { round: true })}
                  </span>
                )}
                {canRemove && <LeaveButton juntadaId={j.id} memberId={a} self={a === me} />}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Fotos */}
      {active && (
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl">Fotos{album.total > 0 && <span className="ml-2 text-base text-graphite/50">{album.total}</span>}</h2>
            {album.total > 0 && <Link href={`/recuerdos/${j.id}`} className="text-sm font-semibold text-rose-dark">Ver álbum</Link>}
          </div>
          {album.total > 0 && (
            <div className="mb-3"><Gallery photos={album.photos} members={toMiniMembers(members)} meId={me} isAdmin={isAdmin} expenseId={j.id} /></div>
          )}
          <PhotoUploader expenseId={j.id} variant={album.total > 0 ? "subtle" : "primary"} />
        </section>
      )}

      {/* Transferencias registradas */}
      {settlements.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl">Transferencias</h2>
          <ul className="flex flex-col gap-2">
            {settlements.map((s) => {
              const canUndo = s.status === "active" && active && (isAdmin || [s.from_member, s.to_member, s.created_by].includes(me));
              return (
                <li key={s.id} className={`flex items-center justify-between gap-3 rounded-2xl bg-white/50 p-3 text-sm ${s.status === "void" ? "opacity-55" : ""}`}>
                  <div>
                    <p className={s.status === "void" ? "line-through" : undefined}>
                      <strong>{memberName(memberById.get(s.from_member), me)}</strong> le transfirió <strong>{formatMoney(s.amount_cents, s.currency)}</strong> a {memberName(memberById.get(s.to_member), me)}
                    </p>
                    <p className="text-xs text-graphite/55">
                      {formatDay(s.paid_on)}{s.alias && ` · alias ${s.alias}`}
                      {s.created_by !== s.from_member && ` · registró ${memberName(memberById.get(s.created_by), me)}`}
                      {s.status === "void" && ` · deshecha${s.void_reason ? `: ${s.void_reason}` : ""}`}
                    </p>
                  </div>
                  {canUndo && <UndoSettlementButton settlementId={s.id} juntadaId={j.id} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {j.description && (
        <>
          <h2 className="mb-2 font-display text-xl">Descripción</h2>
          <p className="mb-8 whitespace-pre-line text-graphite/75">{j.description}</p>
        </>
      )}

      <p className="mb-6 text-xs text-graphite/50">
        Creada por {memberName(memberById.get(j.created_by), me)} el {formatTimestamp(j.created_at)}
      </p>

      {canEditJuntada && (
        <>
          <VoidJuntadaButton juntadaId={j.id} disabled={activeSettlements.length > 0} />
          {activeSettlements.length > 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-graphite/50"><Undo2 className="size-3" /> Para anularla primero hay que deshacer las transferencias.</p>
          )}
        </>
      )}
    </>
  );
}
