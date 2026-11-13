import { NextResponse } from "next/server";
import { runMorning } from "@/lib/push/calendar-daily";
import { pushConfigured } from "@/lib/push/send";
import { cronAuthorized, logCronRun } from "@/lib/push/cron-log";

export const maxDuration = 60;

/** Cron 11:00 UTC = 8:00 Argentina: cumpleaños, frase de los lunes y eventos del día. */
export async function GET(request: Request) {
  if (!(await cronAuthorized(request, "manana"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    await logCronRun("manana", { ok: false, detail: "Faltan las claves VAPID en Vercel." });
    return NextResponse.json({ ok: true, push: "sin claves VAPID" });
  }
  try {
    const r = await runMorning();
    await logCronRun("manana", { ok: true, planned: r.planned, sent: r.sent });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await logCronRun("manana", { ok: false, detail: `Error al mandar: ${e instanceof Error ? e.message : "desconocido"}` });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
