import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Dataset, Filters, StatExpense, StatShare } from "./compute";

type Q = { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> };

/** Trae todas las filas paginando de a 1000 (límite por defecto de Supabase). */
async function fetchAll<T>(build: () => Q): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await build().range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Todas las juntadas activas y sus partes. Los filtros se aplican en compute.ts. */
export const loadDataset = cache(async (): Promise<Dataset> => {
  const supabase = await createClient();
  const [expenses, shares, { data: categories }, { data: members }] = await Promise.all([
    fetchAll<StatExpense>(() =>
      supabase.from("expenses")
        .select("id, title, occurred_on, category_id, subcategory_id, base_amount_cents, fx_rate, paid_by, created_by")
        .eq("status", "active").order("occurred_on") as unknown as Q),
    fetchAll<StatShare>(() =>
      supabase.from("v_share_balances")
        .select("expense_id, member_id, amount_cents, is_participant, is_payer, outstanding_cents")
        .order("share_id") as unknown as Q),
    supabase.from("categories").select("id, parent_id, code, name"),
    supabase.from("profiles").select("id, status").in("status", ["active", "inactive"]),
  ]);
  return {
    expenses: expenses.map((e) => ({ ...e, base_amount_cents: Number(e.base_amount_cents), fx_rate: Number(e.fx_rate) })),
    shares: shares.map((s) => ({ ...s, amount_cents: Number(s.amount_cents), outstanding_cents: Number(s.outstanding_cents) })),
    categories: categories ?? [],
    members: members ?? [],
  };
});

export type PeriodParams = { anio?: string; mes?: string; desde?: string; hasta?: string; categoria?: string; integrante?: string };

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Traduce los parámetros de la URL a filtros + descripción del período. */
export function parsePeriod(sp: PeriodParams, today: string): { filters: Filters; label: string; from?: string; to?: string } {
  let from: string | undefined;
  let to: string | undefined;
  let label = "Todo el historial";
  if (isDate(sp.desde) || isDate(sp.hasta)) {
    from = isDate(sp.desde) ? sp.desde : undefined;
    to = isDate(sp.hasta) ? sp.hasta : undefined;
    label = "Período personalizado";
  } else if (sp.anio && /^\d{4}$/.test(sp.anio)) {
    const y = Number(sp.anio);
    const m = Number(sp.mes);
    if (m >= 1 && m <= 12) {
      const mm = String(m).padStart(2, "0");
      from = `${y}-${mm}-01`;
      to = `${y}-${mm}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`;
      label = "Mes";
    } else {
      from = `${y}-01-01`;
      to = `${y}-12-31`;
      label = `Año ${y}`;
    }
  }
  // El promedio mensual no debe contar meses futuros del año en curso.
  if (to && to > today) to = today;
  return {
    filters: { from, to, categoryId: sp.categoria || undefined, memberId: sp.integrante || undefined },
    label,
    from,
    to,
  };
}
