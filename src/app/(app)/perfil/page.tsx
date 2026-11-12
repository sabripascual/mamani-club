import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { signAvatarUrls } from "@/lib/storage/avatars";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/change-password-form";
import { displayName, initials } from "@/lib/utils";
import { ProfileForm } from "./profile-form";
import { AvatarPicker } from "./avatar-picker";

export const metadata: Metadata = { title: "Mi perfil · MAMANÍ CLUB" };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function ProfilePage() {
  const { profile } = await requireActiveMember();
  const urls = await signAvatarUrls([profile.avatar_path]);
  const avatarUrl = profile.avatar_path ? urls.get(profile.avatar_path) : null;

  return (
    <>
      <PageHeader eyebrow="Mi perfil" title={displayName(profile)} />

      <Card className="flex items-center gap-5">
        <AvatarPicker src={avatarUrl ?? null} initials={initials(profile)} />
        <div className="min-w-0">
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

      <p className="mt-6 rounded-2xl bg-white/50 px-4 py-3 text-sm text-graphite/60">
        Tu resumen financiero (adelantos, consumo y deudas) aparece acá desde la Fase 2.
      </p>

      <h2 className="mt-10 mb-3 font-display text-xl">Mis datos</h2>
      <Card>
        <ProfileForm profile={profile} />
      </Card>

      <h2 className="mt-10 mb-3 font-display text-xl">Contraseña</h2>
      <Card>
        <ChangePasswordForm />
      </Card>

      <form action={signOut} className="mt-10">
        <Button variant="ghost" type="submit" className="w-full">
          <LogOut className="size-4" /> Cerrar sesión
        </Button>
      </form>
    </>
  );
}
