import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getGasto, getMembers } from "@/lib/expenses/queries";
import { updateGasto } from "@/lib/expenses/actions";
import { PageHeader } from "@/components/ui/page-header";
import { GastoForm } from "@/components/expenses/gasto-form";
import { VoidGastoButton } from "../../../actions-client";

export const metadata: Metadata = { title: "Editar gasto · MAMANÍ CLUB" };

export default async function EditGastoPage({ params }: { params: Promise<{ id: string; gastoId: string }> }) {
  const { id, gastoId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(gastoId)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { tree }, { members }] = await Promise.all([getGasto(gastoId), getCategories(), getMembers()]);
  if (!data || data.gasto.juntada_id !== id) notFound();
  const { gasto: g, shares } = data;
  // La base también lo valida: solo quien lo cargó o una admin.
  if (g.status !== "active" || (profile.role !== "admin" && g.created_by !== profile.id)) redirect(`/gastos/${id}`);
  return (
    <>
      <Link href={`/gastos/${id}/gasto/${gastoId}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite"><ArrowLeft className="size-4" /> Volver al gasto</Link>
      <PageHeader eyebrow="Editar gasto" title={g.title} />
      <GastoForm
        action={updateGasto.bind(null, gastoId, id)}
        categories={tree}
        members={members}
        meId={profile.id}
        attendees={[]}
        initial={{
          title: g.title, category_id: g.category_id, subcategory_id: g.subcategory_id, description: g.description,
          amount_cents: g.amount_cents, paid_by: g.paid_by, split_type: g.split_type,
          shares: shares.filter((s) => s.is_participant).map((s) => ({ member_id: s.member_id, amount_cents: s.amount_cents })),
        }}
      />
      <div className="mt-8 border-t border-graphite/10 pt-6"><VoidGastoButton gastoId={gastoId} juntadaId={id} /></div>
    </>
  );
}
