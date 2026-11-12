import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Auditoría · MAMANÍ CLUB" };

const ACTION_LABELS: Record<string, string> = {
  insert: "Alta",
  update: "Modificación",
  delete: "Eliminación",
  member_approved: "Aprobó el acceso",
  member_rejected: "Rechazó el acceso",
  member_deactivated: "Desactivó",
  member_reactivated: "Reactivó",
  member_status_changed: "Cambió el estado",
  role_changed: "Cambió el rol",
  temporary_password_set: "Generó contraseña temporal",
};

const ENTITY_LABELS: Record<string, string> = { profiles: "Integrante", group_settings: "Configuración" };

const fmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  dateStyle: "medium",
  timeStyle: "short",
});

type Row = {
  id: number;
  occurred_at: string;
  entity: string;
  entity_id: string;
  action: string;
  reason: string | null;
  actor_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ accion?: string }> }) {
  const { accion } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, occurred_at, entity, entity_id, action, reason, actor_id, old_values, new_values")
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (accion) query = query.eq("action", accion);
  const { data } = await query.returns<Row[]>();
  const rows = data ?? [];

  // Nombres de las personas involucradas (actoras y afectadas).
  const ids = [...new Set(rows.flatMap((r) => [r.actor_id, r.entity === "profiles" ? r.entity_id : null]).filter(Boolean))] as string[];
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", ids)
    : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

  return (
    <>
      <h1 className="mb-1 font-display text-[1.8rem] font-semibold">Auditoría</h1>
      <p className="mb-5 text-sm text-graphite/60">Registro inmutable de los cambios importantes. Últimos 100.</p>

      <form className="mb-5">
        <select
          name="accion"
          defaultValue={accion ?? ""}
          className="h-11 rounded-full border border-graphite/10 bg-white/70 px-4 text-sm"
          aria-label="Filtrar por acción"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="ml-2 h-11 rounded-full bg-graphite px-4 text-sm font-semibold text-cream">Filtrar</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="Sin registros" />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm">
                    <strong>{r.actor_id ? (name.get(r.actor_id) ?? "Alguien") : "Sistema"}</strong>{" "}
                    {(ACTION_LABELS[r.action] ?? r.action).toLowerCase()}
                    {" · "}
                    <span className="text-graphite/60">
                      {ENTITY_LABELS[r.entity] ?? r.entity}
                      {r.entity === "profiles" && name.get(r.entity_id) ? `: ${name.get(r.entity_id)}` : ""}
                    </span>
                  </p>
                  <time className="text-xs text-graphite/50">{fmt.format(new Date(r.occurred_at))}</time>
                </div>
                {r.reason && <p className="mt-1 text-sm text-graphite/70">Motivo: {r.reason}</p>}
                {r.old_values && r.new_values && <Diff before={r.old_values} after={r.new_values} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Diff({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const keys = Object.keys(after).filter((k) => k !== "updated_at" && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (keys.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {keys.map((k) => (
        <div key={k} className="contents">
          <dt className="font-mono text-graphite/50">{k}</dt>
          <dd className="truncate">
            <span className="text-graphite/50 line-through">{String(before[k] ?? "—")}</span> → {String(after[k] ?? "—")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
