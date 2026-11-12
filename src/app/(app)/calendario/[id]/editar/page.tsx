import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireActiveMember } from "@/lib/auth/session";
import { getEvent } from "@/lib/calendar/queries";
import { updateEvent } from "@/lib/calendar/actions";
import { arDate, arTime } from "@/lib/calendar/types";
import { getJuntadaTypes } from "@/lib/expenses/queries";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { EventForm } from "@/components/calendar/event-form";

export const metadata: Metadata = { title: "Editar evento · MAMANÍ CLUB" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { tree }] = await Promise.all([getEvent(id), getJuntadaTypes()]);
  if (!data) notFound();
  const e = data.event;
  if (e.status !== "active" || (profile.role !== "admin" && e.created_by !== profile.id)) redirect(`/calendario/${id}`);
  return (
    <>
      <PageHeader eyebrow="Editar evento" title={e.title} />
      <EventForm action={updateEvent.bind(null, id)} types={tree} today={todayAR()}
        initial={{ title: e.title, date: arDate(e.starts_at), time: arTime(e.starts_at), type_id: e.type_id, location: e.location, description: e.description }} />
    </>
  );
}
