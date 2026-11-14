/*
 * Las Cuotitas: compras con tarjeta en cuotas y préstamos, aparte de juntadas y gastos.
 *   Cuotita → total, cuotas, desde qué mes, quién pagó (y con qué tarjeta).
 *   Parte   → lo que le toca a cada participante (la de quien pagó no se le debe a nadie).
 *   Cuota   → lo que una deudora paga un mes.
 */
import { MONTHS } from "../dates";

export type CardBrand = "visa" | "mastercard" | "amex" | "naranja" | "cabal" | "otra";
export const CARD_BRANDS: { id: CardBrand; name: string }[] = [
  { id: "visa", name: "Visa" },
  { id: "mastercard", name: "Mastercard" },
  { id: "amex", name: "American Express" },
  { id: "naranja", name: "Naranja X" },
  { id: "cabal", name: "Cabal" },
  { id: "otra", name: "Otra tarjeta" },
];
export const cardDisplay = (brand: CardBrand, label: string | null) =>
  [brand === "otra" ? "Tarjeta" : CARD_BRANDS.find((b) => b.id === brand)?.name, label?.trim()].filter(Boolean).join(" ");

export type MemberCard = { id: string; member_id: string; brand: CardBrand; label: string | null };

export type CuotitaKind = "tarjeta" | "prestamo";
export const KIND_LABEL: Record<CuotitaKind, string> = { tarjeta: "Compra con tarjeta", prestamo: "Préstamo" };

export type Cuotita = {
  id: string;
  title: string;
  kind: CuotitaKind;
  card_id: string | null;
  card_label: string | null;
  total_cents: number;
  installments: number;
  first_month: string; // AAAA-MM-01
  paid_by: string;
  created_by: string;
  split_type: "equal" | "custom";
  refund_alias: string | null;
  description: string | null;
  status: "active" | "void";
  void_reason: string | null;
  created_at: string;
};
export type CuotitaPart = { cuotita_id: string; member_id: string; amount_cents: number };
export type Installment = {
  id: string; cuotita_id: string; member_id: string; number: number; due_month: string; amount_cents: number;
  paid_at: string | null; paid_by: string | null;
};

/** "2026-12-01" + 2 → "2027-02-01". */
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
/** "2026-12-01" → "Diciembre 2026". */
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
/** Primer día del mes de una fecha "AAAA-MM-DD". */
export const monthOf = (day: string) => `${day.slice(0, 7)}-01`;

/** Estado de una cuotita para una lista: activa (con cuotas pendientes), terminada o anulada. */
export function cuotitaState(c: Cuotita, inst: Installment[]): "activa" | "terminada" | "anulada" {
  if (c.status === "void") return "anulada";
  return inst.some((i) => i.cuotita_id === c.id && !i.paid_at) ? "activa" : "terminada";
}
