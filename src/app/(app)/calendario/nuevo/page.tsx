import type { Metadata } from "next";
import { requireActiveMember } from "@/lib/auth/session";
import { getJuntadaTypes } from "@/lib/expenses/queries";
import { createEvent } from "@/lib/calendar/actions";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { EventForm } from "@/components/calendar/event-form";

export const metadata: Metadata = { title: "Nuevo evento · MAMANÍ CLUB" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  await requireActiveMember();
  const { tree } = await getJuntadaTypes();
  return (
    <>
      <PageHeader eyebrow="Calendario" title="Nuevo evento">Todas lo ven y se pueden sumar. Cuando llegue el día, lo convertís en juntada para cargar los gastos.</PageHeader>
      <EventForm action={createEvent} types={tree} today={todayAR()} defaultDate={dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : undefined} />
    </>
  );
}
