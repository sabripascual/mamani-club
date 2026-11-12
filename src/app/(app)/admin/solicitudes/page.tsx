import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { listMembers } from "@/lib/admin/queries";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberIdentity } from "@/components/admin/member-row";
import { RequestActions } from "./request-actions";
import { PasswordRequestActions } from "./password-requests";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Solicitudes · MAMANÍ CLUB" };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function RequestsPage() {
  const supabase = await createClient();
  const [pending, rejected, active, { data: pwRequests }] = await Promise.all([
    listMembers(["pending"]), listMembers(["rejected"]), listMembers(["active"]),
    supabase.from("password_reset_requests").select("id, member_id, created_at").eq("status", "pending").order("created_at"),
  ]);
  const byId = new Map(active.map((m) => [m.id, m]));
  return (
    <>
      {(pwRequests ?? []).length > 0 && (
        <section className="mb-10">
          <h1 className="mb-4 font-display text-[1.8rem] font-semibold">Cambios de contraseña</h1>
          <ul className="flex flex-col gap-3">
            {(pwRequests ?? []).map((r) => {
              const m = byId.get(r.member_id);
              if (!m) return null;
              return (
                <li key={r.id}>
                  <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <MemberIdentity m={m} />
                      <p className="mt-2 text-xs text-graphite/50">Lo pidió el {dateFmt.format(new Date(r.created_at))}</p>
                    </div>
                    <PasswordRequestActions requestId={r.id} name={m.first_name} />
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
