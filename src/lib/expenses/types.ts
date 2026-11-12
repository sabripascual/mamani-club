export type SettlementStatus = "pending" | "partial" | "settled";

export type Category = {
  id: string;
  parent_id: string | null;
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

export type ExpenseRow = {
  id: string;
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

export type ExpenseStatusRow = {
  expense_id: string;
  owed_cents: number;
  outstanding_cents: number;
  paid_cents: number;
  participants: number;
  settlement_status: SettlementStatus;
};

export type ShareBalance = {
  share_id: string;
  expense_id: string;
  member_id: string;
  paid_by: string;
  currency: string;
  amount_cents: number;
  is_participant: boolean;
  is_payer: boolean;
  paid_cents: number;
  refunded_cents: number;
  outstanding_cents: number;
};

export type Payment = {
  id: string;
  share_id: string;
  expense_id: string;
  kind: "payment" | "refund";
  from_member: string;
  to_member: string;
  amount_cents: number;
  currency: string;
  paid_on: string;
  method: string | null;
  note: string | null;
  status: "active" | "void";
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_by: string;
  created_at: string;
};

export type DebtRow = { debtor_id: string; creditor_id: string; currency: string; amount_cents: number };

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
  pending: "Pendiente",
  partial: "Parcialmente saldado",
  settled: "Saldado",
};
