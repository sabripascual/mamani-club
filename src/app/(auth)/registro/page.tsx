import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Pedir acceso · MAMANÍ CLUB" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/");
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-dark">Sumate al club</p>
      <h1 className="mt-2 font-display text-[2.4rem] leading-[1.05] font-semibold">Pedí tu acceso</h1>
      <p className="mt-3 text-graphite/65">
        Creá tu cuenta y una admin del grupo va a aprobar tu ingreso.
      </p>
      <SignUpForm />
    </>
  );
}
