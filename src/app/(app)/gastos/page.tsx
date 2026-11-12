import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getMembers, listExpenses, type ExpenseFilters } from "@/lib/expenses/queries";
import { createClient } from "@/lib/supabase/server";
import { formatMonth, monthKey, MONTHS } from "@/lib/dates";
import { formatMoney } from "@/lib/money/format";
import { displayName } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GastosTabs } from "@/components/expenses/gastos-tabs";
import { ExpenseCard } from "@/components/expenses/expense-card";

export const metadata: Metadata = { title: "Gastos · MAMANÍ CLUB" };

type SP = { anio?: string; mes?: string; categoria?: string; integrante?: string; estado?: string };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { profile } = await requireActiveMember();
  const filters: ExpenseFilters = {
    year: sp.anio ? Number(sp.anio) : undefined,
    month: sp.anio && sp.mes ? Number(sp.mes) : undefined,
    categoryId: sp.categoria || undefined,
    memberId: sp.integrante || undefined,
    status: ["pending", "partial", "settled"].includes(sp.estado ?? "") ? (sp.estado as ExpenseFilters["status"]) : undefined,
  };
  const [expenses, { tree, byId: catById }, { members, byId: memberById }] = await Promise.all([
    listExpenses(filters), getCategories(true), getMembers(),
  ]);

  // Lo que debo en cada juntada listada.
  const supabase = await createClient();
  const { data: mine } = expenses.length
    ? await supabase.from("v_share_balances").select("expense_id, outstanding_cents").eq("member_id", profile.id).in("expense_id", expenses.map((e) => e.id))
    : { data: [] };
  const myOwed = new Map((mine ?? []).map((r) => [r.expense_id as string, Number(r.outstanding_cents)]));

  const groups = new Map<string, typeof expenses>();
  for (const e of expenses) {
    const k = monthKey(e.occurred_on);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const filtered = Object.values(sp).some(Boolean);
  const select = "h-10 rounded-full border border-graphite/10 bg-white/70 px-3 text-sm";

  return (
    <>
      <PageHeader eyebrow="Gastos" title="Nuestras juntadas" />
      <GastosTabs />

      <form className="mb-6 flex flex-wrap gap-2">
        <select name="anio" defaultValue={sp.anio ?? ""} className={select} aria-label="Año">
          <option value="">Todos los años</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select name="mes" defaultValue={sp.mes ?? ""} className={select} aria-label="Mes">
          <option value="">Todo el año</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select name="categoria" defaultValue={sp.categoria ?? ""} className={select} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {tree.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="integrante" defaultValue={sp.integrante ?? ""} className={select} aria-label="Integrante">
          <option value="">Todas las integrantes</option>
          {members.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
        </select>
        <select name="estado" defaultValue={sp.estado ?? ""} className={select} aria-label="Estado">
          <option value="">Cualquier estado</option>
          <option value="pending">Pendientes</option>
          <option value="partial">Parcialmente saldadas</option>
          <option value="settled">Saldadas</option>
        </select>
        <button className="h-10 rounded-full bg-graphite px-4 text-sm font-semibold text-cream">Filtrar</button>
        {filtered && <Link href="/gastos" className="inline-flex h-10 items-center px-2 text-sm font-semibold text-rose-dark">Limpiar</Link>}
      </form>

      {expenses.length === 0 ? (
        <EmptyState icon={ReceiptText} title={filtered ? "No hay juntadas con esos filtros" : "Todavía no hay juntadas"}>
          {!filtered && (
            <Link href="/gastos/nuevo" className="mt-3 inline-flex items-center gap-1 font-semibold text-rose-dark">
              <Plus className="size-4" /> Cargar la primera
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {[...groups].map(([key, list]) => {
            const totals = new Map<string, number>();
            for (const e of list) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount_cents);
            return (
              <section key={key}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-display text-xl">{formatMonth(key)}</h2>
                  <p className="text-sm text-graphite/55">
                    {list.length} {list.length === 1 ? "juntada" : "juntadas"} · {[...totals].map(([c, v]) => formatMoney(v, c)).join(" + ")}
                  </p>
                </div>
                <ul className="flex flex-col gap-2">
                  {list.map((e, i) => (
                    <li key={e.id}>
                      <ExpenseCard
                        e={e}
                        category={catById.get(e.category_id)}
                        subcategory={e.subcategory_id ? catById.get(e.subcategory_id) : undefined}
                        payer={memberById.get(e.paid_by)}
                        meId={profile.id}
                        index={i}
                        myOutstanding={myOwed.get(e.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
