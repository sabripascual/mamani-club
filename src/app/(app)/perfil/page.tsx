import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { signAvatarUrls } from "@/lib/storage/avatars";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { displayName, initials } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { getAliases, birthdayLabel } from "@/lib/profile/aliases";
import { todayAR } from "@/lib/dates";
import { Cake, Pencil, Wallet } from "lucide-react";
import { CopyAlias } from "@/components/copy-alias";
import { PushToggle } from "@/components/pwa/push-toggle";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { pendingRequestsCount } from "@/lib/admin/pending";
import { vapidPublicKey } from "@/lib/push/send";
import { MemberFinancials, type MovementFilters } from "@/components/expenses/member-financials";

export const metadata: Metadata = { title: "Mi perfil · MAMANÍ CLUB" };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function ProfilePage({ searchParams }: { searchParams: Promise<MovementFilters> }) {
  const filters = await searchParams;
  const { profile } = await requireActiveMember();
  const [urls, aliasMap] = await Promise.all([signAvatarUrls([profile.avatar_path]), getAliases([profile.id])]);
  const aliases = aliasMap.get(profile.id) ?? [];
  const bday = birthdayLabel(profile.birth_date, todayAR());
  const isAdmin = profile.role === "admin";
  const pendingRequests = isAdmin ? await pendingRequestsCount() : 0;
  const avatarUrl = profile.avatar_path ? urls.get(profile.avatar_path) : null;

  return (
    <>
      <PageHeader eyebrow="Mi perfil" title={displayName(profile)} />

      <Card className="flex items-center gap-5">
        <Avatar src={avatarUrl ?? null} initials={initials(profile)} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl">
            {profile.first_name} {profile.last_name}
          </p>
          <p className="text-sm text-graphite/60">@{profile.username}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-blush px-3 py-1 font-semibold">
              {profile.role === "admin" ? "Admin" : "Integrante"}
            </span>
            {profile.joined_at && (
              <span className="rounded-full bg-powder/50 px-3 py-1">
                En el club desde {dateFmt.format(new Date(profile.joined_at))}
              </span>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card className="flex items-start gap-3 p-4">
          <Cake className="mt-0.5 size-5 shrink-0 text-rose-dark" strokeWidth={1.8} />
          <div className="min-w-0 text-sm">
            <p className="text-graphite/60">Cumpleaños</p>
            {bday ? <p className="font-semibold">{bday.day} · {bday.age} años</p> : <Link href="/perfil/editar" className="font-semibold text-rose-dark">Cargá tu fecha de nacimiento</Link>}
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-4">
          <Wallet className="mt-0.5 size-5 shrink-0 text-rose-dark" strokeWidth={1.8} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-graphite/60">Alias para transferirme</p>
            {aliases.length === 0 ? (
              <Link href="/perfil/editar" className="font-semibold text-rose-dark">Cargá tus alias</Link>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {aliases.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span className="truncate font-mono font-semibold">{a.alias}</span>
                    {a.is_primary && <span className="rounded-full bg-lime px-2 text-[10px] font-semibold">principal</span>}
                    <CopyAlias alias={a.alias} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Link href="/perfil/editar" className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full bg-graphite text-[15px] font-semibold text-cream transition active:scale-[0.98]">
        <Pencil className="size-4" /> Editar perfil
      </Link>

      {isAdmin && (
        <Link href="/admin/solicitudes" className="mt-6 flex items-center gap-3 rounded-[var(--radius-card)] bg-graphite p-4 text-cream transition hover:bg-graphite/90">
          <ShieldCheck className="size-5 text-lime" />
          <span className="flex-1">
            <strong>Administración</strong>
            <span className="block text-sm text-cream/70">Solicitudes, integrantes, categorías, notificaciones y auditoría</span>
          </span>
          {pendingRequests > 0 && (
            <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-rose px-2 py-0.5 text-sm font-bold text-graphite">{pendingRequests}</span>
          )}
          <ChevronRight className="size-5 text-cream/60" />
        </Link>
      )}

      <h2 className="mt-10 mb-1 font-display text-xl">Notificaciones</h2>
      <p className="mb-3 text-sm text-graphite/60">
        Deudas (10:00), cumpleaños, eventos y la frase de los lunes (8:00), y avisos cuando te cargan un gasto o te pagan.
      </p>
      <Card><PushToggle vapidKey={vapidPublicKey()} /></Card>

      <h2 className="mt-10 mb-3 font-display text-xl">Mis números</h2>
      <MemberFinancials memberId={profile.id} filters={filters} basePath="/perfil" />


      <form action={signOut} className="mt-10">
        <Button variant="ghost" type="submit" className="w-full">
          <LogOut className="size-4" /> Cerrar sesión
        </Button>
      </form>
    </>
  );
}
