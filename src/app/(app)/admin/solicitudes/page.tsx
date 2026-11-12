import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { listMembers } from "@/lib/admin/queries";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberIdentity } from "@/components/admin/member-row";
import { RequestActions } from "./request-actions";

export const metadata: Metadata = { title: "Solicitudes · MAMANÍ CLUB" };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function RequestsPage() {
  const [pending, rejected] = await Promise.all([listMembers(["pending"]), listMembers(["rejected"])]);
  return (
    <>
      <h1 className="mb-4 font-display text-[1.8rem] font-semibold">Solicitudes de acceso</h1>
      {pending.length === 0 ? (
        <EmptyState icon={Inbox} title="No hay solicitudes pendientes" />
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((m) => (
            <li key={m.id}>
              <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <MemberIdentity m={m} />
                  <p className="mt-2 text-xs text-graphite/50">Pidió acceso el {dateFmt.format(new Date(m.created_at))}</p>
                </div>
                <RequestActions memberId={m.id} />
              </Card>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 font-display text-xl">Rechazadas</h2>
          <ul className="flex flex-col gap-3">
            {rejected.map((m) => (
              <li key={m.id}>
                <Card className="flex flex-col gap-4 opacity-80 sm:flex-row sm:items-center sm:justify-between">
                  <MemberIdentity m={m} />
                  <RequestActions memberId={m.id} approveOnly />
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
