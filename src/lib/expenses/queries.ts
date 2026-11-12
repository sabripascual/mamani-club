import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "@/lib/storage/avatars";
import type {
  Category, CategoryTree, DebtRow, ExpenseRow, ExpenseStatusRow, Member, MemberBalance, Payment, ShareBalance,
} from "./types";

const EXPENSE_COLUMNS =
  "id, title, occurred_on, amount_cents, currency, base_amount_cents, category_id, subcategory_id, description, paid_by, created_by, split_type, status, void_reason, created_at, updated_at, fx_rate, fx_rate_date";

// PostgREST devuelve bigint como number (o string si es muy grande). Normalizamos.
const num = (v: unknown) => Number(v ?? 0);

export const getCategories = cache(async (includeArchived = false) => {
  const supabase = await createClient();
  let q = supabase.from("categories").select("id, parent_id, code, name, icon, sort_order, archived").order("sort_order");
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q.returns<Category[]>();
  const all = data ?? [];
  const tree: CategoryTree = all
    .filter((c) => !c.parent_id)
    .map((c) => ({ ...c, children: all.filter((s) => s.parent_id === c.id) }));
  return { all, tree, byId: new Map(all.map((c) => [c.id, c])) };
});

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

export type ExpenseFilters = {
  year?: number;
  month?: number; // 1..12
  from?: string;
  to?: string;
  categoryId?: string;
  memberId?: string;
  status?: "pending" | "partial" | "settled";
};

function dateRange(f: ExpenseFilters): [string | null, string | null] {
  if (f.from || f.to) return [f.from ?? null, f.to ?? null];
  if (f.year && f.month) {
    const last = new Date(Date.UTC(f.year, f.month, 0)).getUTCDate();
    const mm = String(f.month).padStart(2, "0");
    return [`${f.year}-${mm}-01`, `${f.year}-${mm}-${last}`];
  }
  if (f.year) return [`${f.year}-01-01`, `${f.year}-12-31`];
  return [null, null];
}

export async function listExpenses(filters: ExpenseFilters = {}) {
  const supabase = await createClient();
  const [from, to] = dateRange(filters);
  const select = filters.memberId ? `${EXPENSE_COLUMNS}, expense_shares!inner(member_id)` : EXPENSE_COLUMNS;
  let q = supabase
    .from("expenses")
    .select(select)
    .eq("status", "active")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (from) q = q.gte("occurred_on", from);
  if (to) q = q.lte("occurred_on", to);
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
  if (filters.memberId) q = q.eq("expense_shares.member_id", filters.memberId).eq("expense_shares.is_participant", true);
  const { data } = await q.returns<ExpenseRow[]>();
  const expenses = (data ?? []).map((e) => ({ ...e, amount_cents: num(e.amount_cents), base_amount_cents: num(e.base_amount_cents) }));

  const ids = expenses.map((e) => e.id);
  const { data: statuses } = ids.length
    ? await supabase.from("v_expense_status").select("*").in("expense_id", ids).returns<ExpenseStatusRow[]>()
    : { data: [] as ExpenseStatusRow[] };
  const statusById = new Map((statuses ?? []).map((s) => [s.expense_id, { ...s, outstanding_cents: num(s.outstanding_cents) }]));

  const rows = expenses.map((e) => ({ ...e, settlement: statusById.get(e.id) ?? null }));
  return filters.status ? rows.filter((r) => r.settlement?.settlement_status === filters.status) : rows;
}

export async function getExpense(id: string) {
  const supabase = await createClient();
  const { data: expense } = await supabase.from("expenses").select(EXPENSE_COLUMNS).eq("id", id).maybeSingle<ExpenseRow>();
  if (!expense) return null;
  const [{ data: shares }, { data: payments }, { data: status }, { data: rawShares }] = await Promise.all([
    supabase.from("v_share_balances").select("*").eq("expense_id", id).returns<ShareBalance[]>(),
    supabase.from("payments").select("*").eq("expense_id", id).order("created_at", { ascending: false }).returns<Payment[]>(),
    supabase.from("v_expense_status").select("*").eq("expense_id", id).maybeSingle<ExpenseStatusRow>(),
    // Para anuladas la vista no devuelve partes: leemos la tabla.
    supabase.from("expense_shares").select("id, member_id, amount_cents, is_participant").eq("expense_id", id),
  ]);
  return {
    expense: { ...expense, amount_cents: num(expense.amount_cents), base_amount_cents: num(expense.base_amount_cents) },
    shares: (shares ?? []).map((s) => ({
      ...s,
      amount_cents: num(s.amount_cents),
      paid_cents: num(s.paid_cents),
      refunded_cents: num(s.refunded_cents),
      outstanding_cents: num(s.outstanding_cents),
    })),
    rawShares: (rawShares ?? []).map((s) => ({ ...s, amount_cents: num(s.amount_cents) })),
    payments: (payments ?? []).map((p) => ({ ...p, amount_cents: num(p.amount_cents) })),
    status: status ?? null,
  };
}

export async function getDebts() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_debts").select("*").returns<DebtRow[]>();
  return (data ?? []).map((d) => ({ ...d, amount_cents: num(d.amount_cents) }));
}

export async function getMemberBalances(memberId?: string) {
  const supabase = await createClient();
  let q = supabase.from("v_member_balances").select("*");
  if (memberId) q = q.eq("member_id", memberId);
  const { data } = await q.returns<MemberBalance[]>();
  return (data ?? []).map((b) => ({
    ...b,
    advanced_cents: num(b.advanced_cents),
    consumed_cents: num(b.consumed_cents),
    owed_to_me_cents: num(b.owed_to_me_cents),
    i_owe_cents: num(b.i_owe_cents),
    received_cents: num(b.received_cents),
    sent_cents: num(b.sent_cents),
    times_paid: num(b.times_paid),
    expenses_participated: num(b.expenses_participated),
  }));
}

/** Movimientos de una integrante: juntadas donde pagó y/o participó, con su situación. */
export async function getMemberMovements(memberId: string) {
  const supabase = await createClient();
  const [{ data: paid }, { data: shares }] = await Promise.all([
    supabase.from("expenses").select(EXPENSE_COLUMNS).eq("status", "active").eq("paid_by", memberId).returns<ExpenseRow[]>(),
    supabase.from("v_share_balances").select("*").eq("member_id", memberId).returns<ShareBalance[]>(),
  ]);
  const shareRows = (shares ?? []).map((s) => ({ ...s, amount_cents: num(s.amount_cents), outstanding_cents: num(s.outstanding_cents) }));
  const ids = [...new Set([...(paid ?? []).map((e) => e.id), ...shareRows.map((s) => s.expense_id)])];
  const { data: expenses } = ids.length
    ? await supabase.from("expenses").select(EXPENSE_COLUMNS).in("id", ids).returns<ExpenseRow[]>()
    : { data: [] as ExpenseRow[] };
  const { data: statuses } = ids.length
    ? await supabase.from("v_expense_status").select("*").in("expense_id", ids).returns<ExpenseStatusRow[]>()
    : { data: [] as ExpenseStatusRow[] };
  const statusById = new Map((statuses ?? []).map((s) => [s.expense_id, s]));
  const shareByExpense = new Map(shareRows.map((s) => [s.expense_id, s]));

  return (expenses ?? [])
    .map((e) => {
      const share = shareByExpense.get(e.id);
      const isPayer = e.paid_by === memberId;
      return {
        expense: { ...e, amount_cents: num(e.amount_cents) },
        isPayer,
        participated: !!share?.is_participant,
        share_cents: share?.amount_cents ?? 0,
        outstanding_cents: isPayer ? 0 : (share?.outstanding_cents ?? 0),
        expenseStatus: statusById.get(e.id)?.settlement_status ?? null,
      };
    })
    .sort((a, b) => b.expense.occurred_on.localeCompare(a.expense.occurred_on));
}
