import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";

/** Aviso para admins cuando hay solicitudes de acceso esperando. */
export function PendingRequestsBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link
      href="/admin/solicitudes"
      className="mb-6 flex items-center gap-3 rounded-[var(--radius-card)] bg-lime p-4 text-graphite transition hover:brightness-95"
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-graphite text-lime">
        <UserPlus className="size-5" />
      </span>
      <span className="flex-1 text-sm">
        <strong>{count === 1 ? "Hay 1 solicitud pendiente" : `Hay ${count} solicitudes pendientes`}</strong>
        <span className="block text-graphite/70">Tocá para aprobar o rechazar</span>
      </span>
      <ChevronRight className="size-5" />
    </Link>
  );
}
