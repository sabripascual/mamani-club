import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getJuntada, getJuntadaTypes, getMembers } from "@/lib/expenses/queries";
import { formatMoney } from "@/lib/money/format";
import { formatDayLong } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { ActionCard } from "@/components/ui/action-card";
import { AvatarStack } from "@/components/expenses/member-avatar";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { FinishLoadingButton } from "../actions-client";

export const metadata: Metadata = { title: "Juntada creada · MAMANÍ CLUB" };

/** Confirmación al terminar de crear una juntada: resumen + seguir cargando o finalizar. */
export default async function JuntadaCreadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  await requireActiveMember();
  const [data, { byId: typeById }, { byId: memberById }] = await Promise.all([getJuntada(id), getJuntadaTypes(true), getMembers()]);
  if (!data || data.juntada.status !== "active") notFound();
  const { juntada: j, gastos, attendees, status } = data;
  const type = typeById.get(j.type_id);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-4 text-center">
      <span className="mb-5 flex size-24 items-center justify-center rounded-full bg-rose shadow-xl shadow-rose/30 ring-8 ring-lime">
        <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="#38333b" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-dark">¡Listo!</p>
      <h1 className="mt-1 font-display text-[2rem] leading-tight font-semibold">Juntada creada</h1>

      <Card className="mt-6 w-full text-left">
        <div className="flex items-start gap-3">
          <CategoryIcon icon={type?.icon ?? null} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-semibold">{j.title}</p>
            <p className="text-xs text-graphite/55">{type?.name}</p>
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          <li className="flex items-center gap-2"><CalendarDays className="size-4 text-graphite/50" /><span className="first-letter:uppercase">{formatDayLong(j.occurred_on)}</span></li>
          {j.location && <li className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-graphite/50" /><span className="truncate">{j.location}</span></li>}
          <li className="flex items-center gap-2">
            <Users className="size-4 text-graphite/50" />
            <span>{attendees.length} {attendees.length === 1 ? "va" : "van"}</span>
            <AvatarStack members={attendees.map((a) => memberById.get(a))} />
          </li>
        </ul>
        <p className="mt-4 rounded-2xl bg-cream/80 p-3 text-sm">
          {gastos.length === 0
            ? "Todavía no tiene gastos."
            : <><strong>{gastos.length} {gastos.length === 1 ? "gasto" : "gastos"}</strong> · total <strong>{formatMoney(status?.total_cents ?? 0, j.currency)}</strong></>}
        </p>
      </Card>

      <div className="mt-6 flex w-full flex-col gap-3 text-left">
        <ActionCard href={`/gastos/${j.id}/gasto/nuevo`} title={gastos.length === 0 ? "Agregar un gasto" : "Agregar otro gasto"} subtitle="Podés cargarlos ahora o más tarde" />
        <FinishLoadingButton juntadaId={j.id} label="Finalizar e ir al inicio" hint="Les avisamos a las de la juntada." />
        <Link href={`/gastos/${j.id}`} className="py-2 text-center text-sm font-semibold text-rose-dark">Ver la juntada</Link>
      </div>
    </div>
  );
}
