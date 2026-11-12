"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/expenses/actions";
import { arToIso, type Rsvp } from "./types";
import { notifyNewEvent } from "@/lib/push/calendar-daily";
import { pushConfigured } from "@/lib/push/send";

const schema = z.object({
  title: z.string().trim().min(1, "Ponele un nombre al evento").max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí la fecha"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Elegí la hora"),
  type_id: z.string().uuid("Elegí el tipo"),
  location: z.string().trim().max(200).optional().transform((v) => v || null),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
});

function read(fd: FormData) {
  return schema.safeParse({
    title: fd.get("title") ?? "", date: fd.get("date") ?? "", time: fd.get("time") ?? "", type_id: fd.get("type_id") ?? "",
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
    p_title: p.data.title, p_starts_at: arToIso(p.data.date, p.data.time), p_type_id: p.data.type_id,
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
    p_event_id: id, p_title: p.data.title, p_starts_at: arToIso(p.data.date, p.data.time), p_type_id: p.data.type_id,
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
