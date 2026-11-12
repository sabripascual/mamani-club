import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Ingresar · MAMANÍ CLUB" };

export default async function SignInPage() {
  if (await getSession()) redirect("/");
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-dark">Hola de nuevo</p>
      <h1 className="mt-2 font-display text-[2.6rem] leading-[1.05] font-semibold">
        La cuenta de nuestras juntadas.
      </h1>
      <SignInForm />
    </>
  );
}
