import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getMembers } from "@/lib/expenses/queries";
import { displayName } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { BroadcastForm, MessagePool } from "./panel-client";

export const metadata: Metadata = { title: "Notificaciones · MAMANÍ CLUB" };

const KIND_LABEL: Record<string, string> = {
  debtor: "Deuda", creditor: "Cobro", test: "Prueba", event: "Evento", birthday: "Cumpleaños",
  birthday_week: "Cumple en 7 días", weekly: "Frase semanal", broadcast: "Envío manual",
};
const fmt = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "medium", timeStyle: "short" });

export default async function NotificationsPanel() {
  const supabase = await createClient();
  const [{ data: messages }, { data: log }, { members, byId }, { count: devices }] = await Promise.all([
    supabase.from("notification_messages").select("id, kind, title, body, active").order("created_at"),
    supabase.from("notification_log").select("id, kind, member_id, title, body, devices, created_at").order("created_at", { ascending: false }).limit(60),
    getMembers(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
  ]);
  const by = (k: string) => (messages ?? []).filter((m) => m.kind === k);

  return (
    <>
      <h1 className="mb-1 font-display text-[1.8rem] font-semibold">Notificaciones</h1>
      <p className="mb-6 text-sm text-graphite/60">
        Mensajes que manda la app solos y envíos manuales. Solo llegan a quienes activaron las notificaciones en su perfil
        (hoy hay {devices ?? 0} {devices === 1 ? "dispositivo" : "dispositivos"}).
      </p>

      <h2 className="mb-2 font-display text-xl">Enviar ahora</h2>
      <Card className="mb-8"><BroadcastForm members={members.filter((m) => m.status === "active").map((m) => ({ id: m.id, name: displayName(m) }))} /></Card>

      <h2 className="mb-2 font-display text-xl">Frases de los lunes (8:00)</h2>
      <Card className="mb-8">
        <MessagePool kind="weekly" messages={by("weekly")} hint="Cada lunes se manda una al azar entre las activas. Pausá las que no quieras repetir."
          placeholderTitle="Ej: ¡Arrancó la semana, perritas!" placeholderBody="Ej: ¿Qué hacemos el finde?" />
      </Card>

      <h2 className="mb-2 font-display text-xl">Saludo del día del cumple (8:00)</h2>
      <Card className="mb-8">
        <MessagePool kind="birthday" messages={by("birthday")} hint="Se elige uno al azar. Usá {nombre} para el nombre de la cumpleañera. A ella le llega un saludo propio."
          placeholderTitle="Ej: ¡Feliz cumple!" placeholderBody="Ej: {nombre} cumple años hoy, saluden a la perrita!" />
      </Card>

      <h2 className="mb-2 font-display text-xl">Aviso una semana antes del cumple</h2>
      <Card className="mb-8">
        <MessagePool kind="birthday_week" messages={by("birthday_week")} hint="Le llega a todas menos a la cumpleañera. Usá {nombre}."
          placeholderTitle="Ej: ¡La semana que viene cumple años {nombre}!" placeholderBody="Ej: Vayan pensando el regalo 🎁" />
      </Card>

      <h2 className="mb-2 font-display text-xl">Historial</h2>
      <p className="mb-3 text-xs text-graphite/55">Las deudas se avisan a las 10:00; cumpleaños, frases y eventos del día a las 8:00.</p>
      {(log ?? []).length === 0 ? (
        <p className="rounded-2xl bg-white/50 p-4 text-sm text-graphite/60">Todavía no se envió nada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(log ?? []).map((l) => (
            <li key={l.id} className="rounded-2xl bg-white/60 p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p><span className="mr-2 rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold">{KIND_LABEL[l.kind as string] ?? l.kind}</span>
                  <strong>{byId.get(l.member_id) ? displayName(byId.get(l.member_id)!) : "—"}</strong></p>
                <time className="text-xs text-graphite/50">{fmt.format(new Date(l.created_at))}</time>
              </div>
              <p className="mt-1 font-semibold">{l.title}</p>
              <p className="text-graphite/70">{l.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
