import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDailyNotifications } from "@/lib/push/daily";
import { pushConfigured } from "@/lib/push/send";

export const maxDuration = 60;

/**
 * Cron diario (Vercel, 13:00 UTC = 10:00 Argentina):
 *  1. mantiene activo el proyecto de Supabase (plan gratuito);
 *  2. manda las notificaciones push de deudas.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { error } = await createAdminClient().from("group_settings").select("id").limit(1);
  if (error) return NextResponse.json({ ok: false, step: "keepalive" }, { status: 500 });
  if (!pushConfigured()) return NextResponse.json({ ok: true, push: "sin claves VAPID" });
  try {
    const result = await runDailyNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, step: "push" }, { status: 500 });
  }
}
