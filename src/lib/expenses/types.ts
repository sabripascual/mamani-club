/*
 * Modelo (desde la migración 0007):
 *   Juntada  → el encuentro: asistentes + uno o más gastos.
 *   Gasto    → (tabla `expenses`) quién pagó, participantes, división, categoría de gasto.
 *   Transferencia (settlement) → pago neto dentro de una juntada.
 */

export type SettlementStatus = "empty" | "pending" | "partial" | "settled";
export type CategoryKind = "gasto" | "juntada";

export type Category = {
  id: string;
  parent_id: string | null;
  kind: CategoryKind;
  code: string | null;
  name: string;
  icon: string | null;
  sort_order: number;
  archived: boolean;
};

export type CategoryTree = (Category & { children: Category[] })[];

export type Member = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  username: string;
  avatar_path: string | null;
  status: "active" | "inactive" | "pending" | "rejected";
  avatar_url: string | null;
};

export type Juntada = {
  id: string;
  title: string;
  occurred_on: string;
  type_id: string;
  description: string | null;
  location: string | null;
  currency: string;
  created_by: string;
  status: "active" | "void";
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type JuntadaStatusRow = {
  juntada_id: string;
  total_cents: number;
  total_base_cents: number;
  expenses_count: number;
  attendees_count: number;
  pending_cents: number;
  settlement_status: SettlementStatus;
};

/** Un gasto dentro de una juntada (tabla `expenses`). */
export type Gasto = {
  id: string;
  juntada_id: string;
  title: string;
  occurred_on: string;
  amount_cents: number;
  currency: string;
  base_amount_cents: number;
  category_id: string;
  subcategory_id: string | null;
  description: string | null;
  paid_by: string;
  created_by: string;
  split_type: "equal" | "custom";
  status: "active" | "void";
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  fx_rate: number;
  fx_rate_date: string;
};

export type Share = { expense_id: string; member_id: string; amount_cents: number; is_participant: boolean };

export type MemberNet = {
  juntada_id: string;
  member_id: string;
  currency: string;
  paid_cents: number;
  consumed_cents: number;
  sent_cents: number;
  received_cents: number;
  net_cents: number;
};

export type Transfer = { juntada_id: string; currency: string; from_member: string; to_member: string; amount_cents: number };

export type Settlement = {
  id: string;
  juntada_id: string;
  from_member: string;
  to_member: string;
  amount_cents: number;
  currency: string;
  paid_on: string;
  alias: string | null;
  note: string | null;
  status: "active" | "void";
  void_reason: string | null;
  created_by: string;
  created_at: string;
};

export type MemberBalance = {
  member_id: string;
  currency: string;
  advanced_cents: number;
  times_paid: number;
  consumed_cents: number;
  expenses_participated: number;
  owed_to_me_cents: number;
  i_owe_cents: number;
  received_cents: number;
  sent_cents: number;
};

export const STATUS_LABEL: Record<SettlementStatus, string> = {
  empty: "Sin gastos",
  pending: "Pendiente",
  partial: "Parcialmente saldado",
  settled: "Saldado",
};

export type JuntadaListItem = Juntada & { summary: JuntadaStatusRow | null };
