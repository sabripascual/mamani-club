import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Lo llama el cron diario de Vercel para que Supabase Free no pause el proyecto por inactividad.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { error } = await createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
