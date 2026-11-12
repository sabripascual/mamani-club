import { NextResponse } from "next/server";
import { runMorning } from "@/lib/push/calendar-daily";
import { pushConfigured } from "@/lib/push/send";

export const maxDuration = 60;

/** Cron 11:00 UTC = 8:00 Argentina: cumpleaños, frase de los lunes y eventos del día. */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) return NextResponse.json({ ok: true, push: "sin claves VAPID" });
  try {
    return NextResponse.json({ ok: true, ...(await runMorning()) });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
