"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/expenses/actions";
import { arEndIso, arToIso, type Rsvp } from "./types";
import { notifyNewEvent } from "@/lib/push/calendar-daily";
import { pushConfigured } from "@/lib/push/send";

const schema = z.object({
  title: z.string().trim().min(1, "Ponele un nombre al evento").max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí la fecha"),
  all_day: z.boolean(),
  time: z.string(),
  end_time: z.string().regex(/^(\d{2}:\d{2})?$/, "Hora inválida"),
  type_id: z.string().uuid("Elegí el tipo"),
  location: z.string().trim().max(200).optional().transform((v) => v || null),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
}).superRefine((d, ctx) => {
  if (!d.all_day && !/^\d{2}:\d{2}$/.test(d.time)) ctx.addIssue({ code: "custom", path: ["time"], message: "Elegí la hora (o marcá “Todo el día”)" });
  if (!d.all_day && d.end_time && d.end_time === d.time) ctx.addIssue({ code: "custom", path: ["end_time"], message: "La hora de fin tiene que ser distinta del inicio" });
});

/** Inicio y fin en ISO (todo el día = 00:00 sin fin). */
function times(d: z.infer<typeof schema>) {
  if (d.all_day) return { p_starts_at: arToIso(d.date, "00:00"), p_all_day: true, p_ends_at: null };
  return { p_starts_at: arToIso(d.date, d.time), p_all_day: false, p_ends_at: arEndIso(d.date, d.time, d.end_time) };
}

function read(fd: FormData) {
  return schema.safeParse({
    title: fd.get("title") ?? "", date: fd.get("date") ?? "", all_day: fd.get("all_day") === "on",
    time: String(fd.get("time") ?? ""), end_time: String(fd.get("end_time") ?? ""), type_id: fd.get("type_id") ?? "",
    location: fd.get("location") ?? "", description: fd.get("description") ?? "",
  });
}

function errs(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

export async function createEvent(_: FormState, fd: FormData): Promise<FormState> {
  const p = read(fd);
  if (!p.success) return { fields: errs(p.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_event", {
    p_title: p.data.title, ...times(p.data), p_type_id: p.data.type_id,
    p_location: p.data.location, p_description: p.data.description,
  });
  if (error) return { error: error.message };
  const { data: { user } } = await supabase.auth.getUser();
  if (user && pushConfigured()) after(() => notifyNewEvent(data as string, user.id).then(() => undefined).catch(() => {}));
  revalidatePath("/calendario");
  redirect(`/calendario/${data}`);
}

export async function updateEvent(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const p = read(fd);
  if (!p.success) return { fields: errs(p.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_event", {
    p_event_id: id, p_title: p.data.title, ...times(p.data), p_type_id: p.data.type_id,
    p_location: p.data.location, p_description: p.data.description,
  });
  if (error) return { error: error.message };
  revalidatePath("/calendario", "layout");
  redirect(`/calendario/${id}`);
}

export type Result = { ok: boolean; error?: string; id?: string };

export async function rsvpEvent(id: string, response: Rsvp): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rsvp_event", { p_event_id: id, p_response: response });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendario", "layout");
  return { ok: true };
}

export async function cancelEvent(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_event", { p_event_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendario", "layout");
  return { ok: true };
}

export async function convertEvent(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_event_to_juntada", { p_event_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, id: data as string };
}
