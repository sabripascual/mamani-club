import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getMembers } from "@/lib/expenses/queries";
import { getCards } from "@/lib/cuotitas/queries";
import { createCuotita } from "@/lib/cuotitas/actions";
import { monthOf } from "@/lib/cuotitas/types";
import { getAliases } from "@/lib/profile/aliases";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { CuotitaForm } from "@/components/cuotitas/cuotita-form";

export const metadata: Metadata = { title: "Nueva cuotita · MAMANÍ CLUB" };

export default async function NewCuotitaPage() {
  const { profile } = await requireActiveMember();
  const { members } = await getMembers();
  const active = members.filter((m) => m.status === "active").map((m) => m.id);
  const [cards, aliases] = await Promise.all([getCards(active), getAliases([profile.id])]);
  return (
    <>
      <Link href="/cuotitas" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite"><ArrowLeft className="size-4" /> Las Cuotitas</Link>
      <PageHeader eyebrow="Mamaní te banca" title="Nueva cuotita">Dividimos el total entre las que participan y en cuotas, al centavo.</PageHeader>
      <CuotitaForm action={createCuotita} members={members} meId={profile.id} cards={cards} myAliases={aliases.get(profile.id) ?? []} thisMonth={monthOf(todayAR())} />
    </>
  );
}
