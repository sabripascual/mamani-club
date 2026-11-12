import { redirect } from "next/navigation";
import { requireActiveMember } from "@/lib/auth/session";
import { BottomNav, SideNav } from "@/components/nav/app-nav";
import { pendingRequestsCount } from "@/lib/admin/pending";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveMember();
  if (profile.must_change_password) redirect("/cambiar-contrasena");

  const isAdmin = profile.role === "admin";
  const pending = isAdmin ? await pendingRequestsCount() : 0;

  return (
    <div className="flex min-h-dvh">
      <SideNav isAdmin={isAdmin} pendingRequests={pending} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-32 lg:px-10 lg:pt-12 lg:pb-16">
        {children}
      </main>
      <BottomNav pendingRequests={pending} />
    </div>
  );
}
