import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bell, CalendarCheck, ChevronRight, Wallet } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { listInbox, pendingRsvps } from "@/lib/notifications/queries";
import { getMemberBalances } from "@/lib/expenses/queries";
import { birthdaysToday } from "@/lib/calendar/queries";
import { eventTimeLabel } from "@/lib/calendar/types";
import { formatMoney } from "@/lib/money/format";
import { todayAR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkRead } from "@/components/notifications/mark-read";

export const metadata: Metadata = { title: "Notificaciones · MAMANÍ CLUB" };

const DAY = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });

/** "hace 5 min" · "hace 3 h" · "ayer 21:30" · "lun 3 nov". */
function when(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 60_000;
  if (diff < 1) return "recién";
  if (diff < 60) return `hace ${Math.floor(diff)} min`;
  if (diff < 12 * 60) return `hace ${Math.floor(diff / 60)} h`;
  if (diff < 36 * 60) return `ayer ${TIME.format(new Date(ts))}`;
  return DAY.format(new Date(ts)).replace(".", "");
}

export default async function NotificacionesPage() {
  const { profile } = await requireActiveMember();
  const me = profile.id;
  const today = todayAR();
  const [inbox, pending, balances, cumples] = await Promise.all([
    listInbox(me), pendingRsvps(me), getMemberBalances(me), birthdaysToday(today),
  ]);
  const owe = balances.filter((b) => b.i_owe_cents > 0);
  const unread = inbox.filter((n) => !n.read_at).length;
  const hasPending = pending.length > 0 || owe.length > 0 || cumples.length > 0;

  return (
    <>
      <MarkRead unread={unread} />
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite/60 hover:text-graphite">
        <ArrowLeft className="size-4" /> Inicio
      </Link>
      <PageHeader eyebrow="Campanita" title="Notificaciones" />

      {hasPending && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl">Pendientes</h2>
          <ul className="flex flex-col gap-2">
            {cumples.map((c) => (
              <li key={c.id}>
                <Link href="/calendario" className="flex items-center gap-3 rounded-2xl bg-rose/25 p-3 ring-1 ring-rose/30">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-xl">🎂</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold">{c.id === me ? "¡Hoy es tu cumple, perrita!" : `Hoy cumple ${c.name}`}</span>
                    <span className="block text-graphite/60">{c.id === me ? "El club te quiere 💖" : `Cumple ${c.age}. ¡Saludala! 💖`}</span>
                  </span>
                </Link>
              </li>
            ))}
            {pending.map((e) => (
              <li key={e.id}>
                <Link href={`/calendario/${e.id}`} className="flex items-center gap-3 rounded-2xl bg-lime/45 p-3 ring-1 ring-lime">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white"><CalendarCheck className="size-5" /></span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-semibold">Confirmá si vas: {e.title}</span>
                    <span className="block text-graphite/60 first-letter:uppercase">{DAY.format(new Date(e.starts_at)).replace(".", "")} · {eventTimeLabel({ ...e, ends_at: null })}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-graphite/40" />
                </Link>
              </li>
            ))}
            {owe.map((b) => (
              <li key={b.currency}>
                <Link href="/gastos/balances" className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-rose/40">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose/25"><Wallet className="size-5" /></span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold">Debés {formatMoney(b.i_owe_cents, b.currency)} 🐀</span>
                    <span className="block text-graphite/60">Mirá a quién le tenés que transferir</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-graphite/40" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-3 font-display text-xl">Recientes</h2>
      {inbox.length === 0 ? (
        <EmptyState icon={Bell} title="Todavía no hay notificaciones">Acá se van a juntar todos los avisos que te lleguen.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {inbox.map((n) => (
            <li key={n.id}>
              <Link href={n.url} className={`flex gap-3 rounded-2xl p-3 transition hover:bg-white ${n.read_at ? "bg-white/45" : "bg-white ring-1 ring-rose/40"}`}>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-rose-dark"}`} aria-hidden />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-semibold break-words">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-graphite/50">{when(n.created_at)}</span>
                  </span>
                  <span className="block break-words text-graphite/65">{n.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
