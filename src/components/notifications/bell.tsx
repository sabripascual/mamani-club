import Link from "next/link";
import { Bell } from "lucide-react";

/** Campanita del inicio, con la cantidad de avisos nuevos. */
export function NotificationBell({ count }: { count: number }) {
  return (
    <Link href="/notificaciones" aria-label={count ? `Notificaciones, ${count} nuevas` : "Notificaciones"}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/80 ring-1 ring-graphite/10 transition active:scale-95">
      <Bell className="size-5" strokeWidth={2.1} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-dark px-1 text-[11px] font-bold text-white ring-2 ring-cream">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
