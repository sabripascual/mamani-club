import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/expenses/queries";
import { getCards, getCuotita } from "@/lib/cuotitas/queries";
import { updateCuotita } from "@/lib/cuotitas/actions";
import { monthOf } from "@/lib/cuotitas/types";
import { getAliases } from "@/lib/profile/aliases";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { CuotitaForm } from "@/components/cuotitas/cuotita-form";

export const metadata: Metadata = { title: "Editar cuotita · MAMANÍ CLUB" };

export default async function EditCuotitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { members }] = await Promise.all([getCuotita(id), getMembers()]);
  if (!data) notFound();
  const { cuotita: c, parts, installments } = data;
  // La base también lo valida: quien pagó, quien la cargó o una admin.
  if (c.status !== "active" || !(profile.role === "admin" || profile.id === c.paid_by || profile.id === c.created_by)) redirect(`/cuotitas/${id}`);
  const active = members.filter((m) => m.status === "active").map((m) => m.id);
  const [cards, aliases] = await Promise.all([getCards([...new Set([...active, c.paid_by])]), getAliases([profile.id])]);
  return (
    <>
      <Link href={`/cuotitas/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite"><ArrowLeft className="size-4" /> Volver</Link>
      <PageHeader eyebrow="Editar cuotita" title={c.title} />
      <CuotitaForm action={updateCuotita.bind(null, id)} members={members} meId={profile.id} cards={cards} myAliases={aliases.get(profile.id) ?? []}
        thisMonth={monthOf(todayAR())}
        initial={{
          title: c.title, kind: c.kind, total_cents: c.total_cents, installments: c.installments, first_month: c.first_month, paid_by: c.paid_by,
          card_id: c.card_id, split_type: c.split_type, parts: parts.map((p) => ({ member_id: p.member_id, amount_cents: p.amount_cents })),
          description: c.description, refund_alias: c.refund_alias, locked: installments.some((i) => i.paid_at),
        }} />
    </>
  );
}
