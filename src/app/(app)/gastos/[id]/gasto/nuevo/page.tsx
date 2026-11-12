import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getJuntada, getMembers } from "@/lib/expenses/queries";
import { createGasto } from "@/lib/expenses/actions";
import { PageHeader } from "@/components/ui/page-header";
import { GastoForm } from "@/components/expenses/gasto-form";

export const metadata: Metadata = { title: "Agregar gasto · MAMANÍ CLUB" };

export default async function NewGastoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { tree }, { members }] = await Promise.all([getJuntada(id), getCategories(), getMembers()]);
  if (!data || data.juntada.status !== "active") notFound();
  return (
    <>
      <Link href={`/gastos/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite"><ArrowLeft className="size-4" /> {data.juntada.title}</Link>
      <PageHeader eyebrow="Agregar gasto" title="¿Qué se pagó?" />
      <GastoForm action={createGasto.bind(null, id)} categories={tree} members={members} meId={profile.id} attendees={data.attendees} />
    </>
  );
}
