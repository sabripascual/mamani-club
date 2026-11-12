import type { Metadata } from "next";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getMembers } from "@/lib/expenses/queries";
import { createExpense } from "@/lib/expenses/actions";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { ExpenseForm } from "@/components/expenses/expense-form";

export const metadata: Metadata = { title: "Nueva juntada · MAMANÍ CLUB" };

export default async function NewExpensePage() {
  const { profile } = await requireActiveMember();
  const [{ tree }, { members }] = await Promise.all([getCategories(), getMembers()]);
  return (
    <>
      <PageHeader eyebrow="Agregar" title="Nueva juntada">
        Cada juntada es un gasto: cargá cuánto salió, quién pagó y quiénes participaron.
      </PageHeader>
      <ExpenseForm mode="create" action={createExpense} categories={tree} members={members} meId={profile.id} today={todayAR()} />
    </>
  );
}
