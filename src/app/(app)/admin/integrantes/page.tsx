import type { Metadata } from "next";
import { listMembers } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { MemberIdentity } from "@/components/admin/member-row";
import { MemberActions } from "./member-actions";

export const metadata: Metadata = { title: "Integrantes · MAMANÍ CLUB" };

export default async function MembersPage() {
  const { profile: me } = await requireAdmin();
  const members = await listMembers(["active", "inactive"]);
  const active = members.filter((m) => m.status === "active");
  const inactive = members.filter((m) => m.status === "inactive");

  return (
    <>
      <h1 className="mb-1 font-display text-[1.8rem] font-semibold">Integrantes</h1>
      <p className="mb-5 text-sm text-graphite/60">
        {active.length} activas{inactive.length > 0 && ` · ${inactive.length} desactivadas`}
      </p>
      <ul className="flex flex-col gap-3">
        {[...active, ...inactive].map((m) => (
          <li key={m.id}>
            <Card className={m.status === "inactive" ? "opacity-70" : undefined}>
              <div className="flex items-center justify-between gap-3">
                <MemberIdentity m={m} />
                <div className="flex shrink-0 gap-1.5 text-xs font-semibold">
                  {m.role === "admin" && <span className="rounded-full bg-graphite px-2.5 py-1 text-cream">Admin</span>}
                  {m.status === "inactive" && <span className="rounded-full bg-powder px-2.5 py-1">Desactivada</span>}
                </div>
              </div>
              <MemberActions member={{ id: m.id, role: m.role, status: m.status, name: m.first_name }} isMe={m.id === me.id} />
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
