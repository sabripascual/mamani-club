import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";
import { getAlbums } from "@/lib/photos/queries";
import { MemoriesCarousel } from "@/components/photos/memories-carousel";
import { PendingRequestsBanner } from "@/components/admin/pending-banner";
import { pendingRequestsCount } from "@/lib/admin/pending";
import { requireActiveMember } from "@/lib/auth/session";
import { getMemberBalances, getMembers, listJuntadas } from "@/lib/expenses/queries";
import { RecentExpenses } from "@/components/expenses/recent-expenses";
import { myCuotitasMonth } from "@/lib/cuotitas/queries";
import { createClient } from "@/lib/supabase/server";
import { birthdaysToday } from "@/lib/calendar/queries";
import { CalendarDays, CreditCard, Images, Trophy } from "lucide-react";
import { loadDataset, parseYearMonth, type PeriodParams } from "@/lib/stats/load";
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
import { YearMonthFilter } from "@/components/stats/year-month-filter";
import { Dashboard } from "@/components/stats/dashboard";
import { PersonalDashboard } from "@/components/stats/personal-dashboard";
import { ViewToggle } from "@/components/stats/view-toggle";

export default async function HomePage({ searchParams }: { searchParams: Promise<PeriodParams & { vista?: string }> }) {
  const sp = await searchParams;
  const { profile } = await requireActiveMember();
  const today = todayAR();
  const [dataset, balances, { byId }, albums, recent] = await Promise.all([
    loadDataset(), getMemberBalances(profile.id), getMembers(), getAlbums({ limit: 12 }), listJuntadas({}, 3),
  ]);
  const mine = balances.find((b) => b.currency === "ARS");
  // ¿Fui a las últimas juntadas? (para pintarlas distinto en la lista)
  const supabase = await createClient();
  const { data: myAtt } = recent.length
    ? await supabase.from("juntada_attendees").select("juntada_id").eq("member_id", profile.id).in("juntada_id", recent.map((j) => j.id))
    : { data: [] };
  const attended = new Set((myAtt ?? []).map((a) => a.juntada_id as string));
  const [pendingRequests, myAvatar, cumples, cuotitas] = await Promise.all([
    profile.role === "admin" ? pendingRequestsCount() : Promise.resolve(0),
    signAvatarUrls([profile.avatar_path]).then((m) => (profile.avatar_path ? (m.get(profile.avatar_path) ?? null) : null)),
    birthdaysToday(today),
    myCuotitasMonth(profile.id, `${today.slice(0, 7)}-01`),
  ]);
  const { year, month, filters } = parseYearMonth(sp, today);

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
      {cumples.length > 0 && (
        <div className="relative mb-6 overflow-hidden rounded-[var(--radius-card)] bg-rose p-5 text-graphite ring-4 ring-lime/70">
          <span aria-hidden className="absolute -top-3 -right-2 text-6xl opacity-80">🎉</span>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">¡Hoy hay cumple!</p>
          <p className="mt-1 font-display text-2xl font-semibold">
            {cumples.map((c) => (c.id === profile.id ? "¡Vos! 🎂" : `${c.name} cumple ${c.age}`)).join(" · ")}
          </p>
          <p className="mt-1 text-sm text-graphite/75">{cumples.some((c) => c.id === profile.id) ? "Feliz cumple, perrita. Te queremos 💖" : "Saluden a la perrita 💖"}</p>
        </div>
      )}
      <PendingRequestsBanner count={pendingRequests} />
      <nav aria-label="Accesos rápidos" className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden [scrollbar-width:none]">
        {[["/calendario", "Calendario", CalendarDays], ["/cuotitas", "Cuotitas", CreditCard], ["/rankings", "Rankings", Trophy], ["/recuerdos", "Memories", Images]].map(([href, label, Icon]) => {
          const I = Icon as typeof Trophy;
          return (
            <Link key={href as string} href={href as string} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-white/70 px-4 text-sm font-semibold ring-1 ring-graphite/10">
              <I className="size-4 text-rose-dark" /> {label as string}
            </Link>
          );
        })}
      </nav>
      {!profile.birth_date && (
        <Link href="/perfil/editar" className="mb-6 flex items-center gap-3 rounded-[var(--radius-card)] bg-blush p-4 text-sm transition hover:brightness-95">
          <span className="text-2xl">🎂</span>
          <span className="flex-1"><strong>¿Cuándo es tu cumple?</strong><span className="block text-graphite/65">Cargalo en tu perfil para que el club te salude.</span></span>
        </Link>
      )}
      <InstallHint />

      <div className="mb-8 grid grid-cols-2 gap-3">
        <Link href="/gastos/balances">
          <Card className="h-full bg-rose/20 transition hover:bg-rose/30">
            <p className="text-sm text-graphite/65">Debés</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(mine?.i_owe_cents ?? 0)}</p>
            <p className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-rose-dark">Ver detalle <ChevronRight className="size-3.5" /></p>
          </Card>
        </Link>
        <Link href="/gastos/balances">
          <Card className="h-full bg-powder/45 transition hover:bg-powder/60">
            <p className="text-sm text-graphite/65">Te deben</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(mine?.owed_to_me_cents ?? 0)}</p>
            <p className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-rose-dark">Ver detalle <ChevronRight className="size-3.5" /></p>
          </Card>
        </Link>
      </div>

      {cuotitas.count > 0 && (
        <Link href="/cuotitas" className="mb-8 flex items-center gap-3 rounded-[var(--radius-card)] bg-lime/60 p-4 ring-1 ring-lime transition hover:bg-lime/80">
          <span className="text-2xl" aria-hidden>💳</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-semibold">Cuotitas del mes</span>
            <span className="block text-sm text-graphite/70">
              {[cuotitas.iOwe ? `Pagás ${formatMoney(cuotitas.iOwe)}` : null, cuotitas.owedToMe ? `te pagan ${formatMoney(cuotitas.owedToMe)}` : null].filter(Boolean).join(" · ")}
            </span>
          </span>
          <ChevronRight className="size-5 text-graphite/40" />
        </Link>
      )}

      <div className="mb-8"><RecentExpenses items={recent.map((j) => ({ id: j.id, title: j.title, occurred_on: j.occurred_on, settlement_status: j.summary?.settlement_status ?? "empty", attended: attended.has(j.id) }))} /></div>

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
          <YearMonthFilter year={year} month={month} basePath="/" vista={sp.vista} />
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
