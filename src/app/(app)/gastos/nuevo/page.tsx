import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Nueva juntada · MAMANÍ CLUB" };

export default function NewExpensePage() {
  return (
    <>
      <PageHeader eyebrow="Agregar" title="Nueva juntada" />
      <EmptyState icon={Sparkles} title="Muy pronto">
        Acá vas a poder cargar una juntada, elegir quiénes participaron y dividir el gasto.
      </EmptyState>
    </>
  );
}
