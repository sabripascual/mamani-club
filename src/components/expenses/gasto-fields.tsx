"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Users } from "lucide-react";
import type { CategoryTree, Member } from "@/lib/expenses/types";
import { centsToInput, formatMoney, parseMoney } from "@/lib/money/format";
import { equalSplit } from "@/lib/money/split";
import { cn, displayName } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { CategoryIcon } from "./category-icon";
import { MemberAvatar } from "./member-avatar";

export type GastoInitial = {
  title: string;
  category_id: string;
  subcategory_id: string | null;
  description: string | null;
  amount_cents: number;
  paid_by: string;
  split_type: "equal" | "custom";
  shares: { member_id: string; amount_cents: number }[];
};

/**
 * Campos de un gasto. `prefix` permite usarlos dentro del formulario de juntada
 * (primer gasto) sin chocar nombres. Las participantes arrancan con las asistentes.
 */
export function GastoFields({
  prefix = "", categories, members, meId, defaultParticipants = [], initial, errors = {},
}: {
  prefix?: string;
  categories: CategoryTree;
  members: Member[];
  meId: string;
  defaultParticipants?: string[];
  initial?: GastoInitial;
  errors?: Partial<Record<string, string>>;
}) {
  const n = (k: string) => `${prefix}${k}`;
  const f = (k: string) => errors[n(k)];
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategory_id ?? "");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amount_cents) : "");
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? meId);
  const [participants, setParticipants] = useState<string[]>(initial?.shares.map((s) => s.member_id) ?? defaultParticipants);
  const [split, setSplit] = useState<"equal" | "custom">(initial?.split_type ?? "equal");
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries((initial?.shares ?? []).map((s) => [s.member_id, centsToInput(s.amount_cents)])),
  );

  // Para elegir: activas + desactivadas que ya estaban.
  const selectable = useMemo(
    () => members.filter((m) => m.status === "active" || participants.includes(m.id) || m.id === paidBy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members],
  );
  const amountCents = parseMoney(amount);
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const selectedSub = selectedCategory?.children.find((c) => c.id === subcategoryId);
  const preview = amountCents ? equalSplit(amountCents, participants) : new Map<string, number>();
  const customSum = participants.reduce((acc, id) => acc + (custom[id]?.trim() === "0" ? 0 : (parseMoney(custom[id] ?? "") ?? 0)), 0);
  const remaining = (amountCents ?? 0) - customSum;
  // Mientras no se toquen a mano, las participantes siguen a las asistentes de la juntada.
  const [touched, setTouched] = useState(!!initial);
  const defaultsKey = defaultParticipants.join(",");
  useEffect(() => {
    if (!touched) setParticipants(defaultsKey ? defaultsKey.split(",") : []);
  }, [defaultsKey, touched]);
  const toggle = (id: string) => {
    setTouched(true);
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const allActive = selectable.filter((m) => m.status === "active").map((m) => m.id);
  const label = (m: Member) => (m.id === meId ? "Yo" : displayName(m));

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-graphite/80">¿Qué se compró?</legend>
        <input type="hidden" name={n("category_id")} value={categoryId} />
        {/* El nombre del gasto es la subcategoría elegida (o la categoría si no tiene). */}
        <input type="hidden" name={n("title")} value={selectedSub?.name ?? (selectedCategory && selectedCategory.children.length === 0 ? selectedCategory.name : "")} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {categories.map((c, i) => (
            <button type="button" key={c.id} onClick={() => { setCategoryId(c.id); setSubcategoryId(""); }} aria-pressed={categoryId === c.id}
              className={cn("flex items-center gap-2.5 rounded-2xl p-2 pr-3 text-left text-[13px] leading-tight font-semibold ring-1 transition",
                categoryId === c.id ? "bg-white ring-2 ring-graphite" : "bg-white/50 ring-graphite/10 hover:bg-white")}>
              <CategoryIcon icon={c.icon} index={i} size="sm" />
              {c.name}
            </button>
          ))}
        </div>
        {f("category_id") && <p className="mt-1.5 text-sm text-rose-dark">{f("category_id")}</p>}
        {selectedCategory && selectedCategory.children.length > 0 && (
          <div className="mt-3 rounded-2xl bg-white/50 p-3 ring-1 ring-graphite/5">
            <input type="hidden" name={n("subcategory_id")} value={subcategoryId} />
            <p className={cn("mb-2 text-sm font-semibold", !subcategoryId ? "text-rose-dark" : "text-graphite/70")}>
              {subcategoryId ? `${selectedCategory.name} ›` : `Elegí qué fue de ${selectedCategory.name.toLowerCase()}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedCategory.children.map((sc) => (
                <button type="button" key={sc.id} onClick={() => setSubcategoryId(sc.id)} aria-pressed={subcategoryId === sc.id}
                  className={cn("h-10 rounded-full px-4 text-sm font-semibold transition",
                    subcategoryId === sc.id ? "bg-graphite text-cream" : "bg-white text-graphite/75 ring-1 ring-graphite/10")}>
                  {sc.name}
                </button>
              ))}
            </div>
            {(f("subcategory_id") || f("title")) && <p className="mt-2 text-sm text-rose-dark">{f("subcategory_id") ?? "Elegí la subcategoría"}</p>}
          </div>
        )}
      </fieldset>

      <Field
        label="Importe"
        name={n("amount")}
        inputMode="decimal"
        placeholder="120.000"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={f("amount")}
        hint={amountCents ? formatMoney(amountCents) : "En pesos"}
        className="max-w-xs"
      />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-graphite/80">¿Quién pagó este gasto?</legend>
        <input type="hidden" name={n("paid_by")} value={paidBy} />
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {selectable.map((m) => (
            <button type="button" key={m.id} onClick={() => setPaidBy(m.id)} aria-pressed={paidBy === m.id}
              className={cn("flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold transition",
                paidBy === m.id ? "bg-white ring-2 ring-graphite" : "hover:bg-white/60")}>
              <MemberAvatar m={m} size="md" />
              <span className="w-full truncate px-1 text-center">{label(m)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-sm font-semibold text-graphite/80">¿Entre quiénes se divide?</legend>
          <button type="button" onClick={() => { setTouched(true); setParticipants(participants.length === allActive.length ? [] : allActive); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-dark">
            <Users className="size-3.5" /> {participants.length === allActive.length ? "Ninguna" : "Todas"}
          </button>
        </div>
        <p className="mb-3 text-xs text-graphite/55">Solo quienes consumieron este gasto. Quien pagó puede no estar incluida.</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {selectable.map((m) => {
            const on = participants.includes(m.id);
            return (
              <label key={m.id} className="relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold">
                <input type="checkbox" name={n("participants")} value={m.id} checked={on} onChange={() => toggle(m.id)} className="peer sr-only" />
                <span className={cn("rounded-full ring-offset-2 ring-offset-cream transition peer-focus-visible:ring-2 peer-focus-visible:ring-rose", on ? "ring-2 ring-graphite" : "opacity-45 grayscale")}>
                  <MemberAvatar m={m} size="md" />
                </span>
                {on && <span className="absolute top-1 right-2 inline-flex size-5 items-center justify-center rounded-full bg-graphite text-cream"><Check className="size-3" strokeWidth={3} /></span>}
                <span className={cn("w-full truncate text-center", !on && "text-graphite/50")}>{label(m)}</span>
              </label>
            );
          })}
        </div>
        {f("participants") && <p className="mt-1.5 text-sm text-rose-dark">{f("participants")}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-graphite/80">División</legend>
        <input type="hidden" name={n("split_type")} value={split} />
        <div className="mb-4 inline-flex rounded-full bg-white/70 p-1 ring-1 ring-graphite/10">
          {(["equal", "custom"] as const).map((s) => (
            <button type="button" key={s} onClick={() => setSplit(s)}
              className={cn("h-9 rounded-full px-4 text-sm font-semibold transition", split === s ? "bg-graphite text-cream" : "text-graphite/60")}>
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
                <span className="flex items-center gap-2"><MemberAvatar m={m} />{label(m)}</span>
                <span className="font-semibold tabular-nums">{preview.has(m.id) ? formatMoney(preview.get(m.id)!) : "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="divide-y divide-graphite/5 rounded-2xl bg-white/60">
              {selectable.filter((m) => participants.includes(m.id)).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><MemberAvatar m={m} /><span className="truncate">{label(m)}</span></span>
                  <input name={n(`share_${m.id}`)} inputMode="decimal" placeholder="0" value={custom[m.id] ?? ""}
                    onChange={(e) => setCustom({ ...custom, [m.id]: e.target.value })} aria-label={`Parte de ${displayName(m)}`}
                    className="h-10 w-32 rounded-xl border border-graphite/10 bg-white px-3 text-right tabular-nums outline-none focus:border-rose focus:ring-4 focus:ring-rose/15" />
                </li>
              ))}
            </ul>
            <p className={cn("mt-2 text-sm font-semibold", remaining === 0 ? "text-graphite/60" : "text-rose-dark")}>
              {amountCents ? (remaining === 0 ? "✓ Las partes suman exactamente el total" : remaining > 0 ? `Faltan asignar ${formatMoney(remaining)}` : `Te pasaste por ${formatMoney(-remaining)}`) : "Ingresá el importe"}
            </p>
          </>
        )}
        {f("shares") && <p className="mt-1.5 text-sm text-rose-dark">{f("shares")}</p>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
          <label htmlFor={n("description")} className="text-sm font-semibold text-graphite/80">Detalle <span className="font-normal text-graphite/50">(opcional)</span></label>
          <textarea id={n("description")} name={n("description")} rows={2} maxLength={500} defaultValue={initial?.description ?? ""} placeholder="Ej: 3 kg de vacío y chorizos"
            className="rounded-2xl border border-graphite/10 bg-white/70 px-4 py-3 text-base outline-none focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15" />
        </div>
    </div>
  );
}
