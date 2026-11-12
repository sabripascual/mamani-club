import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, ReceiptText } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getEvent } from "@/lib/calendar/queries";
import { arDate, arTime, RSVP_LABEL, type Rsvp } from "@/lib/calendar/types";
import { getJuntadaTypes, getMembers } from "@/lib/expenses/queries";
import { formatDayLong } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { MemberAvatar, memberName } from "@/components/expenses/member-avatar";
import { MapsLink } from "@/components/maps-link";
import { CancelEventButton, ConvertButton, RsvpButtons } from "@/components/calendar/event-actions";

export const metadata: Metadata = { title: "Evento · MAMANÍ CLUB" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { profile } = await requireActiveMember();
  const [data, { byId: typeById }, { byId: memberById }] = await Promise.all([getEvent(id), getJuntadaTypes(true), getMembers()]);
  if (!data || data.event.status !== "active") notFound();
  const { event: e, rsvps } = data;
  const me = profile.id;
  const canManage = profile.role === "admin" || e.created_by === me;
  const mine = rsvps.find((r) => r.member_id === me)?.response;
  const type = typeById.get(e.type_id);
  const groups = (["going", "maybe", "no"] as Rsvp[]).map((r) => ({ r, list: rsvps.filter((x) => x.response === r) }));

  return (
    <>
      <Link href={`/calendario?mes=${arDate(e.starts_at).slice(0, 7)}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite"><ArrowLeft className="size-4" /> Calendario</Link>
      <header className="mb-6 flex items-start gap-4">
        <CategoryIcon icon={type?.icon ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-dark">{type?.name}</p>
          <h1 className="mt-1 font-display text-[1.9rem] leading-tight font-semibold">{e.title}</h1>
          <p className="mt-1 text-sm text-graphite/60 first-letter:uppercase">{formatDayLong(arDate(e.starts_at))} · {arTime(e.starts_at)} h</p>
          {e.location && <MapsLink location={e.location} />}
        </div>
        {canManage && !e.juntada_id && (
          <Link href={`/calendario/${e.id}/editar`} aria-label="Editar evento" className="inline-flex size-10 items-center justify-center rounded-full bg-white/70 ring-1 ring-graphite/10"><Pencil className="size-4" /></Link>
        )}
      </header>

      {e.description && <p className="mb-6 whitespace-pre-line text-graphite/75">{e.description}</p>}

      <Card className="mb-6">
        <p className="mb-3 font-semibold">¿Vas?</p>
        <RsvpButtons eventId={e.id} current={mine} />
      </Card>

      {e.juntada_id ? (
        <Link href={`/gastos/${e.juntada_id}`} className="mb-8 flex items-center gap-3 rounded-[var(--radius-card)] bg-lime p-4 font-semibold transition hover:brightness-95">
          <ReceiptText className="size-5" /> Ya es juntada: ver gastos y cuentas
        </Link>
      ) : canManage ? (
        <div className="mb-8"><ConvertButton eventId={e.id} /></div>
      ) : (
        <p className="mb-8 rounded-2xl bg-white/50 p-4 text-sm text-graphite/60">Cuando llegue el día, {memberName(memberById.get(e.created_by))} lo convierte en juntada para cargar los gastos.</p>
      )}

      {groups.map(({ r, list }) => list.length > 0 && (
        <section key={r} className="mb-6">
          <h2 className="mb-2 font-display text-lg">{RSVP_LABEL[r]} <span className="text-base text-graphite/50">{list.length}</span></h2>
          <ul className="flex flex-wrap gap-2">
            {list.map((x) => (
              <li key={x.member_id} className="flex items-center gap-2 rounded-full bg-white/60 py-1 pr-3 pl-1">
                <MemberAvatar m={memberById.get(x.member_id)} /><span className="text-sm font-semibold">{memberName(memberById.get(x.member_id), me)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-6 mb-6 text-xs text-graphite/50">Lo propuso {memberName(memberById.get(e.created_by), me)}</p>
      {canManage && <CancelEventButton eventId={e.id} />}
    </>
  );
}
