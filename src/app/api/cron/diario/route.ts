import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDailyNotifications } from "@/lib/push/daily";
import { pushConfigured } from "@/lib/push/send";
import { runEventEve } from "@/lib/push/calendar-daily";
import { ensureHolidays } from "@/lib/calendar/holidays";
import { cronAuthorized, logCronRun } from "@/lib/push/cron-log";
import { runCuotitaReminders } from "@/lib/push/cuotitas-alerts";

export const maxDuration = 60;

/**
 * Cron diario (Vercel, 13:00 UTC = 10:00 Argentina):
 *  1. mantiene activo el proyecto de Supabase (plan gratuito);
 *  2. carga los feriados del año si faltan;
 *  3. manda las notificaciones de deudas, las cuotitas (1 al 5 de cada mes) y los
 *     recordatorios de eventos de mañana.
 */
export async function GET(request: Request) {
  if (!(await cronAuthorized(request, "diario"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { error } = await createAdminClient().from("group_settings").select("id").limit(1);
  if (error) {
    await logCronRun("diario", { ok: false, detail: "No se pudo conectar con la base." });
    return NextResponse.json({ ok: false, step: "keepalive" }, { status: 500 });
  }
  // Feriados del año (y del siguiente, desde diciembre).
  const now = new Date();
  await ensureHolidays(now.getUTCFullYear());
  if (now.getUTCMonth() === 11) await ensureHolidays(now.getUTCFullYear() + 1);
  if (!pushConfigured()) {
    await logCronRun("diario", { ok: false, detail: "Faltan las claves VAPID en Vercel." });
    return NextResponse.json({ ok: true, push: "sin claves VAPID" });
  }
  try {
    const result = await runDailyNotifications();
    const eve = await runEventEve();
    const cuotitas = await runCuotitaReminders();
    await logCronRun("diario", {
      ok: true, planned: result.planned + eve.planned + cuotitas.planned, sent: result.sent + eve.sent + cuotitas.sent,
    });
    return NextResponse.json({ ok: true, ...result, eventos: eve, cuotitas });
  } catch (e) {
    await logCronRun("diario", { ok: false, detail: `Error al mandar: ${e instanceof Error ? e.message : "desconocido"}` });
    return NextResponse.json({ ok: false, step: "push" }, { status: 500 });
  }
}
