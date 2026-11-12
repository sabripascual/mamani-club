import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { getAlbums } from "@/lib/photos/queries";
import { MemoriesCarousel } from "@/components/photos/memories-carousel";
import { PendingRequestsBanner } from "@/components/admin/pending-banner";
import { pendingRequestsCount } from "@/lib/admin/pending";
import { requireActiveMember } from "@/lib/auth/session";
import { getJuntadaTypes, getMemberBalances, getMembers, listJuntadas } from "@/lib/expenses/queries";
import { RecentExpenses } from "@/components/expenses/recent-expenses";
import { loadDataset, parsePeriod, type PeriodParams } from "@/lib/stats/load";
import { formatMoney } from "@/lib/money/format";
import { todayAR } from "@/lib/dates";
import { displayName } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Wordmark } from "@/components/brand";
import { Avatar } from "@/components/ui/avatar";
import { signAvatarUrls } from "@/lib/storage/avatars";
import { initials } from "@/lib/utils";
import { InstallHint } from "@/components/pwa/install-hint";
import { PeriodFilter } from "@/components/stats/period-filter";
import { Dashboard } from "@/components/stats/dashboard";
import { PersonalDashboard } from "@/components/stats/personal-dashboard";
import { ViewToggle } from "@/components/stats/view-toggle";

export default async function HomePage({ searchParams }: { searchParams: Promise<PeriodParams & { vista?: string }> }) {
  const sp = await searchParams;
  const { profile } = await requireActiveMember();
  const today = todayAR();
  const [dataset, balances, { tree }, { members, byId }, albums, recent] = await Promise.all([
    loadDataset(), getMemberBalances(profile.id), getJuntadaTypes(), getMembers(), getAlbums({ limit: 12 }), listJuntadas({}, 3),
  ]);
  const mine = balances.find((b) => b.currency === "ARS");
  const [pendingRequests, myAvatar] = await Promise.all([
    profile.role === "admin" ? pendingRequestsCount() : Promise.resolve(0),
    signAvatarUrls([profile.avatar_path]).then((m) => (profile.avatar_path ? (m.get(profile.avatar_path) ?? null) : null)),
  ]);
  const { filters } = parsePeriod(sp, today);

  return (
    <>
      <header className="mb-6">
        <Wordmark className="w-56 sm:w-64" priority />
        <Link href="/perfil" className="mt-4 flex items-center gap-3">
          <Avatar src={myAvatar} initials={initials(profile)} size="md" className="ring-rose" />
          <span>
            <span className="block font-display text-[1.6rem] leading-tight font-semibold">Hola, {displayName(profile)} 💖</span>
            <span className="block text-sm text-graphite/60">La cuenta de nuestras juntadas.</span>
          </span>
        </Link>
      </header>
      <PendingRequestsBanner count={pendingRequests} />
      <InstallHint />

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

      <div className="mb-8"><RecentExpenses items={recent.map((j) => ({ id: j.id, title: j.title, occurred_on: j.occurred_on, settlement_status: j.summary?.settlement_status ?? "empty" }))} /></div>

      {dataset.juntadas.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Todavía no hay juntadas">
          Cuando carguen la primera, acá aparecen las cuentas y las estadísticas.
          <div className="mt-4">
            <Link href="/gastos/nuevo" className="font-semibold text-rose-dark underline-offset-4 hover:underline">Cargar una juntada</Link>
          </div>
        </EmptyState>
      ) : (
        <>
          <ViewToggle sp={sp} current={sp.vista === "yo" ? "yo" : "grupo"} />
          <PeriodFilter sp={sp} basePath="/" categories={tree} members={members.map((m) => ({ id: m.id, name: displayName(m) }))} showMember={sp.vista !== "yo"} />
          {sp.vista === "yo" ? (
            <PersonalDashboard dataset={dataset} filters={filters} today={today} memberId={profile.id} />
          ) : (
            <Dashboard dataset={dataset} filters={filters} today={today} memberById={byId} />
          )}
        </>
      )}

      {/* Manija Memories: al final, después de las cuentas y las estadísticas. */}
      <div className="mt-10"><MemoriesCarousel albums={albums} /></div>
    </>
  );
}
