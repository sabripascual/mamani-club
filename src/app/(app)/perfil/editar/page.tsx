import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getAliases } from "@/lib/profile/aliases";
import { signAvatarUrls } from "@/lib/storage/avatars";
import { initials } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ProfileForm } from "../profile-form";
import { AvatarPicker } from "../avatar-picker";
import { AliasManager } from "../alias-manager";

export const metadata: Metadata = { title: "Editar perfil · MAMANÍ CLUB" };

export default async function EditProfilePage() {
  const { profile } = await requireActiveMember();
  const [aliases, urls] = await Promise.all([getAliases([profile.id]), signAvatarUrls([profile.avatar_path])]);
  return (
    <>
      <Link href="/perfil" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite"><ArrowLeft className="size-4" /> Mi perfil</Link>
      <PageHeader eyebrow="Mi perfil" title="Editar perfil" />

      <Card className="mb-8 flex items-center gap-4">
        <AvatarPicker src={profile.avatar_path ? (urls.get(profile.avatar_path) ?? null) : null} initials={initials(profile)} />
        <p className="text-sm text-graphite/60">Tocá la foto para cambiarla.</p>
      </Card>

      <h2 className="mb-3 font-display text-xl">Mis datos</h2>
      <Card className="mb-8"><ProfileForm profile={profile} /></Card>

      <h2 className="mb-1 font-display text-xl">Alias para transferirme</h2>
      <p className="mb-3 text-sm text-graphite/60">Aparecen en “Cómo saldamos” cuando alguien te tiene que pagar.</p>
      <Card className="mb-8"><AliasManager aliases={aliases.get(profile.id) ?? []} /></Card>

      <h2 className="mb-3 font-display text-xl">Contraseña</h2>
      <Card><ChangePasswordForm /></Card>
    </>
  );
}
