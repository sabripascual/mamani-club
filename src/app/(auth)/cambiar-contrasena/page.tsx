import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata: Metadata = { title: "Nueva contraseña · MAMANÍ CLUB" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/ingresar");
  return (
    <>
      <h1 className="font-display text-[2.2rem] leading-tight font-semibold">Elegí una contraseña nueva</h1>
      <p className="mt-3 text-graphite/65">
        Estás usando una contraseña temporal. Cambiala para seguir.
      </p>
      <ChangePasswordForm redirectTo="/" />
    </>
  );
}
