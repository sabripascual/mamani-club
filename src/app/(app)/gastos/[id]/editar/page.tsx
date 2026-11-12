import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getJuntada, getJuntadaTypes, getMembers } from "@/lib/expenses/queries";
import { updateJuntada } from "@/lib/expenses/actions";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { JuntadaForm } from "@/components/expenses/juntada-form";

export const metadata: Metadata = { title: "Editar juntada · MAMANÍ CLUB" };

export default async function EditJuntadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { tree: types }, { tree: gastoCats }, { members }] = await Promise.all([getJuntada(id), getJuntadaTypes(), getCategories(), getMembers()]);
  if (!data) notFound();
  const { juntada: j, attendees } = data;
  if (j.status !== "active" || (profile.role !== "admin" && j.created_by !== profile.id)) redirect(`/gastos/${id}`);
  return (
    <>
      <Link href={`/gastos/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite"><ArrowLeft className="size-4" /> Volver</Link>
      <PageHeader eyebrow="Editar juntada" title={j.title} />
      <JuntadaForm action={updateJuntada.bind(null, id)} types={types} gastoCategories={gastoCats} members={members} meId={profile.id} today={todayAR()}
        initial={{ title: j.title, occurred_on: j.occurred_on, type_id: j.type_id, description: j.description, attendees, location: j.location }} />
    </>
  );
}
