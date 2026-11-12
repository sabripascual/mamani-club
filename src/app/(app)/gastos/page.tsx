import type { Metadata } from "next";
import { ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Gastos · MAMANÍ CLUB" };

export default function ExpensesPage() {
  return (
    <>
      <PageHeader eyebrow="Gastos" title="Nuestras juntadas" />
      <EmptyState icon={ReceiptText} title="Todavía no hay juntadas">
        La carga de gastos, divisiones y pagos llega en la Fase 2.
      </EmptyState>
    </>
  );
}
