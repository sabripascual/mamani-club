import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { getAlbums } from "@/lib/photos/queries";
import { MemoriesCarousel } from "@/components/photos/memories-carousel";
import { requireActiveMember } from "@/lib/auth/session";
import { getCategories, getMemberBalances, getMembers } from "@/lib/expenses/queries";
import { loadDataset, parsePeriod, type PeriodParams } from "@/lib/stats/load";
import { formatMoney } from "@/lib/money/format";
import { todayAR } from "@/lib/dates";
import { displayName } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Wordmark } from "@/components/brand";
import { InstallHint } from "@/components/pwa/install-hint";
import { PeriodFilter } from "@/components/stats/period-filter";
import { Dashboard } from "@/components/stats/dashboard";

export default async function HomePage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const sp = await searchParams;
  const { profile } = await requireActiveMember();
  const today = todayAR();
  const [dataset, balances, { tree }, { members, byId }, albums] = await Promise.all([
    loadDataset(), getMemberBalances(profile.id), getCategories(), getMembers(), getAlbums({ limit: 12 }),
  ]);
  const mine = balances.find((b) => b.currency === "ARS");
  const { filters } = parsePeriod(sp, today);

  return (
    <>
      <header className="mb-6">
        <Wordmark className="w-56 sm:w-64" priority />
        <p className="mt-4 font-display text-[1.7rem] leading-tight font-semibold">Hola, {displayName(profile)} 💖</p>
        <p className="text-sm text-graphite/60">La cuenta de nuestras juntadas.</p>
      </header>
      <InstallHint />

      {/* Los recuerdos van arriba: la app no es solo una calculadora. */}
      <div className="mb-8"><MemoriesCarousel albums={albums} /></div>

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

      {dataset.expenses.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Todavía no hay juntadas">
          Cuando carguen la primera, acá aparecen las cuentas y las estadísticas.
          <div className="mt-4">
            <Link href="/gastos/nuevo" className="font-semibold text-rose-dark underline-offset-4 hover:underline">Cargar una juntada</Link>
          </div>
        </EmptyState>
      ) : (
        <>
          <PeriodFilter sp={sp} basePath="/" categories={tree} members={members.map((m) => ({ id: m.id, name: displayName(m) }))} />
          <Dashboard dataset={dataset} filters={filters} today={today} memberById={byId} />
        </>
      )}

    </>
  );
}
