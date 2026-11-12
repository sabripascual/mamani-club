import type { Metadata } from "next";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getJuntadaTypes, getMembers } from "@/lib/expenses/queries";
import { createJuntada } from "@/lib/expenses/actions";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { JuntadaForm } from "@/components/expenses/juntada-form";
import { getAliases } from "@/lib/profile/aliases";

export const metadata: Metadata = { title: "Nueva juntada · MAMANÍ CLUB" };

export default async function NewJuntadaPage() {
  const { profile } = await requireActiveMember();
  const [{ tree: types }, { tree: gastoCats }, { members }, myAliases] = await Promise.all([getJuntadaTypes(), getCategories(), getMembers(), getAliases([profile.id])]);
  return (
    <>
      <PageHeader eyebrow="Agregar" title="Nueva juntada">
        Creá la juntada con quiénes van y, si ya sabés, el primer gasto. Después cada una puede sumar los suyos.
      </PageHeader>
      <JuntadaForm action={createJuntada} types={types} gastoCategories={gastoCats} members={members} meId={profile.id} today={todayAR()} myAliases={myAliases.get(profile.id) ?? []} />
    </>
  );
}
