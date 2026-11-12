import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Rankings · MAMANÍ CLUB" };

export default function RankingsPage() {
  return (
    <>
      <PageHeader eyebrow="Rankings" title="Las del club" />
      <EmptyState icon={Trophy} title="Sin datos todavía">
        Los rankings se calculan con las juntadas reales. Van a aparecer cuando haya juntadas cargadas.
      </EmptyState>
    </>
  );
}
