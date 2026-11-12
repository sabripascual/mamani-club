import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getCalendarRange } from "@/lib/calendar/queries";
import { ensureHolidays } from "@/lib/calendar/holidays";
import { arDate, arTime, RSVP_LABEL } from "@/lib/calendar/types";
import { getJuntadaTypes } from "@/lib/expenses/queries";
import { todayAR, formatMonth, formatDayLong } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { CategoryIcon } from "@/components/expenses/category-icon";

export const metadata: Metadata = { title: "Calendario · MAMANÍ CLUB" };

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ mes?: string; dia?: string }> }) {
  const sp = await searchParams;
  const { profile } = await requireActiveMember();
  const today = todayAR();
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  await ensureHolidays(y);
  const [{ events, rsvps, myRsvp, birthdays, holidays }, { byId: typeById }] = await Promise.all([getCalendarRange(from, to, profile.id), getJuntadaTypes(true)]);

  const byDay = new Map<string, { events: typeof events; birthdays: typeof birthdays; holidays: typeof holidays }>();
  const slot = (d: string) => { if (!byDay.has(d)) byDay.set(d, { events: [], birthdays: [], holidays: [] }); return byDay.get(d)!; };
  for (const e of events) slot(arDate(e.starts_at)).events.push(e);
  for (const b of birthdays) slot(b.day).birthdays.push(b);
  for (const h of holidays) slot(h.day).holidays.push(h);

  // Grilla que arranca en lunes.
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const selected = sp.dia && sp.dia.startsWith(month) ? sp.dia : null;
  const agendaDays = [...byDay.keys()].sort().filter((d) => (selected ? d === selected : d >= (month === today.slice(0, 7) ? today : from)));
  const going = (id: string) => rsvps.filter((r) => r.event_id === id && r.response === "going").length;

  return (
    <>
      <PageHeader eyebrow="Calendario" title="Qué se viene" />
      <Link href={`/calendario/nuevo${selected ? `?dia=${selected}` : ""}`}
        className="mb-6 flex items-center gap-4 rounded-[var(--radius-card)] bg-rose p-4 text-graphite shadow-lg shadow-rose/30 ring-4 ring-lime/70 transition active:scale-[0.99]">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-graphite text-lime"><CalendarPlus className="size-6" /></span>
        <span><span className="block font-display text-xl font-semibold">Nuevo evento</span><span className="text-sm text-graphite/75">Proponé un plan y que se sumen</span></span>
      </Link>

      <section className="rounded-[var(--radius-card)] bg-white/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <Link href={`/calendario?mes=${shiftMonth(month, -1)}`} aria-label="Mes anterior" className="inline-flex size-10 items-center justify-center rounded-full hover:bg-graphite/5"><ChevronLeft className="size-5" /></Link>
          <h2 className="font-display text-xl font-semibold">{formatMonth(month)}</h2>
          <Link href={`/calendario?mes=${shiftMonth(month, 1)}`} aria-label="Mes siguiente" className="inline-flex size-10 items-center justify-center rounded-full hover:bg-graphite/5"><ChevronRight className="size-5" /></Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-graphite/45">{WEEK.map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const info = byDay.get(d);
            const isToday = d === today;
            const isHoliday = !!info?.holidays.length;
            return (
              <Link key={d} href={selected === d ? `/calendario?mes=${month}` : `/calendario?mes=${month}&dia=${d}`} scroll={false}
                className={cn("flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition",
                  selected === d ? "bg-graphite text-cream" : isToday ? "bg-lime font-bold" : "hover:bg-graphite/5",
                  isHoliday && selected !== d && "text-rose-dark")}>
                <span className={cn(isHoliday && "font-semibold")}>{Number(d.slice(8))}</span>
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {!!info?.events.length && <span className="size-1.5 rounded-full bg-rose" />}
                  {!!info?.birthdays.length && <span className="size-1.5 rounded-full bg-chart-2" />}
                  {isHoliday && <span className="size-1.5 rounded-full bg-graphite/40" />}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-graphite/60">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-rose" /> Eventos</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-chart-2" /> Cumpleaños</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-graphite/40" /> Feriados</span>
        </div>
      </section>

      <h2 className="mt-8 mb-3 font-display text-xl">{selected ? formatDayLong(selected) : "Próximos en " + formatMonth(month).toLowerCase()}</h2>
      {agendaDays.length === 0 ? (
        <p className="rounded-2xl bg-white/50 px-4 py-6 text-center text-sm text-graphite/60">{selected ? "Nada este día." : "Nada por ahora. ¡Proponé un plan!"}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {agendaDays.map((d) => {
            const info = byDay.get(d)!;
            return (
              <section key={d}>
                {!selected && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-graphite/50 first-letter:uppercase">{formatDayLong(d)}</p>}
                <ul className="flex flex-col gap-2">
                  {info.holidays.map((h) => (
                    <li key={h.name} className="flex items-center gap-3 rounded-2xl bg-graphite/5 p-3 text-sm"><span className="text-lg">🇦🇷</span><span><strong>Feriado</strong> · {h.name}</span></li>
                  ))}
                  {info.birthdays.map((b) => (
                    <li key={b.member_id} className="flex items-center gap-3 rounded-2xl bg-blush p-3 text-sm"><span className="text-lg">🎂</span><span>Cumple <strong>{b.name}</strong> · {b.age} años</span></li>
                  ))}
                  {info.events.map((e, i) => {
                    const t = typeById.get(e.type_id);
                    const mine = myRsvp.get(e.id);
                    return (
                      <li key={e.id}>
                        <Link href={`/calendario/${e.id}`} className="flex items-center gap-3 rounded-2xl bg-white/80 p-3 transition hover:bg-white">
                          <CategoryIcon icon={t?.icon ?? null} index={i} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{e.title}</span>
                            <span className="block truncate text-xs text-graphite/55">{arTime(e.starts_at)} h{e.location && ` · ${e.location}`} · {going(e.id)} van</span>
                          </span>
                          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", mine === "going" ? "bg-lime" : mine === "maybe" ? "bg-powder" : mine === "no" ? "bg-graphite/10 text-graphite/60" : "bg-rose text-graphite")}>
                            {mine ? RSVP_LABEL[mine] : "¿Vas?"}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
