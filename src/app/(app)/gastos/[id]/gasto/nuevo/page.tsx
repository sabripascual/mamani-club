import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getJuntada, getMembers } from "@/lib/expenses/queries";
import { createGasto } from "@/lib/expenses/actions";
import { PageHeader } from "@/components/ui/page-header";
import { GastoForm } from "@/components/expenses/gasto-form";
import { getAliases } from "@/lib/profile/aliases";

export const metadata: Metadata = { title: "Agregar gasto · MAMANÍ CLUB" };

export default async function NewGastoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { tree }, { members }, myAliases] = await Promise.all([getJuntada(id), getCategories(), getMembers(), getAliases([profile.id])]);
  if (!data || data.juntada.status !== "active") notFound();
  if (data.status?.settlement_status === "settled") redirect(`/gastos/${id}?aviso=${encodeURIComponent("La juntada ya está saldada: no se pueden agregar más gastos.")}`);
  return (
    <>
      <Link href={`/gastos/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite"><ArrowLeft className="size-4" /> {data.juntada.title}</Link>
      <PageHeader eyebrow="Agregar gasto" title="¿Qué se pagó?" />
      <GastoForm action={createGasto.bind(null, id)} categories={tree} members={members} meId={profile.id} attendees={data.attendees} myAliases={myAliases.get(profile.id) ?? []}
        knownGuests={data.shares.filter((s) => s.guest_name).map((s) => ({ name: s.guest_name!, responsible_id: s.member_id }))
          .filter((g, i, all) => all.findIndex((x) => x.responsible_id === g.responsible_id && x.name.toLowerCase() === g.name.toLowerCase()) === i)} />
    </>
  );
}
