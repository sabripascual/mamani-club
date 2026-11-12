import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "@/lib/storage/avatars";
import type {
  Category, CategoryKind, CategoryTree, Gasto, Juntada, JuntadaListItem, JuntadaStatusRow, Member, MemberBalance, MemberNet, Settlement, Share, Transfer,
} from "./types";
export type { JuntadaListItem };

const JUNTADA_COLUMNS = "id, title, occurred_on, type_id, description, location, currency, created_by, status, void_reason, created_at, updated_at";
const GASTO_COLUMNS =
  "id, juntada_id, title, occurred_on, amount_cents, currency, base_amount_cents, category_id, subcategory_id, description, paid_by, created_by, split_type, status, void_reason, created_at, updated_at, fx_rate, fx_rate_date";

// PostgREST devuelve bigint como number (o string si es muy grande). Normalizamos.
const num = (v: unknown) => Number(v ?? 0);

/** Categorías de un tipo: "gasto" (con subcategorías) o "juntada" (tipos de juntada). */
export const getCategories = cache(async (includeArchived = false, kind: CategoryKind = "gasto") => {
  const supabase = await createClient();
  let q = supabase.from("categories").select("id, parent_id, kind, code, name, icon, sort_order, archived").eq("kind", kind).order("sort_order");
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q.returns<Category[]>();
  const all = data ?? [];
  const tree: CategoryTree = all.filter((c) => !c.parent_id).map((c) => ({ ...c, children: all.filter((s) => s.parent_id === c.id) }));
  return { all, tree, byId: new Map(all.map((c) => [c.id, c])) };
});

export const getJuntadaTypes = (includeArchived = false) => getCategories(includeArchived, "juntada");

/** Integrantes aprobadas (activas y desactivadas) con avatar firmado. */
export const getMembers = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, nickname, username, avatar_path, status")
    .in("status", ["active", "inactive"])
    .order("first_name")
    .returns<Omit<Member, "avatar_url">[]>();
  const rows = data ?? [];
  const urls = await signAvatarUrls(rows.map((r) => r.avatar_path));
  const members: Member[] = rows.map((r) => ({ ...r, avatar_url: r.avatar_path ? (urls.get(r.avatar_path) ?? null) : null }));
  return { members, byId: new Map(members.map((m) => [m.id, m])) };
});

export type JuntadaFilters = {
  year?: number;
  month?: number; // 1..12
  from?: string;
  to?: string;
  typeId?: string;
  memberId?: string;
  status?: "pending" | "partial" | "settled";
};

function dateRange(f: JuntadaFilters): [string | null, string | null] {
  if (f.from || f.to) return [f.from ?? null, f.to ?? null];
  if (f.year && f.month) {
    const last = new Date(Date.UTC(f.year, f.month, 0)).getUTCDate();
    const mm = String(f.month).padStart(2, "0");
    return [`${f.year}-${mm}-01`, `${f.year}-${mm}-${last}`];
  }
  if (f.year) return [`${f.year}-01-01`, `${f.year}-12-31`];
  return [null, null];
}


/** Lista de juntadas con su estado. Filtro por integrante = asistentes. */
export async function listJuntadas(filters: JuntadaFilters = {}, limit?: number): Promise<JuntadaListItem[]> {
  const supabase = await createClient();
  const [from, to] = dateRange(filters);
  const select = filters.memberId ? `${JUNTADA_COLUMNS}, juntada_attendees!inner(member_id)` : JUNTADA_COLUMNS;
  let q = supabase.from("juntadas").select(select).eq("status", "active")
    .order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
  if (from) q = q.gte("occurred_on", from);
  if (to) q = q.lte("occurred_on", to);
  if (filters.typeId) q = q.eq("type_id", filters.typeId);
  if (filters.memberId) q = q.eq("juntada_attendees.member_id", filters.memberId);
  if (limit) q = q.limit(limit);
  const { data } = await q.returns<Juntada[]>();
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const { data: st } = ids.length
    ? await supabase.from("v_juntada_status").select("*").in("juntada_id", ids).returns<JuntadaStatusRow[]>()
    : { data: [] as JuntadaStatusRow[] };
  const byId = new Map((st ?? []).map((s) => [s.juntada_id, normStatus(s)]));
  const out = rows.map((r) => ({ ...r, summary: byId.get(r.id) ?? null }));
  return filters.status ? out.filter((r) => r.summary?.settlement_status === filters.status) : out;
}

function normStatus(s: JuntadaStatusRow): JuntadaStatusRow {
  return { ...s, total_cents: num(s.total_cents), total_base_cents: num(s.total_base_cents), pending_cents: num(s.pending_cents),
    expenses_count: num(s.expenses_count), attendees_count: num(s.attendees_count) };
}

/** Todo lo de una juntada: gastos, partes, asistentes, saldos, transferencias sugeridas e historial. */
export async function getJuntada(id: string) {
  const supabase = await createClient();
  const { data: juntada } = await supabase.from("juntadas").select(JUNTADA_COLUMNS).eq("id", id).maybeSingle<Juntada>();
  if (!juntada) return null;
  const [{ data: gastos }, { data: attendees }, { data: nets }, { data: transfers }, { data: settlements }, { data: status }] = await Promise.all([
    supabase.from("expenses").select(GASTO_COLUMNS).eq("juntada_id", id).eq("status", "active").order("created_at").returns<Gasto[]>(),
    supabase.from("juntada_attendees").select("member_id, created_at").eq("juntada_id", id).order("created_at"),
    supabase.from("v_juntada_member_balances").select("*").eq("juntada_id", id).returns<MemberNet[]>(),
    supabase.rpc("juntada_transfers", { p_juntada: id }).returns<Omit<Transfer, "juntada_id" | "currency">[]>(),
    supabase.from("settlements").select("*").eq("juntada_id", id).order("created_at", { ascending: false }).returns<Settlement[]>(),
    supabase.from("v_juntada_status").select("*").eq("juntada_id", id).maybeSingle<JuntadaStatusRow>(),
  ]);
  const gastoIds = (gastos ?? []).map((g) => g.id);
  const { data: shares } = gastoIds.length
    ? await supabase.from("expense_shares").select("expense_id, member_id, amount_cents, is_participant").in("expense_id", gastoIds).returns<Share[]>()
    : { data: [] as Share[] };
  return {
    juntada,
    gastos: (gastos ?? []).map((g) => ({ ...g, amount_cents: num(g.amount_cents), base_amount_cents: num(g.base_amount_cents) })),
    shares: (shares ?? []).map((s) => ({ ...s, amount_cents: num(s.amount_cents) })),
    attendees: (attendees ?? []).map((a) => a.member_id as string),
    nets: (nets ?? []).map((n) => ({ ...n, paid_cents: num(n.paid_cents), consumed_cents: num(n.consumed_cents), sent_cents: num(n.sent_cents),
      received_cents: num(n.received_cents), net_cents: num(n.net_cents) })),
    transfers: ((transfers ?? []) as Omit<Transfer, "juntada_id" | "currency">[]).map((t) => ({ ...t, amount_cents: num(t.amount_cents) })),
    settlements: (settlements ?? []).map((s) => ({ ...s, amount_cents: num(s.amount_cents) })),
    status: status ? normStatus(status) : null,
  };
}

/** Un gasto con sus partes (para editarlo). */
export async function getGasto(id: string) {
  const supabase = await createClient();
  const { data: gasto } = await supabase.from("expenses").select(GASTO_COLUMNS).eq("id", id).maybeSingle<Gasto>();
  if (!gasto) return null;
  const { data: shares } = await supabase.from("expense_shares").select("expense_id, member_id, amount_cents, is_participant").eq("expense_id", id).returns<Share[]>();
  return { gasto: { ...gasto, amount_cents: num(gasto.amount_cents) }, shares: (shares ?? []).map((s) => ({ ...s, amount_cents: num(s.amount_cents) })) };
}

/** Transferencias pendientes de todas las juntadas (quién le debe a quién). */
export async function getPendingTransfers() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_pending_transfers").select("*").returns<Transfer[]>();
  return (data ?? []).map((t) => ({ ...t, amount_cents: num(t.amount_cents) }));
}

export async function getMemberBalances(memberId?: string) {
  const supabase = await createClient();
  let q = supabase.from("v_member_balances").select("*");
  if (memberId) q = q.eq("member_id", memberId);
  const { data } = await q.returns<MemberBalance[]>();
  return (data ?? []).map((b) => ({
    ...b,
    advanced_cents: num(b.advanced_cents), consumed_cents: num(b.consumed_cents), owed_to_me_cents: num(b.owed_to_me_cents),
    i_owe_cents: num(b.i_owe_cents), received_cents: num(b.received_cents), sent_cents: num(b.sent_cents),
    times_paid: num(b.times_paid), expenses_participated: num(b.expenses_participated),
  }));
}

/** Movimientos de una integrante: juntadas en las que estuvo o pagó, con su saldo en cada una. */
export async function getMemberMovements(memberId: string) {
  const supabase = await createClient();
  const [{ data: att }, { data: nets }] = await Promise.all([
    supabase.from("juntada_attendees").select("juntada_id").eq("member_id", memberId),
    supabase.from("v_juntada_member_balances").select("*").eq("member_id", memberId).returns<MemberNet[]>(),
  ]);
  const ids = [...new Set([...(att ?? []).map((a) => a.juntada_id as string), ...(nets ?? []).map((n) => n.juntada_id)])];
  if (ids.length === 0) return [];
  const [{ data: juntadas }, { data: status }] = await Promise.all([
    supabase.from("juntadas").select(JUNTADA_COLUMNS).in("id", ids).eq("status", "active").returns<Juntada[]>(),
    supabase.from("v_juntada_status").select("*").in("juntada_id", ids).returns<JuntadaStatusRow[]>(),
  ]);
  const netBy = new Map((nets ?? []).map((n) => [n.juntada_id, n]));
  const stBy = new Map((status ?? []).map((s) => [s.juntada_id, normStatus(s)]));
  return (juntadas ?? [])
    .map((j) => {
      const n = netBy.get(j.id);
      return {
        juntada: j,
        attended: (att ?? []).some((a) => a.juntada_id === j.id),
        paid_cents: num(n?.paid_cents),
        consumed_cents: num(n?.consumed_cents),
        net_cents: num(n?.net_cents),
        status: stBy.get(j.id) ?? null,
      };
    })
    .sort((a, b) => b.juntada.occurred_on.localeCompare(a.juntada.occurred_on));
}
