import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { requireActiveMember } from "@/lib/auth/session";
import { getJuntadaTypes, getMembers, listJuntadas, type JuntadaFilters } from "@/lib/expenses/queries";
import { createClient } from "@/lib/supabase/server";
import { formatMonth, monthKey, MONTHS } from "@/lib/dates";
import { formatMoney } from "@/lib/money/format";
import { displayName } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GastosTabs } from "@/components/expenses/gastos-tabs";
import { JuntadaCard } from "@/components/expenses/juntada-card";

export const metadata: Metadata = { title: "Juntadas · MAMANÍ CLUB" };

type SP = { anio?: string; mes?: string; tipo?: string; integrante?: string; estado?: string };

export default async function JuntadasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { profile } = await requireActiveMember();
  const filters: JuntadaFilters = {
    year: sp.anio ? Number(sp.anio) : undefined,
    month: sp.anio && sp.mes ? Number(sp.mes) : undefined,
    typeId: sp.tipo || undefined,
    memberId: sp.integrante || undefined,
    status: ["pending", "partial", "settled"].includes(sp.estado ?? "") ? (sp.estado as JuntadaFilters["status"]) : undefined,
  };
  const [juntadas, { tree: types, byId: typeById }, { members }] = await Promise.all([listJuntadas(filters), getJuntadaTypes(true), getMembers()]);

  // Mi saldo neto en cada juntada listada.
  const supabase = await createClient();
  const { data: mine } = juntadas.length
    ? await supabase.from("v_juntada_member_balances").select("juntada_id, net_cents").eq("member_id", profile.id).in("juntada_id", juntadas.map((j) => j.id))
    : { data: [] };
  const myNet = new Map((mine ?? []).map((r) => [r.juntada_id as string, Number(r.net_cents)]));

  const groups = new Map<string, typeof juntadas>();
  for (const j of juntadas) groups.set(monthKey(j.occurred_on), [...(groups.get(monthKey(j.occurred_on)) ?? []), j]);
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const filtered = Object.values(sp).some(Boolean);
  const select = "h-10 rounded-full border border-graphite/10 bg-white/70 px-3 text-sm";

  return (
    <>
      <PageHeader eyebrow="Juntadas" title="Nuestras juntadas" />
      <GastosTabs />
      <form className="mb-6 flex flex-wrap gap-2">
        <select name="anio" defaultValue={sp.anio ?? ""} className={select} aria-label="Año">
          <option value="">Todos los años</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select name="mes" defaultValue={sp.mes ?? ""} className={select} aria-label="Mes">
          <option value="">Todo el año</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select name="tipo" defaultValue={sp.tipo ?? ""} className={select} aria-label="Tipo de juntada">
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select name="integrante" defaultValue={sp.integrante ?? ""} className={select} aria-label="Integrante">
          <option value="">Todas las integrantes</option>
          {members.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
        </select>
        <select name="estado" defaultValue={sp.estado ?? ""} className={select} aria-label="Estado">
          <option value="">Cualquier estado</option>
          <option value="pending">Pendientes</option>
          <option value="partial">Parcialmente saldadas</option>
          <option value="settled">Saldadas</option>
        </select>
        <button className="h-10 rounded-full bg-graphite px-4 text-sm font-semibold text-cream">Filtrar</button>
        {filtered && <Link href="/gastos" className="inline-flex h-10 items-center px-2 text-sm font-semibold text-rose-dark">Limpiar</Link>}
      </form>

      {juntadas.length === 0 ? (
        <EmptyState icon={ReceiptText} title={filtered ? "No hay juntadas con esos filtros" : "Todavía no hay juntadas"}>
          {!filtered && <Link href="/gastos/nuevo" className="mt-3 inline-flex items-center gap-1 font-semibold text-rose-dark"><Plus className="size-4" /> Crear la primera</Link>}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {[...groups].map(([key, list]) => {
            const total = list.reduce((a, j) => a + (j.summary?.total_base_cents ?? 0), 0);
            return (
              <section key={key}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-display text-xl">{formatMonth(key)}</h2>
                  <p className="text-sm text-graphite/55">{list.length} {list.length === 1 ? "juntada" : "juntadas"} · {formatMoney(total, "ARS", { round: true })}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {list.map((j, i) => (
                    <li key={j.id}><JuntadaCard j={j} type={typeById.get(j.type_id)} index={i} myNet={myNet.get(j.id)} /></li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
