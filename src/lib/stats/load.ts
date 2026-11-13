import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Dataset, Filters, StatAttendee, StatGasto, StatJuntada, StatNet, StatDebtReminder, StatRsvp, StatSettlement, StatShare } from "./compute";

const AR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

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

/** Juntadas activas con sus gastos, partes, asistentes, saldos y transferencias. Los filtros se aplican en compute.ts. */
export const loadDataset = cache(async (): Promise<Dataset> => {
  const supabase = await createClient();
  const [juntadas, gastos, shares, attendees, nets, settlements, { data: categories }, { data: members }, events, rsvps, debtReminders] = await Promise.all([
    fetchAll<StatJuntada>(() => supabase.from("juntadas").select("id, title, occurred_on, type_id, created_by").eq("status", "active").order("occurred_on") as unknown as Q),
    fetchAll<StatGasto>(() => supabase.from("expenses").select("id, juntada_id, category_id, base_amount_cents, fx_rate, paid_by, created_by").eq("status", "active").order("id") as unknown as Q),
    fetchAll<StatShare>(() => supabase.from("expense_shares").select("expense_id, member_id, amount_cents, is_participant, guest_name").order("id") as unknown as Q),
    fetchAll<StatAttendee>(() => supabase.from("juntada_attendees").select("juntada_id, member_id").order("juntada_id") as unknown as Q),
    fetchAll<StatNet>(() => supabase.from("v_juntada_member_balances").select("juntada_id, member_id, net_cents").neq("net_cents", 0).order("juntada_id") as unknown as Q),
    fetchAll<StatSettlement>(() => supabase.from("settlements").select("juntada_id, amount_cents, from_member").eq("status", "active").order("id") as unknown as Q),
    supabase.from("categories").select("id, parent_id, code, name, kind"),
    supabase.from("profiles").select("id, status").in("status", ["active", "inactive"]),
    // Solo eventos que ya pasaron: a uno futuro todavía se puede responder.
    fetchAll<{ id: string; starts_at: string; type_id: string | null }>(() => supabase.from("events").select("id, starts_at, type_id").eq("status", "active").lte("starts_at", new Date().toISOString()).order("id") as unknown as Q),
    fetchAll<StatRsvp>(() => supabase.from("event_rsvps").select("event_id, member_id, response").order("event_id") as unknown as Q),
    // Avisos de deuda enviados (para "El roedor"); el historial completo solo lo ven las admins.
    fetchAll<StatDebtReminder>(() => supabase.rpc("debt_reminders_sent").order("sent_on") as unknown as Q),
  ]);
  // Solo gastos de juntadas activas (los de juntadas anuladas también quedan anulados, pero por las dudas).
  const active = new Set(juntadas.map((j) => j.id));
  const g = gastos.filter((x) => active.has(x.juntada_id)).map((x) => ({ ...x, base_amount_cents: Number(x.base_amount_cents), fx_rate: Number(x.fx_rate) }));
  const gIds = new Set(g.map((x) => x.id));
  return {
    juntadas,
    gastos: g,
    shares: shares.filter((x) => gIds.has(x.expense_id)).map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
    attendees: attendees.filter((a) => active.has(a.juntada_id)),
    nets: nets.map((n) => ({ ...n, net_cents: Number(n.net_cents) })),
    settlements: settlements.filter((x) => active.has(x.juntada_id)).map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
    events: events.map((e) => ({ id: e.id, day: AR.format(new Date(e.starts_at)), type_id: e.type_id })),
    rsvps,
    debtReminders,
    categories: categories ?? [],
    members: members ?? [],
  };
});

export type PeriodParams = { anio?: string; mes?: string; desde?: string; hasta?: string; categoria?: string; integrante?: string };

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Traduce los parámetros de la URL a filtros + descripción del período. */
export function parsePeriod(sp: PeriodParams, today: string): { filters: Filters; label: string; from?: string; to?: string } {
  return parseRange(sp, today);
}

/** Inicio: año y mes, con el año y el mes actuales por defecto ("mes=0" = todo el año). */
export function parseYearMonth(sp: PeriodParams, today: string) {
  const year = /^\d{4}$/.test(sp.anio ?? "") ? Number(sp.anio) : Number(today.slice(0, 4));
  const m = sp.mes === undefined || sp.mes === "" ? Number(today.slice(5, 7)) : Number(sp.mes);
  const month = m >= 0 && m <= 12 ? m : Number(today.slice(5, 7));
  const { filters } = parseRange({ anio: String(year), mes: month ? String(month) : "" }, today);
  return { year, month, filters };
}

function parseRange(sp: PeriodParams, today: string): { filters: Filters; label: string; from?: string; to?: string } {
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
    filters: { from, to, typeId: sp.categoria || undefined, memberId: sp.integrante || undefined },
    label,
    from,
    to,
  };
}
