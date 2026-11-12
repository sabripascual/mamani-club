import type { Metadata } from "next";
import Link from "next/link";
import { getCategories, getJuntadaTypes } from "@/lib/expenses/queries";
import { Card } from "@/components/ui/card";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { cn } from "@/lib/utils";
import { AddCategory, CategoryItemActions } from "./category-client";

export const metadata: Metadata = { title: "Categorías · MAMANÍ CLUB" };

const RANKING_CODES: Record<string, string> = { j_salida: "“la más fiestera”", j_tercer_tiempo: "“la reina del tercer tiempo”" };

export default async function CategoriesAdminPage({ searchParams }: { searchParams: Promise<{ lista?: string }> }) {
  const { lista } = await searchParams;
  const kind = lista === "gastos" ? "gasto" : "juntada";
  const [{ tree: types }, { tree: gastoCats }] = await Promise.all([getJuntadaTypes(true), getCategories(true)]);
  const tree = kind === "juntada" ? types : gastoCats;

  return (
    <>
      <h1 className="mb-1 font-display text-[1.8rem] font-semibold">Categorías</h1>
      <p className="mb-4 text-sm text-graphite/60">
        Borrar solo se puede si nunca se usó. Si ya tiene juntadas o gastos, archivala: se oculta para cargas nuevas y el historial no cambia.
      </p>
      <div className="mb-5 inline-flex rounded-full bg-white/70 p-1 ring-1 ring-graphite/10">
        {[["juntadas", "Tipos de juntada", kind === "juntada"], ["gastos", "Categorías de gasto", kind === "gasto"]].map(([v, label, on]) => (
          <Link key={v as string} href={`/admin/categorias?lista=${v}`}
            className={cn("inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition", on ? "bg-graphite text-cream" : "text-graphite/60")}>
            {label as string}
          </Link>
        ))}
      </div>

      {kind === "juntada" ? (
        <ul className="flex flex-col gap-2">
          {tree.map((t, i) => (
            <li key={t.id}>
              <Card className={cn("flex items-center gap-3 p-3", t.archived && "opacity-60")}>
                <CategoryIcon icon={t.icon} index={i} size="sm" />
                <p className="flex-1 font-semibold">
                  {t.name}
                  {t.archived && <span className="ml-2 text-xs font-normal">(archivado)</span>}
                  {t.code && RANKING_CODES[t.code] && <span className="ml-2 text-xs font-normal text-graphite/50">· usado en {RANKING_CODES[t.code]}</span>}
                </p>
                <CategoryItemActions id={t.id} name={t.name} archived={t.archived} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-3">
          {tree.map((c, i) => (
            <li key={c.id}>
              <Card className={c.archived ? "opacity-60" : undefined}>
                <div className="flex items-center gap-3">
                  <CategoryIcon icon={c.icon} index={i} size="sm" />
                  <p className="flex-1 font-semibold">{c.name}{c.archived && <span className="ml-2 text-xs font-normal">(archivada)</span>}</p>
                  <CategoryItemActions id={c.id} name={c.name} archived={c.archived} />
                </div>
                <ul className="mt-3 flex flex-col divide-y divide-graphite/5 rounded-2xl bg-cream/70">
                  {c.children.map((s) => (
                    <li key={s.id} className={`flex items-center gap-2 px-4 py-2 text-sm ${s.archived ? "opacity-55" : ""}`}>
                      <span className="flex-1">{s.name}</span>
                      <CategoryItemActions id={s.id} name={s.name} archived={s.archived} />
                    </li>
                  ))}
                  <li className="px-4 py-2"><AddCategory parentId={c.id} label="Agregar subcategoría" kind="gasto" /></li>
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4"><AddCategory parentId={null} label={kind === "juntada" ? "Agregar tipo de juntada" : "Agregar categoría de gasto"} kind={kind} /></div>
    </>
  );
}
