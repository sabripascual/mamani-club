import Link from "next/link";
import { ArrowRight, Camera, ReceiptText } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getMemberBalances, getMembers, listExpenses } from "@/lib/expenses/queries";
import { formatMoney } from "@/lib/money/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Wordmark } from "@/components/brand";
import { InstallHint } from "@/components/pwa/install-hint";
import { ExpenseCard } from "@/components/expenses/expense-card";
import { displayName } from "@/lib/utils";

export default async function HomePage() {
  const { profile } = await requireActiveMember();
  const [expenses, [mine], { byId: catById }, { byId: memberById }] = await Promise.all([
    listExpenses(), getMemberBalances(profile.id).then((b) => [b.find((x) => x.currency === "ARS")]),
    getCategories({ includeArchived: true }), getMembers(),
  ]);
  const recent = expenses.slice(0, 4);

  return (
    <>
      <Wordmark className="mb-6 block text-base lg:hidden" />
      <PageHeader eyebrow="Inicio" title={`Hola, ${displayName(profile)}`} />
      <InstallHint />

      {expenses.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Todavía no hay juntadas">
          Cuando carguen la primera, acá aparecen las cuentas y las estadísticas.
          <div className="mt-4">
            <Link href="/gastos/nuevo" className="font-semibold text-rose-dark underline-offset-4 hover:underline">Cargar una juntada</Link>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3">
            <Link href="/gastos/balances">
              <Card className="h-full bg-rose/20 transition hover:bg-rose/30">
                <p className="text-sm text-graphite/65">Debés</p>
                <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(mine?.i_owe_cents ?? 0)}</p>
              </Card>
            </Link>
            <Link href="/gastos/balances">
              <Card className="h-full bg-powder/45 transition hover:bg-powder/60">
                <p className="text-sm text-graphite/65">Te deben</p>
                <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(mine?.owed_to_me_cents ?? 0)}</p>
              </Card>
            </Link>
          </div>

          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl">Últimas juntadas</h2>
            <Link href="/gastos" className="inline-flex items-center gap-1 text-sm font-semibold text-rose-dark">Ver todas <ArrowRight className="size-4" /></Link>
          </div>
          <ul className="mb-8 flex flex-col gap-2">
            {recent.map((e, i) => (
              <li key={e.id}>
                <ExpenseCard e={e} category={catById.get(e.category_id)} subcategory={e.subcategory_id ? catById.get(e.subcategory_id) : undefined}
                  payer={memberById.get(e.paid_by)} meId={profile.id} index={i} />
              </li>
            ))}
          </ul>
        </>
      )}

      <EmptyState icon={Camera} title="Así la pasamos">
        Las fotos de cada juntada van a aparecer en este carrusel (Fase 4).
      </EmptyState>
    </>
  );
}
