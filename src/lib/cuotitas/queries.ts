import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Cuotita, CuotitaPart, Installment, MemberCard } from "./types";

const COLS = "id, title, kind, card_id, card_label, total_cents, installments, first_month, paid_by, created_by, split_type, refund_alias, description, status, void_reason, created_at";
const num = (v: unknown) => Number(v ?? 0);
const normC = (c: Cuotita): Cuotita => ({ ...c, total_cents: num(c.total_cents) });
const normI = (i: Installment): Installment => ({ ...i, amount_cents: num(i.amount_cents) });

/** Todas las cuotitas (las más nuevas primero) con sus cuotas. */
export async function listCuotitas() {
  const supabase = await createClient();
  const { data: cuotitas } = await supabase.from("cuotitas").select(COLS).order("created_at", { ascending: false }).returns<Cuotita[]>();
  const ids = (cuotitas ?? []).map((c) => c.id);
  const { data: inst } = ids.length
    ? await supabase.from("cuotita_installments").select("*").in("cuotita_id", ids).order("number").returns<Installment[]>()
    : { data: [] as Installment[] };
  return { cuotitas: (cuotitas ?? []).map(normC), installments: (inst ?? []).map(normI) };
}

/** Una cuotita con sus partes y cuotas. */
export async function getCuotita(id: string) {
  const supabase = await createClient();
  const { data: c } = await supabase.from("cuotitas").select(COLS).eq("id", id).maybeSingle<Cuotita>();
  if (!c) return null;
  const [{ data: parts }, { data: inst }] = await Promise.all([
    supabase.from("cuotita_parts").select("*").eq("cuotita_id", id).returns<CuotitaPart[]>(),
    supabase.from("cuotita_installments").select("*").eq("cuotita_id", id).order("member_id").order("number").returns<Installment[]>(),
  ]);
  return {
    cuotita: normC(c),
    parts: (parts ?? []).map((p) => ({ ...p, amount_cents: num(p.amount_cents) })),
    installments: (inst ?? []).map(normI),
  };
}

/** Tarjetas de una o varias integrantes. */
export async function getCards(memberIds: string[]) {
  if (memberIds.length === 0) return [] as MemberCard[];
  const supabase = await createClient();
  const { data } = await supabase.from("member_cards").select("id, member_id, brand, label").in("member_id", memberIds).order("created_at").returns<MemberCard[]>();
  return data ?? [];
}

/** Cuotas impagas que me tocan hasta este mes, y las que me deben a mí (para Inicio y la lista). */
export async function myCuotitasMonth(memberId: string, month: string) {
  const supabase = await createClient();
  const [{ data: mine }, { data: owed }] = await Promise.all([
    supabase.from("cuotita_installments").select("amount_cents, cuotitas!inner(status)")
      .eq("member_id", memberId).is("paid_at", null).lte("due_month", month).eq("cuotitas.status", "active"),
    supabase.from("cuotita_installments").select("amount_cents, cuotitas!inner(status, paid_by)")
      .is("paid_at", null).lte("due_month", month).eq("cuotitas.status", "active").eq("cuotitas.paid_by", memberId),
  ]);
  const sum = (rows: { amount_cents: unknown }[] | null) => (rows ?? []).reduce((a, r) => a + num(r.amount_cents), 0);
  return { iOwe: sum(mine), owedToMe: sum(owed), count: (mine ?? []).length + (owed ?? []).length };
}
