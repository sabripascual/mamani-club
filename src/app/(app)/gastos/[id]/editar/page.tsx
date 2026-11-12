import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getExpense, getMembers } from "@/lib/expenses/queries";
import { updateExpense } from "@/lib/expenses/actions";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { ExpenseForm } from "@/components/expenses/expense-form";

export const metadata: Metadata = { title: "Editar juntada · MAMANÍ CLUB" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { tree }, { members }] = await Promise.all([getExpense(id), getCategories(), getMembers()]);
  if (!data) notFound();
  const { expense: e, rawShares, payments } = data;
  // La base también lo valida; esto solo evita mostrar un formulario inútil.
  if (e.status !== "active" || (profile.role !== "admin" && e.created_by !== profile.id)) redirect(`/gastos/${id}`);
  const hasPayments = payments.some((p) => p.status === "active");

  return (
    <>
      <Link href={`/gastos/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite">
        <ArrowLeft className="size-4" /> Volver
      </Link>
      <PageHeader eyebrow="Editar" title={e.title} />
      {hasPayments && (
        <div className="mb-6">
          <Alert tone="info">
            Esta juntada ya tiene pagos. Si cambiás el importe o las participantes, se recalcula lo que falta pagar
            (o lo que hay que reintegrar) y el cambio queda en la auditoría.
          </Alert>
        </div>
      )}
      <ExpenseForm
        mode="edit"
        action={updateExpense.bind(null, id)}
        categories={tree}
        members={members}
        meId={profile.id}
        today={todayAR()}
        hasPayments={hasPayments}
        initial={{
          title: e.title,
          occurred_on: e.occurred_on,
          category_id: e.category_id,
          subcategory_id: e.subcategory_id,
          description: e.description,
          amount_cents: e.amount_cents,
          paid_by: e.paid_by,
          split_type: e.split_type,
          shares: rawShares.filter((s) => s.is_participant).map((s) => ({ member_id: s.member_id, amount_cents: s.amount_cents })),
        }}
      />
    </>
  );
}
