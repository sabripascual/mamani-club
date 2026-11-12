import { requireAdmin } from "@/lib/auth/session";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-dark">Administración</p>
      <AdminTabs />
      {children}
    </>
  );
}
