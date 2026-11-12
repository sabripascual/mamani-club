import { Camera, ReceiptText } from "lucide-react";
import Link from "next/link";
import { requireActiveMember } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Wordmark } from "@/components/brand";
import { displayName } from "@/lib/utils";
import { InstallHint } from "@/components/pwa/install-hint";

export default async function HomePage() {
  const { profile } = await requireActiveMember();
  return (
    <>
      <Wordmark className="mb-6 block text-base lg:hidden" />
      <PageHeader eyebrow="Inicio" title={`Hola, ${displayName(profile)}`}>
        Acá vas a ver cómo vienen las cuentas y los recuerdos del club.
      </PageHeader>

      <InstallHint />
      <section className="flex flex-col gap-4">
        <EmptyState icon={ReceiptText} title="Todavía no hay juntadas">
          Cuando carguen la primera, acá aparecen el total gastado, lo pendiente y las estadísticas.
          <div className="mt-4">
            <Link href="/gastos/nuevo" className="font-semibold text-rose-dark underline-offset-4 hover:underline">
              Cargar una juntada
            </Link>
          </div>
        </EmptyState>
        <EmptyState icon={Camera} title="Así la pasamos">
          Las fotos de cada juntada van a aparecer en este carrusel.
        </EmptyState>
      </section>
    </>
  );
}
