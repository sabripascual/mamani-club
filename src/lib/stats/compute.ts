/**
 * Estadísticas de MAMANÍ CLUB, calculadas SOLO con registros reales.
 * Funciones puras (sin base de datos) para poder testearlas.
 *
 * Reglas:
 *  - Cada juntada (gasto activo) cuenta UNA vez, sin importar cuántos pagos tenga.
 *  - Participación = juntadas en las que participó / juntadas del período.
 *  - Los importes se agregan en moneda base (ARS) usando la conversión guardada en
 *    cada gasto; nunca se suman monedas distintas sin esa conversión.
 *  - Adelantado (lo que pagó por el grupo) y consumo (su parte) van separados.
 */

export type StatExpense = {
  id: string;
  title: string;
  occurred_on: string; // YYYY-MM-DD
  category_id: string;
  subcategory_id: string | null;
  base_amount_cents: number;
  fx_rate: number;
  paid_by: string;
  created_by: string;
};

export type StatShare = {
  expense_id: string;
  member_id: string;
  amount_cents: number; // moneda del gasto
  is_participant: boolean;
  is_payer: boolean;
  outstanding_cents: number; // moneda del gasto
};

export type StatCategory = { id: string; parent_id: string | null; code: string | null; name: string };
export type StatMember = { id: string; status: string };

export type Dataset = {
  expenses: StatExpense[];
  shares: StatShare[];
  categories: StatCategory[];
  members: StatMember[];
};

export type Filters = { from?: string; to?: string; categoryId?: string; memberId?: string };

const toBase = (cents: number, rate: number) => Math.round(cents * rate);

/** Aplica filtros de período, categoría e integrante (juntadas en que participó). */
export function filterDataset(ds: Dataset, f: Filters): Dataset {
  const participantsOf = new Map<string, Set<string>>();
  for (const s of ds.shares) {
    if (!s.is_participant) continue;
    if (!participantsOf.has(s.expense_id)) participantsOf.set(s.expense_id, new Set());
    participantsOf.get(s.expense_id)!.add(s.member_id);
  }
  const expenses = ds.expenses.filter(
    (e) =>
      (!f.from || e.occurred_on >= f.from) &&
      (!f.to || e.occurred_on <= f.to) &&
      (!f.categoryId || e.category_id === f.categoryId) &&
      (!f.memberId || participantsOf.get(e.id)?.has(f.memberId)),
  );
  const ids = new Set(expenses.map((e) => e.id));
  return { ...ds, expenses, shares: ds.shares.filter((s) => ids.has(s.expense_id)) };
}

/** Cantidad de meses calendario entre dos fechas, ambos inclusive. */
export function monthsBetween(from: string, to: string) {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

export function financialSummary(ds: Dataset, period?: { from?: string; to?: string }) {
  const rate = new Map(ds.expenses.map((e) => [e.id, e.fx_rate]));
  const total = ds.expenses.reduce((a, e) => a + e.base_amount_cents, 0);
  const count = ds.expenses.length;
  let pending = 0;
  let owed = 0;
  for (const s of ds.shares) {
    if (s.is_payer) continue;
    const r = rate.get(s.expense_id) ?? 1;
    owed += toBase(s.amount_cents, r);
    if (s.outstanding_cents > 0) pending += toBase(s.outstanding_cents, r);
  }
  const dates = ds.expenses.map((e) => e.occurred_on).sort();
  const from = period?.from ?? dates[0];
  const to = period?.to ?? dates[dates.length - 1];
  const months = count && from && to ? monthsBetween(from, to) : 0;
  return {
    totalCents: total,
    count,
    avgPerExpenseCents: count ? Math.round(total / count) : 0,
    monthsInPeriod: months,
    avgPerMonthCents: months ? Math.round(total / months) : 0,
    /** Plata adelantada por quienes pagaron para cubrir el consumo de las demás. */
    advancedForOthersCents: owed,
    pendingCents: pending,
    settledCents: Math.max(0, owed - pending),
  };
}

export function byMonth(ds: Dataset) {
  const m = new Map<string, { key: string; totalCents: number; count: number }>();
  for (const e of ds.expenses) {
    const key = e.occurred_on.slice(0, 7);
    const row = m.get(key) ?? { key, totalCents: 0, count: 0 };
    row.totalCents += e.base_amount_cents;
    row.count += 1;
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Serie mensual continua (incluye meses sin juntadas, en 0) entre dos fechas. */
export function monthlySeries(ds: Dataset, from: string, to: string) {
  const data = new Map(byMonth(ds).map((r) => [r.key, r]));
  const out: { key: string; totalCents: number; count: number }[] = [];
  let [y, mo] = from.split("-").map(Number);
  const [ye, me] = to.split("-").map(Number);
  while (y < ye || (y === ye && mo <= me)) {
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    out.push(data.get(key) ?? { key, totalCents: 0, count: 0 });
    mo++;
    if (mo > 12) { mo = 1; y++; }
  }
  return out;
}

export function byCategory(ds: Dataset) {
  const names = new Map(ds.categories.map((c) => [c.id, c.name]));
  const m = new Map<string, { id: string; name: string; totalCents: number; count: number }>();
  for (const e of ds.expenses) {
    const row = m.get(e.category_id) ?? { id: e.category_id, name: names.get(e.category_id) ?? "Sin categoría", totalCents: 0, count: 0 };
    row.totalCents += e.base_amount_cents;
    row.count += 1;
    m.set(e.category_id, row);
  }
  return [...m.values()].sort((a, b) => b.totalCents - a.totalCents || b.count - a.count);
}

export function topExpenses(ds: Dataset, n = 5) {
  return [...ds.expenses].sort((a, b) => b.base_amount_cents - a.base_amount_cents).slice(0, n);
}

export type MemberStat = {
  memberId: string;
  participations: number;
  participationRate: number; // 0..1
  advancedCents: number; // pagó por el grupo (total de las juntadas que pagó)
  timesPaid: number;
  consumedCents: number; // su parte
  avgConsumedCents: number;
  created: number;
  pendingCents: number; // lo que debe hoy de las juntadas del período
  fiestas: number;
  tercerTiempo: number;
  deportes: number;
};

/** Integrantes que corresponde considerar: activas + quienes tengan actividad en el período. */
function relevantMembers(ds: Dataset) {
  const active = new Set(ds.members.filter((m) => m.status === "active").map((m) => m.id));
  for (const s of ds.shares) if (s.is_participant) active.add(s.member_id);
  for (const e of ds.expenses) { active.add(e.paid_by); active.add(e.created_by); }
  return [...active];
}

export function memberStats(ds: Dataset): MemberStat[] {
  const catByCode = new Map(ds.categories.filter((c) => c.code).map((c) => [c.code!, c.id]));
  const fiestas = catByCode.get("fiestas");
  const deportes = catByCode.get("deportes");
  const tercer = catByCode.get("tercer_tiempo");
  const exp = new Map(ds.expenses.map((e) => [e.id, e]));
  const total = ds.expenses.length;

  const stats = new Map<string, MemberStat>(
    relevantMembers(ds).map((id) => [id, {
      memberId: id, participations: 0, participationRate: 0, advancedCents: 0, timesPaid: 0, consumedCents: 0,
      avgConsumedCents: 0, created: 0, pendingCents: 0, fiestas: 0, tercerTiempo: 0, deportes: 0,
    }]),
  );

  // Participación: una por juntada (la parte es única por integrante y juntada).
  const seen = new Set<string>();
  for (const s of ds.shares) {
    const e = exp.get(s.expense_id);
    const st = stats.get(s.member_id);
    if (!e || !st) continue;
    if (!s.is_payer && s.outstanding_cents > 0) st.pendingCents += toBase(s.outstanding_cents, e.fx_rate);
    if (!s.is_participant) continue;
    const key = `${s.expense_id}:${s.member_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    st.participations += 1;
    st.consumedCents += toBase(s.amount_cents, e.fx_rate);
    if (fiestas && e.category_id === fiestas) st.fiestas += 1;
    if (deportes && e.category_id === deportes) st.deportes += 1;
    if (tercer && e.subcategory_id === tercer) st.tercerTiempo += 1;
  }
  for (const e of ds.expenses) {
    const p = stats.get(e.paid_by);
    if (p) { p.advancedCents += e.base_amount_cents; p.timesPaid += 1; }
    const c = stats.get(e.created_by);
    if (c) c.created += 1;
  }
  for (const st of stats.values()) {
    st.participationRate = total ? st.participations / total : 0;
    st.avgConsumedCents = st.participations ? Math.round(st.consumedCents / st.participations) : 0;
  }
  return [...stats.values()];
}

export type Ranking = {
  key: string;
  title: string;
  description: string;
  unit: "count" | "money" | "percent";
  /** Ordenado de mayor a menor (o menor a mayor si `ascending`). */
  rows: { memberId: string; value: number; detail?: string }[];
  /** Quiénes empatan en el primer puesto. Vacío si no hay datos suficientes. */
  winners: string[];
};

type RankDef = {
  key: string; title: string; description: string; unit: Ranking["unit"];
  value: (s: MemberStat) => number; ascending?: boolean; minTotal?: number;
  detail?: (s: MemberStat, total: number) => string;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const RANKING_DEFS: RankDef[] = [
  { key: "presente", title: "La más presente", description: "Mayor porcentaje de juntadas en las que participó.", unit: "percent",
    value: (s) => s.participationRate, detail: (s, t) => `${s.participations} de ${t} juntadas` },
  { key: "ausente", title: "La más ausente", description: "Menor porcentaje de participación.", unit: "percent", ascending: true, minTotal: 3,
    value: (s) => s.participationRate, detail: (s, t) => `${s.participations} de ${t} juntadas` },
  { key: "fiestera", title: "La más fiestera", description: "Más juntadas de “Fiestas y salidas”.", unit: "count", value: (s) => s.fiestas },
  { key: "tercer_tiempo", title: "La reina del tercer tiempo", description: "Más juntadas de “Tercer tiempo”.", unit: "count", value: (s) => s.tercerTiempo },
  { key: "deportiva", title: "La más deportista", description: "Más juntadas de “Deportes y terceros tiempos”.", unit: "count", value: (s) => s.deportes },
  { key: "adelanto", title: "La que más plata adelantó", description: "Total pagado por el grupo (no es su consumo).", unit: "money",
    value: (s) => s.advancedCents, detail: (s) => `pagó ${s.timesPaid} ${s.timesPaid === 1 ? "vez" : "veces"}` },
  { key: "gastadora", title: "La más gastadora", description: "Mayor consumo personal (su parte en cada juntada).", unit: "money", value: (s) => s.consumedCents },
  { key: "creadora", title: "La que más gastos cargó", description: "Juntadas registradas por ella en la app.", unit: "count", value: (s) => s.created },
  { key: "promedio", title: "La que más consumió en promedio", description: "Consumo promedio por juntada en la que participó.", unit: "money",
    value: (s) => s.avgConsumedCents, detail: (s) => `${s.participations} juntadas` },
  { key: "deudora", title: "La que más deudas pendientes tiene", description: "Lo que debe hoy de las juntadas del período.", unit: "money", value: (s) => s.pendingCents },
];

/**
 * Arma los rankings. No inventa ganadoras: si nadie tiene un valor > 0 (o en
 * "ausente", si hay pocas juntadas para que el dato signifique algo) queda sin ganadora.
 */
export function rankings(stats: MemberStat[], totalExpenses: number): Ranking[] {
  return RANKING_DEFS.map((d) => {
    const rows = stats
      .map((s) => ({ memberId: s.memberId, value: d.value(s), detail: d.detail?.(s, totalExpenses) }))
      .sort((a, b) => (d.ascending ? a.value - b.value : b.value - a.value) || a.memberId.localeCompare(b.memberId));
    const enough = totalExpenses > 0 && totalExpenses >= (d.minTotal ?? 1);
    const top = rows[0]?.value ?? 0;
    // "De más": hay ganadora si el máximo es > 0 (empates = varias ganadoras).
    // "De menos" (ausente): solo si no son todas iguales; si no, no hay a quién señalar.
    const allEqual = rows.every((r) => r.value === top);
    const meaningful = enough && (d.ascending ? !allEqual : top > 0);
    const winners = meaningful ? rows.filter((r) => r.value === top).map((r) => r.memberId) : [];
    return { key: d.key, title: d.title, description: d.description, unit: d.unit, rows, winners };
  });
}

/** Indicadores sociales del período. */
export function socialSummary(ds: Dataset, stats: MemberStat[]) {
  const total = ds.expenses.length;
  const considered = stats.filter((s) => ds.members.find((m) => m.id === s.memberId)?.status === "active" || s.participations > 0);
  const avgRate = considered.length ? considered.reduce((a, s) => a + s.participationRate, 0) / considered.length : 0;
  const sortedByRate = [...considered].sort((a, b) => b.participationRate - a.participationRate);
  const top = sortedByRate[0];
  const bottom = sortedByRate[sortedByRate.length - 1];
  const months = byMonth(ds).sort((a, b) => b.count - a.count || b.key.localeCompare(a.key));
  const cats = byCategory(ds).sort((a, b) => b.count - a.count || b.totalCents - a.totalCents);
  const avgParticipants = total ? ds.shares.filter((s) => s.is_participant).length / total : 0;
  return {
    count: total,
    avgParticipationRate: avgRate,
    avgParticipants,
    mostPresent: top && top.participations > 0 ? { ids: considered.filter((s) => s.participationRate === top.participationRate).map((s) => s.memberId), rate: top.participationRate } : null,
    leastPresent: bottom && total >= 3 && bottom.participationRate !== top?.participationRate
      ? { ids: considered.filter((s) => s.participationRate === bottom.participationRate).map((s) => s.memberId), rate: bottom.participationRate } : null,
    busiestMonth: months[0] ? { key: months[0].key, count: months[0].count, tied: months.filter((m) => m.count === months[0].count).length > 1 } : null,
    topCategory: cats[0] ? { name: cats[0].name, count: cats[0].count } : null,
  };
}

export { pct };
