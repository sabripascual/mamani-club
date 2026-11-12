import type { Metadata } from "next";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar contraseña · MAMANÍ CLUB" };

export default function RecoverPage() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-dark">Recuperar acceso</p>
      <h1 className="mt-2 font-display text-[2.3rem] leading-[1.05] font-semibold">¿Olvidaste tu contraseña?</h1>
      <p className="mt-3 text-graphite/65">
        Le avisamos a las admins del club. Una de ellas te va a generar una contraseña temporal y te la va a pasar por privado.
      </p>
      <RecoverForm />
    </>
  );
}
