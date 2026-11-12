"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { Check, Users } from "lucide-react";
import type { ExpenseFormState } from "@/lib/expenses/actions";
import type { CategoryTree, Member } from "@/lib/expenses/types";
import { centsToInput, formatMoney, parseMoney } from "@/lib/money/format";
import { equalSplit } from "@/lib/money/split";
import { cn, displayName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { CategoryIcon } from "./category-icon";
import { MemberAvatar } from "./member-avatar";

export type ExpenseFormInitial = {
  title: string;
  occurred_on: string;
  category_id: string;
  subcategory_id: string | null;
  description: string | null;
  amount_cents: number;
  paid_by: string;
  split_type: "equal" | "custom";
  shares: { member_id: string; amount_cents: number }[];
};

type Props = {
  mode: "create" | "edit";
  action: (state: ExpenseFormState, formData: FormData) => Promise<ExpenseFormState>;
  categories: CategoryTree;
  members: Member[];
  meId: string;
  today: string;
  initial?: ExpenseFormInitial;
  hasPayments?: boolean;
};

export function ExpenseForm({ mode, action, categories, members, meId, today, initial, hasPayments }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const f = state.fields ?? {};

  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategory_id ?? "");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amount_cents) : "");
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? meId);
  const [participants, setParticipants] = useState<string[]>(initial?.shares.map((s) => s.member_id) ?? []);
  const [split, setSplit] = useState<"equal" | "custom">(initial?.split_type ?? "equal");
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries((initial?.shares ?? []).map((s) => [s.member_id, centsToInput(s.amount_cents)])),
  );

  // Para elegir: activas + las desactivadas que ya estaban en la juntada.
  const selectable = useMemo(
    () => members.filter((m) => m.status === "active" || participants.includes(m.id) || m.id === paidBy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members],
  );
  const amountCents = parseMoney(amount);
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const preview = amountCents ? equalSplit(amountCents, participants) : new Map<string, number>();
  const customSum = participants.reduce((acc, id) => acc + (custom[id]?.trim() === "0" ? 0 : (parseMoney(custom[id] ?? "") ?? 0)), 0);
  const remaining = (amountCents ?? 0) - customSum;

  const toggle = (id: string) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allActive = selectable.filter((m) => m.status === "active").map((m) => m.id);

  return (
    <form
      // onSubmit en vez de action: así React no vacía el formulario si vuelve con error.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-7"
      noValidate
    >
      {state.error && <Alert>{state.error}</Alert>}

      <Field label="Nombre de la juntada" name="title" placeholder="Ej: Asado en lo de Sofi" defaultValue={initial?.title} error={f.title} maxLength={80} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="¿Cuándo fue?" name="occurred_on" type="date" max={today} defaultValue={initial?.occurred_on ?? today} error={f.occurred_on} />
        <Field
          label="Importe total"
          name="amount"
          inputMode="decimal"
          placeholder="120.000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={f.amount}
          hint={amountCents ? formatMoney(amountCents) : "En pesos"}
        />
      </div>

      {/* Categoría */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-graphite/80">Categoría</legend>
        <input type="hidden" name="category_id" value={categoryId} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {categories.map((c, i) => (
            <button
              type="button"
              key={c.id}
              onClick={() => { setCategoryId(c.id); setSubcategoryId(""); }}
              aria-pressed={categoryId === c.id}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl p-2 pr-3 text-left text-[13px] leading-tight font-semibold ring-1 transition",
                categoryId === c.id ? "bg-white ring-2 ring-graphite" : "bg-white/50 ring-graphite/10 hover:bg-white",
              )}
            >
              <CategoryIcon icon={c.icon} index={i} size="sm" />
              {c.name}
            </button>
          ))}
        </div>
        {f.category_id && <p className="mt-1.5 text-sm text-rose-dark">{f.category_id}</p>}

        {selectedCategory && selectedCategory.children.length > 0 && (
          <div className="mt-3">
            <input type="hidden" name="subcategory_id" value={subcategoryId} />
            <p className="mb-2 text-xs font-semibold text-graphite/55">Subcategoría (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {selectedCategory.children.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSubcategoryId(subcategoryId === s.id ? "" : s.id)}
                  aria-pressed={subcategoryId === s.id}
                  className={cn(
                    "h-9 rounded-full px-3.5 text-sm font-semibold transition",
                    subcategoryId === s.id ? "bg-graphite text-cream" : "bg-white/70 text-graphite/70 ring-1 ring-graphite/10",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      {/* Quién pagó */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-graphite/80">¿Quién adelantó la plata?</legend>
        <input type="hidden" name="paid_by" value={paidBy} />
        {hasPayments && (
          <p className="mb-2 text-xs text-graphite/55">No se puede cambiar porque ya hay pagos registrados.</p>
        )}
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {selectable.map((m) => (
            <button
              type="button"
              key={m.id}
              disabled={hasPayments && m.id !== paidBy}
              onClick={() => setPaidBy(m.id)}
              aria-pressed={paidBy === m.id}
              className={cn(
                "flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold transition disabled:opacity-35",
                paidBy === m.id ? "bg-white ring-2 ring-graphite" : "hover:bg-white/60",
              )}
            >
              <MemberAvatar m={m} size="md" />
              <span className="w-full truncate px-1 text-center">{m.id === meId ? "Yo" : displayName(m)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Participantes */}
      <fieldset>
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-sm font-semibold text-graphite/80">¿Quiénes participaron?</legend>
          <button
            type="button"
            onClick={() => setParticipants(participants.length === allActive.length ? [] : allActive)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-dark"
          >
            <Users className="size-3.5" /> {participants.length === allActive.length ? "Ninguna" : "Todas"}
          </button>
        </div>
        <p className="mb-3 text-xs text-graphite/55">
          Elegí solo a quienes consumieron. Quien pagó puede no estar incluida.
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {selectable.map((m) => {
            const on = participants.includes(m.id);
            return (
              <label key={m.id} className="relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold">
                <input type="checkbox" name="participants" value={m.id} checked={on} onChange={() => toggle(m.id)} className="peer sr-only" />
                <span className={cn("rounded-full ring-offset-2 ring-offset-cream transition peer-focus-visible:ring-2 peer-focus-visible:ring-rose", on ? "ring-2 ring-graphite" : "opacity-45 grayscale")}>
                  <MemberAvatar m={m} size="md" />
                </span>
                {on && (
                  <span className="absolute top-1 right-2 inline-flex size-5 items-center justify-center rounded-full bg-graphite text-cream">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
                <span className={cn("w-full truncate text-center", !on && "text-graphite/50")}>{m.id === meId ? "Yo" : displayName(m)}</span>
              </label>
            );
          })}
        </div>
        {f.participants && <p className="mt-1.5 text-sm text-rose-dark">{f.participants}</p>}
      </fieldset>

      {/* División */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-graphite/80">División</legend>
        <input type="hidden" name="split_type" value={split} />
        <div className="mb-4 inline-flex rounded-full bg-white/70 p-1 ring-1 ring-graphite/10">
          {(["equal", "custom"] as const).map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setSplit(s)}
              className={cn("h-9 rounded-full px-4 text-sm font-semibold transition", split === s ? "bg-graphite text-cream" : "text-graphite/60")}
            >
              {s === "equal" ? "Igualitaria" : "Personalizada"}
            </button>
          ))}
        </div>

        {participants.length === 0 ? (
          <p className="text-sm text-graphite/55">Elegí participantes para ver la división.</p>
        ) : split === "equal" ? (
          <ul className="divide-y divide-graphite/5 rounded-2xl bg-white/60">
            {selectable.filter((m) => participants.includes(m.id)).map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2"><MemberAvatar m={m} />{m.id === meId ? "Yo" : displayName(m)}</span>
                <span className="font-semibold tabular-nums">{preview.has(m.id) ? formatMoney(preview.get(m.id)!) : "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="divide-y divide-graphite/5 rounded-2xl bg-white/60">
              {selectable.filter((m) => participants.includes(m.id)).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><MemberAvatar m={m} /><span className="truncate">{m.id === meId ? "Yo" : displayName(m)}</span></span>
                  <input
                    name={`share_${m.id}`}
                    inputMode="decimal"
                    placeholder="0"
                    value={custom[m.id] ?? ""}
                    onChange={(e) => setCustom({ ...custom, [m.id]: e.target.value })}
                    aria-label={`Parte de ${displayName(m)}`}
                    className="h-10 w-32 rounded-xl border border-graphite/10 bg-white px-3 text-right tabular-nums outline-none focus:border-rose focus:ring-4 focus:ring-rose/15"
                  />
                </li>
              ))}
            </ul>
            <p className={cn("mt-2 text-sm font-semibold", remaining === 0 ? "text-graphite/60" : "text-rose-dark")}>
              {amountCents
                ? remaining === 0
                  ? "✓ Las partes suman exactamente el total"
                  : remaining > 0
                    ? `Faltan asignar ${formatMoney(remaining)}`
                    : `Te pasaste por ${formatMoney(-remaining)}`
                : "Ingresá el importe total"}
            </p>
          </>
        )}
        {f.shares && <p className="mt-1.5 text-sm text-rose-dark">{f.shares}</p>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-semibold text-graphite/80">Descripción <span className="font-normal text-graphite/50">(opcional)</span></label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={initial?.description ?? ""}
          placeholder="Qué compraron, dónde fue…"
          className="rounded-2xl border border-graphite/10 bg-white/70 px-4 py-3 text-base outline-none focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15"
        />
      </div>

      {mode === "edit" && (
        <Field label="Motivo del cambio" name="reason" placeholder="Ej: faltaba el hielo" hint="Opcional. Queda en la auditoría." maxLength={200} />
      )}

      <Button type="submit" disabled={pending} className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-lg shadow-graphite/20 lg:bottom-6">
        {pending ? "Guardando…" : mode === "create" ? "Guardar juntada" : "Guardar cambios"}
      </Button>
    </form>
  );
}
