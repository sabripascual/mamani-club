import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Hourglass, Ban, MoonStar } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { displayName } from "@/lib/utils";

export const metadata: Metadata = { title: "Solicitud en revisión · MAMANÍ CLUB" };
export const dynamic = "force-dynamic";

const copy = {
  pending: {
    icon: Hourglass,
    title: "Tu solicitud está en revisión",
    body: "Una admin del grupo tiene que aprobar tu ingreso. Cuando lo haga, vas a poder ver las juntadas, las cuentas y los recuerdos.",
  },
  rejected: {
    icon: Ban,
    title: "Tu solicitud no fue aprobada",
    body: "Si creés que es un error, hablá con alguna admin del grupo.",
  },
  inactive: {
    icon: MoonStar,
    title: "Tu cuenta está desactivada",
    body: "Tu historial sigue guardado. Si querés volver, pedile a una admin que te reactive.",
  },
} as const;

export default async function PendingPage() {
  const session = await getSession();
  if (!session) redirect("/ingresar");
  const { status } = session.profile;
  if (status === "active") redirect("/");
  const c = copy[status];
  const Icon = c.icon;

  return (
    <div className="text-center">
      <span className="mx-auto mb-6 inline-flex size-20 items-center justify-center rounded-full bg-blush">
        <Icon className="size-8 text-rose-dark" strokeWidth={1.5} />
      </span>
      <p className="text-sm text-graphite/60">Hola, {displayName(session.profile)}</p>
      <h1 className="mt-2 font-display text-[2rem] leading-tight font-semibold">{c.title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-graphite/65">{c.body}</p>
      <form action={signOut} className="mt-10">
        <Button variant="ghost" type="submit">
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
