import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type CronJob = "diario" | "manana" | "manual";

/** Registra una corrida de los avisos automáticos (se ve en el panel de notificaciones). */
export async function logCronRun(job: CronJob, r: { ok: boolean; planned?: number; sent?: number; detail?: string }) {
  try {
    await createAdminClient().from("cron_runs").insert({
      job, ok: r.ok, planned: r.planned ?? 0, sent: r.sent ?? 0, detail: r.detail?.slice(0, 300) ?? null,
    });
  } catch {
    // Si falla el registro no frenamos el envío.
  }
}

/**
 * ¿La llamada es del cron de Vercel con la clave correcta? Si es Vercel pero la clave no
 * coincide (o falta CRON_SECRET), lo deja registrado para verlo en el panel.
 */
export async function cronAuthorized(request: Request, job: CronJob) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if ((request.headers.get("user-agent") ?? "").includes("vercel-cron")) {
    await logCronRun(job, { ok: false, detail: secret ? "La clave del cron no coincide (CRON_SECRET)." : "Falta la variable CRON_SECRET en Vercel." });
  }
  return false;
}
