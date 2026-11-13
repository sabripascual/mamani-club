/**
 * Estadísticas de MAMANÍ CLUB, calculadas SOLO con registros reales.
 * Funciones puras (sin base de datos) para poder testearlas.
 *
 * Modelo: una juntada tiene asistentes y gastos; cada gasto, partes por integrante.
 * Reglas:
 *  - Cada juntada cuenta UNA vez. "Estuvo" = asistente de la juntada.
 *  - Participación = juntadas a las que asistió / juntadas del período.
 *  - Importes en moneda base (ARS) con la conversión guardada en cada gasto.
 *  - Adelantado (gastos que pagó) y consumo (sus partes) van separados.
 *  - Lo que se debe sale del saldo neto de cada una en cada juntada.
 *  - Invitadas: su parte NO es consumo ni presencia de la responsable; solo suma al total gastado.
 */

export type StatJuntada = { id: string; title: string; occurred_on: string; type_id: string; created_by: string };
export type StatGasto = {
  id: string;
  juntada_id: string;
  category_id: string;
  base_amount_cents: number;
  fx_rate: number;
  paid_by: string;
  created_by: string;
};
/** `guest_name` con valor = parte de una invitada a cargo de `member_id` (no es consumo de la responsable). */
export type StatShare = { expense_id: string; member_id: string; amount_cents: number; is_participant: boolean; guest_name?: string | null };
export type StatAttendee = { juntada_id: string; member_id: string };
export type StatNet = { juntada_id: string; member_id: string; net_cents: number };
export type StatSettlement = { juntada_id: string; amount_cents: number; from_member?: string };
/** Eventos ya ocurridos (para "No se pierde una" y "Fantasma"). `day` = AAAA-MM-DD en hora AR. */
export type StatEvent = { id: string; day: string; type_id: string | null };
export type StatRsvp = { event_id: string; member_id: string; response: "going" | "maybe" | "no" };
/** Un aviso de deuda enviado ("Perrita deudora!" y siguientes). */
export type StatDebtReminder = { member_id: string; sent_on: string };
export type StatCategory = { id: string; parent_id: string | null; code: string | null; name: string; kind?: string };
export type StatMember = { id: string; status: string };

export type Dataset = {
  juntadas: StatJuntada[];
  gastos: StatGasto[];
  shares: StatShare[];
  attendees: StatAttendee[];
  nets: StatNet[];
  settlements: StatSettlement[];
  events?: StatEvent[];
  rsvps?: StatRsvp[];
  debtReminders?: StatDebtReminder[];
  categories: StatCategory[];
  members: StatMember[];
};

export type Filters = { from?: string; to?: string; typeId?: string; memberId?: string };

const toBase = (cents: number, rate: number) => Math.round(cents * rate);

/** Filtra por período, tipo de juntada e integrante (juntadas a las que asistió). */
export function filterDataset(ds: Dataset, f: Filters): Dataset {
  const attendedBy = new Map<string, Set<string>>();
  for (const a of ds.attendees) {
    if (!attendedBy.has(a.juntada_id)) attendedBy.set(a.juntada_id, new Set());
    attendedBy.get(a.juntada_id)!.add(a.member_id);
  }
  const juntadas = ds.juntadas.filter(
    (j) =>
      (!f.from || j.occurred_on >= f.from) &&
      (!f.to || j.occurred_on <= f.to) &&
      (!f.typeId || j.type_id === f.typeId) &&
      (!f.memberId || attendedBy.get(j.id)?.has(f.memberId)),
  );
  const ids = new Set(juntadas.map((j) => j.id));
  const gastos = ds.gastos.filter((g) => ids.has(g.juntada_id));
  const gIds = new Set(gastos.map((g) => g.id));
  return {
    ...ds,
    juntadas,
    gastos,
    shares: ds.shares.filter((s) => gIds.has(s.expense_id)),
    attendees: ds.attendees.filter((a) => ids.has(a.juntada_id)),
    nets: ds.nets.filter((n) => ids.has(n.juntada_id)),
    settlements: ds.settlements.filter((s) => ids.has(s.juntada_id)),
    ...(() => {
      const events = (ds.events ?? []).filter((e) =>
        (!f.from || e.day >= f.from) && (!f.to || e.day <= f.to) && (!f.typeId || e.type_id === f.typeId));
      const eIds = new Set(events.map((e) => e.id));
      return {
        events, rsvps: (ds.rsvps ?? []).filter((r) => eIds.has(r.event_id)),
        debtReminders: (ds.debtReminders ?? []).filter((r) => (!f.from || r.sent_on >= f.from) && (!f.to || r.sent_on <= f.to)),
      };
    })(),
  };
}

/** Cantidad de meses calendario entre dos fechas, ambos inclusive. */
export function monthsBetween(from: string, to: string) {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

function juntadaTotals(ds: Dataset) {
  const t = new Map<string, number>();
  for (const g of ds.gastos) t.set(g.juntada_id, (t.get(g.juntada_id) ?? 0) + g.base_amount_cents);
  return t;
}

export function financialSummary(ds: Dataset, period?: { from?: string; to?: string }) {
  const total = ds.gastos.reduce((a, g) => a + g.base_amount_cents, 0);
  const count = ds.juntadas.length;
  const gastoById = new Map(ds.gastos.map((g) => [g.id, g]));
  // Lo que pusieron quienes pagaron para cubrir a las demás (sin su propio consumo).
  let advancedForOthers = 0;
  for (const s of ds.shares) {
    const g = gastoById.get(s.expense_id);
    if (g && s.member_id !== g.paid_by) advancedForOthers += toBase(s.amount_cents, g.fx_rate);
  }
  const pending = ds.nets.reduce((a, n) => a + (n.net_cents < 0 ? -n.net_cents : 0), 0);
  const transferred = ds.settlements.reduce((a, s) => a + s.amount_cents, 0);
  const dates = ds.juntadas.map((j) => j.occurred_on).sort();
  const from = period?.from ?? dates[0];
  const to = period?.to ?? dates[dates.length - 1];
  const months = count && from && to ? monthsBetween(from, to) : 0;
  return {
    totalCents: total,
    count,
    gastosCount: ds.gastos.length,
    avgPerExpenseCents: count ? Math.round(total / count) : 0,
    monthsInPeriod: months,
    avgPerMonthCents: months ? Math.round(total / months) : 0,
    advancedForOthersCents: advancedForOthers,
    pendingCents: pending,
    settledCents: transferred,
  };
}

export function byMonth(ds: Dataset) {
  const totals = juntadaTotals(ds);
  const m = new Map<string, { key: string; totalCents: number; count: number }>();
  for (const j of ds.juntadas) {
    const key = j.occurred_on.slice(0, 7);
    const row = m.get(key) ?? { key, totalCents: 0, count: 0 };
    row.totalCents += totals.get(j.id) ?? 0;
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

/** Gasto por CATEGORÍA DE GASTO (en qué se gasta). */
export function byCategory(ds: Dataset) {
  const names = new Map(ds.categories.map((c) => [c.id, c.name]));
  const m = new Map<string, { id: string; name: string; totalCents: number; count: number }>();
  for (const g of ds.gastos) {
    const row = m.get(g.category_id) ?? { id: g.category_id, name: names.get(g.category_id) ?? "Sin categoría", totalCents: 0, count: 0 };
    row.totalCents += g.base_amount_cents;
    row.count += 1;
    m.set(g.category_id, row);
  }
  return [...m.values()].sort((a, b) => b.totalCents - a.totalCents || b.count - a.count);
}

/** Juntadas por TIPO DE JUNTADA (cuántas y cuánto se gastó en cada tipo). */
export function byJuntadaType(ds: Dataset) {
  const names = new Map(ds.categories.map((c) => [c.id, c.name]));
  const totals = juntadaTotals(ds);
  const m = new Map<string, { id: string; name: string; totalCents: number; count: number }>();
  for (const j of ds.juntadas) {
    const row = m.get(j.type_id) ?? { id: j.type_id, name: names.get(j.type_id) ?? "Otro", totalCents: 0, count: 0 };
    row.count += 1;
    row.totalCents += totals.get(j.id) ?? 0;
    m.set(j.type_id, row);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.totalCents - a.totalCents);
}

export function topJuntadas(ds: Dataset, n = 5) {
  const totals = juntadaTotals(ds);
  return [...ds.juntadas]
    .map((j) => ({ ...j, totalCents: totals.get(j.id) ?? 0 }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, n);
}

export type MemberStat = {
  memberId: string;
  participations: number; // juntadas a las que asistió
  participationRate: number; // 0..1
  advancedCents: number; // gastos que pagó
  timesPaid: number;
  consumedCents: number; // sus partes
  avgConsumedCents: number;
  created: number; // gastos que cargó
  pendingCents: number; // lo que debe hoy
  fiestas: number;
  tercerTiempo: number;
  going: number; // eventos en los que puso "Voy"
  paidJuntadas: number; // juntadas en las que registró algún pago (pagó un gasto o transfirió)
  noShows: number; // eventos en los que puso "No voy" o no respondió
  unpaidJuntadas: number; // juntadas sin ningún pago suyo
  debtReminders: number; // notificaciones de deuda que recibió
};

function relevantMembers(ds: Dataset) {
  const set = new Set(ds.members.filter((m) => m.status === "active").map((m) => m.id));
  for (const a of ds.attendees) set.add(a.member_id);
  for (const g of ds.gastos) { set.add(g.paid_by); set.add(g.created_by); }
  return [...set];
}

export function memberStats(ds: Dataset): MemberStat[] {
  const typeByCode = new Map(ds.categories.filter((c) => c.code).map((c) => [c.code!, c.id]));
  const fiestas = typeByCode.get("j_salida");
  const tercer = typeByCode.get("j_tercer_tiempo");
  const juntadaType = new Map(ds.juntadas.map((j) => [j.id, j.type_id]));
  const gastoById = new Map(ds.gastos.map((g) => [g.id, g]));
  const total = ds.juntadas.length;

  const stats = new Map<string, MemberStat>(
    relevantMembers(ds).map((id) => [id, {
      memberId: id, participations: 0, participationRate: 0, advancedCents: 0, timesPaid: 0, consumedCents: 0,
      avgConsumedCents: 0, created: 0, pendingCents: 0, fiestas: 0, tercerTiempo: 0,
      going: 0, paidJuntadas: 0, noShows: 0, unpaidJuntadas: 0, debtReminders: 0,
    }]),
  );

  // Asistencia: una por juntada (la clave es única por juntada e integrante).
  const seen = new Set<string>();
  for (const a of ds.attendees) {
    const st = stats.get(a.member_id);
    const key = `${a.juntada_id}:${a.member_id}`;
    if (!st || seen.has(key) || !juntadaType.has(a.juntada_id)) continue;
    seen.add(key);
    st.participations += 1;
    const t = juntadaType.get(a.juntada_id);
    if (fiestas && t === fiestas) st.fiestas += 1;
    if (tercer && t === tercer) st.tercerTiempo += 1;
  }
  for (const s of ds.shares) {
    if (s.guest_name) continue;
    const g = gastoById.get(s.expense_id);
    const st = stats.get(s.member_id);
    if (g && st) st.consumedCents += toBase(s.amount_cents, g.fx_rate);
  }
  for (const g of ds.gastos) {
    const p = stats.get(g.paid_by);
    if (p) { p.advancedCents += g.base_amount_cents; p.timesPaid += 1; }
    const c = stats.get(g.created_by);
    if (c) c.created += 1;
  }
  for (const n of ds.nets) {
    const st = stats.get(n.member_id);
    if (st && n.net_cents < 0) st.pendingCents += -n.net_cents;
  }
  // Pagos registrados: pagó un gasto o hizo una transferencia en la juntada.
  const paidIn = new Map<string, Set<string>>();
  const markPaid = (m: string, j: string) => paidIn.set(m, (paidIn.get(m) ?? new Set()).add(j));
  for (const g of ds.gastos) markPaid(g.paid_by, g.juntada_id);
  for (const t of ds.settlements) if (t.from_member) markPaid(t.from_member, t.juntada_id);
  const events = ds.events ?? [];
  const answer = new Map((ds.rsvps ?? []).map((r) => [`${r.event_id}:${r.member_id}`, r.response]));
  for (const r of ds.debtReminders ?? []) {
    const st = stats.get(r.member_id);
    if (st) st.debtReminders += 1;
  }
  for (const st of stats.values()) {
    st.paidJuntadas = paidIn.get(st.memberId)?.size ?? 0;
    st.unpaidJuntadas = total - st.paidJuntadas;
    for (const e of events) {
      const r = answer.get(`${e.id}:${st.memberId}`);
      if (r === "going") st.going += 1;
      else if (r === undefined || r === "no") st.noShows += 1;
    }
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
  rows: { memberId: string; value: number; detail?: string }[];
  /** Quiénes empatan en el primer puesto. Vacío si no hay datos suficientes. */
  winners: string[];
};

type RankDef = {
  key: string; title: string; description: string; unit: Ranking["unit"];
  value: (s: MemberStat) => number; ascending?: boolean; minTotal?: number;
  /** Solo hay ganadora si no están todas iguales. */
  needsDifference?: boolean;
  detail?: (s: MemberStat, total: number) => string;
};

export const RANKING_DEFS: RankDef[] = [
  { key: "presente", title: "No se pierde una", description: "Veces que puso “Voy” en un evento + juntadas en las que registró algún pago.", unit: "count",
    value: (s) => s.going + s.paidJuntadas, detail: (s) => `${s.going} “Voy” · ${s.paidJuntadas} juntadas con pagos` },
  { key: "ausente", title: "Fantasma 👻", description: "Eventos en los que puso “No voy” o no respondió + juntadas sin ningún pago suyo.", unit: "count", minTotal: 3, needsDifference: true,
    value: (s) => s.noShows + s.unpaidJuntadas, detail: (s) => `${s.noShows} sin ir o sin responder · ${s.unpaidJuntadas} juntadas sin pagos` },
  { key: "gastadora", title: "De qué vive??", description: "Suma de todos sus gastos registrados (su parte en cada gasto).", unit: "money", value: (s) => s.consumedCents },
  { key: "deudora", title: "El roedor", description: "Notificaciones de deuda que recibió hasta la fecha.", unit: "count", value: (s) => s.debtReminders,
    detail: (s) => `${s.debtReminders} ${s.debtReminders === 1 ? "aviso" : "avisos"} de deuda` },
];

/** No inventa ganadoras: sin datos (o sin diferencia, en "ausente") no hay ganadora. */
export function rankings(stats: MemberStat[], totalJuntadas: number): Ranking[] {
  return RANKING_DEFS.map((d) => {
    const rows = stats
      .map((s) => ({ memberId: s.memberId, value: d.value(s), detail: d.detail?.(s, totalJuntadas) }))
      .sort((a, b) => (d.ascending ? a.value - b.value : b.value - a.value) || a.memberId.localeCompare(b.memberId));
    const enough = totalJuntadas > 0 && totalJuntadas >= (d.minTotal ?? 1);
    const top = rows[0]?.value ?? 0;
    const allEqual = rows.every((r) => r.value === top);
    const meaningful = enough && (d.ascending || d.needsDifference ? !allEqual && (d.ascending || top > 0) : top > 0);
    const winners = meaningful ? rows.filter((r) => r.value === top).map((r) => r.memberId) : [];
    return { key: d.key, title: d.title, description: d.description, unit: d.unit, rows, winners };
  });
}

/** Indicadores sociales del período. */
export function socialSummary(ds: Dataset, stats: MemberStat[]) {
  const total = ds.juntadas.length;
  const considered = stats.filter((s) => ds.members.find((m) => m.id === s.memberId)?.status === "active" || s.participations > 0);
  const avgRate = considered.length ? considered.reduce((a, s) => a + s.participationRate, 0) / considered.length : 0;
  const sorted = [...considered].sort((a, b) => b.participationRate - a.participationRate);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const months = byMonth(ds).sort((a, b) => b.count - a.count || b.key.localeCompare(a.key));
  const types = byJuntadaType(ds);
  return {
    count: total,
    avgParticipationRate: avgRate,
    avgParticipants: total ? ds.attendees.length / total : 0,
    mostPresent: top && top.participations > 0 ? { ids: considered.filter((s) => s.participationRate === top.participationRate).map((s) => s.memberId), rate: top.participationRate } : null,
    leastPresent: bottom && total >= 3 && bottom.participationRate !== top?.participationRate
      ? { ids: considered.filter((s) => s.participationRate === bottom.participationRate).map((s) => s.memberId), rate: bottom.participationRate } : null,
    busiestMonth: months[0] ? { key: months[0].key, count: months[0].count, tied: months.filter((m) => m.count === months[0].count).length > 1 } : null,
    topCategory: types[0] ? { name: types[0].name, count: types[0].count } : null,
  };
}

/** Análisis personal ("Yo"): mismos indicadores, solo con mis números. */
export function personalSummary(ds: Dataset, memberId: string, period?: { from?: string; to?: string }) {
  const jById = new Map(ds.juntadas.map((j) => [j.id, j]));
  const gastoById = new Map(ds.gastos.map((g) => [g.id, g]));
  const attended = new Set(ds.attendees.filter((a) => a.member_id === memberId && jById.has(a.juntada_id)).map((a) => a.juntada_id));
  const paid = ds.gastos.filter((g) => g.paid_by === memberId);

  let consumed = 0;
  const byCat = new Map<string, number>();
  const byMonthMap = new Map<string, number>();
  const perJuntada = new Map<string, number>();
  for (const s of ds.shares) {
    if (s.member_id !== memberId || s.guest_name) continue;
    const g = gastoById.get(s.expense_id);
    const j = g && jById.get(g.juntada_id);
    if (!g || !j) continue;
    const c = toBase(s.amount_cents, g.fx_rate);
    consumed += c;
    byCat.set(g.category_id, (byCat.get(g.category_id) ?? 0) + c);
    const k = j.occurred_on.slice(0, 7);
    byMonthMap.set(k, (byMonthMap.get(k) ?? 0) + c);
    perJuntada.set(j.id, (perJuntada.get(j.id) ?? 0) + c);
  }

  let advancedForOthers = 0;
  for (const s of ds.shares) {
    const g = gastoById.get(s.expense_id);
    if (g && g.paid_by === memberId && s.member_id !== memberId) advancedForOthers += toBase(s.amount_cents, g.fx_rate);
  }
  let iOwe = 0;
  let owedToMe = 0;
  for (const n of ds.nets) {
    if (n.member_id !== memberId) continue;
    if (n.net_cents < 0) iOwe += -n.net_cents;
    else owedToMe += n.net_cents;
  }

  const dates = [...attended].map((id) => jById.get(id)!.occurred_on).sort();
  const from = period?.from ?? dates[0];
  const to = period?.to ?? dates[dates.length - 1];
  const months = attended.size && from && to ? monthsBetween(from, to) : 0;
  const names = new Map(ds.categories.map((c) => [c.id, c.name]));

  return {
    participations: attended.size,
    totalExpenses: ds.juntadas.length,
    participationRate: ds.juntadas.length ? attended.size / ds.juntadas.length : 0,
    consumedCents: consumed,
    avgPerJuntadaCents: attended.size ? Math.round(consumed / attended.size) : 0,
    monthsInPeriod: months,
    avgPerMonthCents: months ? Math.round(consumed / months) : 0,
    advancedCents: paid.reduce((a, g) => a + g.base_amount_cents, 0),
    timesPaid: paid.length,
    advancedForOthersCents: advancedForOthers,
    iOweCents: iOwe,
    owedToMeCents: owedToMe,
    byCategory: [...byCat].map(([id, cents]) => ({ id, name: names.get(id) ?? "Sin categoría", totalCents: cents })).sort((a, b) => b.totalCents - a.totalCents),
    byMonth: byMonthMap,
    topJuntadas: [...perJuntada]
      .map(([id, cents]) => ({ id, title: jById.get(id)!.title, occurred_on: jById.get(id)!.occurred_on, type_id: jById.get(id)!.type_id, myCents: cents }))
      .sort((a, b) => b.myCents - a.myCents)
      .slice(0, 5),
  };
}
