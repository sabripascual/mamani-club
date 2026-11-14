"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, CreditCard, HandCoins } from "lucide-react";
import type { FormState } from "@/lib/expenses/actions";
import type { Member } from "@/lib/expenses/types";
import { addMonths, cardDisplay, monthLabel, type CuotitaKind, type MemberCard } from "@/lib/cuotitas/types";
import { previewCuotita } from "@/lib/cuotitas/split";
import { centsToInput, formatMoney, parseMoney } from "@/lib/money/format";
import { cn, displayName } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { FormShell } from "@/components/expenses/form-shell";
import { MemberAvatar } from "@/components/expenses/member-avatar";

export type CuotitaInitial = {
  title: string; kind: CuotitaKind; total_cents: number; installments: number; first_month: string; paid_by: string;
  card_id: string | null; split_type: "equal" | "custom"; parts: { member_id: string; amount_cents: number }[];
  description: string | null; refund_alias: string | null; locked: boolean;
};

const QUICK = [1, 3, 6, 9, 12, 18, 24];
const input = "h-12 w-full min-w-0 rounded-2xl border border-graphite/10 bg-white/70 px-4 text-base outline-none focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15";

/** "3 cuotas de $11.111,11" o "1 de $11.111,12 y 2 de $11.111,11". */
function cuotasLabel(cuotas: number[]) {
  if (cuotas.length === 0) return "—";
  const groups = new Map<number, number>();
  for (const c of cuotas) groups.set(c, (groups.get(c) ?? 0) + 1);
  return [...groups].map(([v, n]) => `${n} ${n === 1 ? "cuota" : "cuotas"} de ${formatMoney(v)}`).join(" y ");
}

export function CuotitaForm({
  action, members, meId, cards, myAliases, thisMonth, initial,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  members: Member[];
  meId: string;
  cards: MemberCard[];
  myAliases: { alias: string; label: string | null; is_primary: boolean }[];
  thisMonth: string; // AAAA-MM-01
  initial?: CuotitaInitial;
}) {
  const locked = initial?.locked ?? false;
  const [kind, setKind] = useState<CuotitaKind>(initial?.kind ?? "tarjeta");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.total_cents) : "");
  const [installments, setInstallments] = useState(initial?.installments ?? 3);
  const [firstMonth, setFirstMonth] = useState((initial?.first_month ?? addMonths(thisMonth, 1)).slice(0, 7));
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? meId);
  const [cardId, setCardId] = useState(initial?.card_id ?? "");
  const [participants, setParticipants] = useState<string[]>(initial?.parts.map((p) => p.member_id) ?? [meId]);
  const [split, setSplit] = useState<"equal" | "custom">(initial?.split_type ?? "equal");
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries((initial?.parts ?? []).map((p) => [p.member_id, centsToInput(p.amount_cents)])),
  );

  const selectable = useMemo(
    () => members.filter((m) => m.status === "active" || participants.includes(m.id) || m.id === paidBy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members],
  );
  const label = (m: Member) => (m.id === meId ? "Yo" : displayName(m));
  const nameOf = (id: string) => { const m = members.find((x) => x.id === id); return m ? label(m) : "—"; };
  const payerCards = cards.filter((c) => c.member_id === paidBy);
  const totalCents = parseMoney(amount) ?? 0;
  const customCents = Object.fromEntries(participants.map((id) => [id, custom[id]?.trim() === "0" ? 0 : (parseMoney(custom[id] ?? "") ?? 0)]));
  const customSum = participants.reduce((a, id) => a + customCents[id], 0);
  const preview = totalCents && installments >= 1
    ? previewCuotita({ totalCents, installments, paidBy, split, participants, custom: customCents }) : [];
  const months = Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, i));
  if (initial && !months.includes(`${firstMonth}-01`)) months.unshift(`${firstMonth}-01`);
  const toggle = (id: string) => setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pick = (id: string) => { setPaidBy(id); setCardId(""); };

  return (
    <FormShell action={action} submitLabel={initial ? "Guardar cambios" : "Cargar cuotita"}>
      {(errors) => (
        <>
          {locked && (
            <>
              <p className="rounded-2xl bg-lime/50 p-3 text-sm">Ya hay cuotas pagadas: podés cambiar el nombre, la tarjeta, el alias y el detalle. El resto queda como está.</p>
              {/* Lo bloqueado igual se manda (un fieldset deshabilitado no envía sus campos). */}
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="paid_by" value={paidBy} />
              <input type="hidden" name="installments" value={installments} />
              <input type="hidden" name="split_type" value={split} />
              <input type="hidden" name="first_month" value={firstMonth} />
              {participants.map((id) => <input key={id} type="hidden" name="participants" value={id} />)}
              {split === "custom" && participants.map((id) => <input key={`s${id}`} type="hidden" name={`share_${id}`} value={custom[id] ?? ""} />)}
            </>
          )}
          <fieldset disabled={locked}>
            <legend className="mb-2 text-sm font-semibold text-graphite/80">¿Qué es?</legend>
            <input type="hidden" name="kind" value={kind} />
            <div className="grid grid-cols-2 gap-2">
              {([["tarjeta", "Compra con tarjeta", CreditCard], ["prestamo", "Préstamo", HandCoins]] as const).map(([k, text, Icon]) => (
                <button type="button" key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                  className={cn("flex h-14 items-center justify-center gap-2 rounded-2xl text-sm font-semibold ring-1 transition",
                    kind === k ? "bg-lime ring-2 ring-graphite" : "bg-white/60 ring-graphite/10")}>
                  <Icon className="size-5" /> {text}
                </button>
              ))}
            </div>
          </fieldset>

          <Field label={kind === "tarjeta" ? "¿Qué compraste?" : "¿Para qué es?"} name="title" defaultValue={initial?.title} maxLength={80} error={errors.title}
            placeholder={kind === "tarjeta" ? "Ej: Pasajes a Mendoza" : "Ej: Le presté a Caro para el alquiler"} />

          <Field label={kind === "tarjeta" ? "Total a pagar" : "¿Cuánto prestaste?"} name="amount" inputMode="decimal" placeholder="120.000" value={amount}
            onChange={(e) => setAmount(e.target.value)} readOnly={locked} error={errors.amount} className="max-w-xs"
            hint={totalCents ? formatMoney(totalCents) : kind === "tarjeta" ? "Con intereses, si los hay" : "En pesos"} />

          <fieldset disabled={locked}>
            <legend className="mb-2 text-sm font-semibold text-graphite/80">{kind === "tarjeta" ? "¿Quién pagó?" : "¿Quién prestó?"}</legend>
            <input type="hidden" name="paid_by" value={paidBy} />
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {selectable.map((m) => (
                <button type="button" key={m.id} onClick={() => pick(m.id)} aria-pressed={paidBy === m.id}
                  className={cn("flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold transition",
                    paidBy === m.id ? "bg-white ring-2 ring-graphite" : "hover:bg-white/60")}>
                  <MemberAvatar m={m} size="md" />
                  <span className="w-full truncate px-1 text-center">{label(m)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {kind === "tarjeta" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="card_id" className="text-sm font-semibold text-graphite/80">¿Con qué tarjeta?</label>
              {payerCards.length > 0 ? (
                <select id="card_id" name="card_id" value={cardId} onChange={(e) => setCardId(e.target.value)} className={input}>
                  <option value="">Elegí la tarjeta</option>
                  {payerCards.map((c) => <option key={c.id} value={c.id}>{cardDisplay(c.brand, c.label)}</option>)}
                </select>
              ) : (
                <p className="rounded-2xl bg-white/60 p-3 text-sm text-graphite/70">
                  {paidBy === meId
                    ? <>Todavía no cargaste tarjetas. <Link href="/perfil/editar#tarjetas" className="font-semibold text-rose-dark">Cargala en tu perfil</Link> (solo la marca, sin números).</>
                    : `${nameOf(paidBy)} todavía no cargó tarjetas en su perfil.`}
                </p>
              )}
              {errors.card_id && <p className="text-sm text-rose-dark">{errors.card_id}</p>}
            </div>
          )}

          <fieldset disabled={locked}>
            <legend className="mb-2 text-sm font-semibold text-graphite/80">¿En cuántas cuotas?</legend>
            <input type="hidden" name="installments" value={installments} />
            <div className="flex flex-wrap items-center gap-2">
              {QUICK.map((n) => (
                <button type="button" key={n} onClick={() => setInstallments(n)} aria-pressed={installments === n}
                  className={cn("h-10 min-w-12 rounded-full px-3 text-sm font-semibold transition",
                    installments === n ? "bg-graphite text-cream" : "bg-white/70 ring-1 ring-graphite/10")}>
                  {n}
                </button>
              ))}
              <label className="flex items-center gap-1.5 text-sm text-graphite/60">
                otra:
                <input type="number" min={1} max={48} value={QUICK.includes(installments) ? "" : installments}
                  onChange={(e) => e.target.value && setInstallments(Math.min(48, Math.max(1, Number(e.target.value))))}
                  className="h-10 w-16 rounded-full border border-graphite/10 bg-white px-3 text-center" aria-label="Otra cantidad de cuotas" />
              </label>
            </div>
            {errors.installments && <p className="mt-1.5 text-sm text-rose-dark">{errors.installments}</p>}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="first_month" className="text-sm font-semibold text-graphite/80">Primera cuota</label>
            <select id="first_month" name="first_month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} disabled={locked} className={cn(input, "max-w-xs")}>
              {months.map((m) => <option key={m} value={m.slice(0, 7)}>{monthLabel(m)}</option>)}
            </select>
            <p className="text-xs text-graphite/55">
              {installments > 1 ? `Hasta ${monthLabel(addMonths(`${firstMonth}-01`, installments - 1))}. ` : ""}Recordatorios del 1 al 5 de cada mes.
            </p>
          </div>

          <fieldset disabled={locked}>
            <legend className="mb-1 text-sm font-semibold text-graphite/80">¿Entre quiénes se divide?</legend>
            <p className="mb-3 text-xs text-graphite/55">Incluí a {paidBy === meId ? "vos" : nameOf(paidBy)} si también le toca una parte (esa no se la debe a nadie).</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {selectable.map((m) => {
                const on = participants.includes(m.id);
                return (
                  <label key={m.id} className="relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold">
                    <input type="checkbox" name="participants" value={m.id} checked={on} onChange={() => toggle(m.id)} className="peer sr-only" />
                    <span className={cn("rounded-full ring-offset-2 ring-offset-cream transition peer-focus-visible:ring-2 peer-focus-visible:ring-rose", on ? "ring-2 ring-graphite" : "opacity-45 grayscale")}>
                      <MemberAvatar m={m} size="md" />
                    </span>
                    {on && <span className="absolute top-1 right-2 inline-flex size-5 items-center justify-center rounded-full bg-graphite text-cream"><Check className="size-3" strokeWidth={3} /></span>}
                    <span className={cn("w-full truncate text-center", !on && "text-graphite/50")}>{label(m)}</span>
                  </label>
                );
              })}
            </div>
            {errors.participants && <p className="mt-1.5 text-sm text-rose-dark">{errors.participants}</p>}
          </fieldset>

          <fieldset disabled={locked}>
            <legend className="mb-2 text-sm font-semibold text-graphite/80">División</legend>
            <input type="hidden" name="split_type" value={split} />
            <div className="mb-4 inline-flex rounded-full bg-white/70 p-1 ring-1 ring-graphite/10">
              {(["equal", "custom"] as const).map((s) => (
                <button type="button" key={s} onClick={() => setSplit(s)}
                  className={cn("h-9 rounded-full px-4 text-sm font-semibold transition", split === s ? "bg-graphite text-cream" : "text-graphite/60")}>
                  {s === "equal" ? "Igualitaria" : "Personalizada"}
                </button>
              ))}
            </div>
            {split === "custom" && (
              <ul className="mb-2 divide-y divide-graphite/5 rounded-2xl bg-white/60">
                {selectable.filter((m) => participants.includes(m.id)).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><MemberAvatar m={m} /><span className="truncate">{label(m)}</span></span>
                    <input name={`share_${m.id}`} inputMode="decimal" placeholder="0" value={custom[m.id] ?? ""} aria-label={`Parte de ${displayName(m)}`}
                      onChange={(e) => setCustom({ ...custom, [m.id]: e.target.value })}
                      className="h-10 w-32 rounded-xl border border-graphite/10 bg-white px-3 text-right tabular-nums outline-none focus:border-rose" />
                  </li>
                ))}
              </ul>
            )}
            {split === "custom" && totalCents > 0 && customSum !== totalCents && (
              <p className="mb-2 text-sm font-semibold text-rose-dark">{customSum < totalCents ? `Faltan asignar ${formatMoney(totalCents - customSum)}` : `Te pasaste por ${formatMoney(customSum - totalCents)}`}</p>
            )}
            {errors.shares && <p className="mb-2 text-sm text-rose-dark">{errors.shares}</p>}

            {preview.length > 0 && (
              <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-graphite/5">
                <p className="mb-2 text-sm font-semibold">Así queda</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {preview.map((p) => (
                    <li key={p.memberId} className="flex items-start justify-between gap-3">
                      <span className="font-semibold">{nameOf(p.memberId)}</span>
                      <span className="text-right text-graphite/75">
                        {p.owes ? cuotasLabel(p.cuotas) : <>su parte ({formatMoney(p.part)}) no se la debe a nadie</>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </fieldset>

          {paidBy === meId && myAliases.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="refund_alias" className="text-sm font-semibold text-graphite/80">¿A qué alias te transfieren?</label>
              <select id="refund_alias" name="refund_alias" className={input}
                defaultValue={(initial?.refund_alias && myAliases.some((a) => a.alias === initial.refund_alias) ? initial.refund_alias : null) ?? myAliases.find((a) => a.is_primary)?.alias ?? myAliases[0].alias}>
                {myAliases.map((a) => <option key={a.alias} value={a.alias}>{a.alias}{a.label ? ` · ${a.label}` : ""}{a.is_primary ? " (principal)" : ""}</option>)}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-sm font-semibold text-graphite/80">Detalle <span className="font-normal text-graphite/50">(opcional)</span></label>
            <textarea id="description" name="description" rows={2} maxLength={500} defaultValue={initial?.description ?? ""}
              className="rounded-2xl border border-graphite/10 bg-white/70 px-4 py-3 text-base outline-none focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15" />
          </div>
          {initial && <Field label="Motivo del cambio" name="reason" placeholder="Ej: me equivoqué en las cuotas" hint="Opcional. Queda en la auditoría." maxLength={200} />}
        </>
      )}
    </FormShell>
  );
}
