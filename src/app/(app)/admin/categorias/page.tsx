import type { Metadata } from "next";
import { getCategories } from "@/lib/expenses/queries";
import { Card } from "@/components/ui/card";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { AddCategory, CategoryItemActions } from "./category-client";

export const metadata: Metadata = { title: "Categorías · MAMANÍ CLUB" };

export default async function CategoriesAdminPage() {
  const { tree } = await getCategories(true);
  return (
    <>
      <h1 className="mb-1 font-display text-[1.8rem] font-semibold">Categorías</h1>
      <p className="mb-5 text-sm text-graphite/60">
        Archivar una categoría la oculta para juntadas nuevas; las juntadas que ya la usan no cambian.
      </p>
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
                    <span className="flex-1">{s.name}{s.code === "tercer_tiempo" && <span className="ml-2 text-xs text-graphite/50">· usada en rankings</span>}</span>
                    <CategoryItemActions id={s.id} name={s.name} archived={s.archived} />
                  </li>
                ))}
                <li className="px-4 py-2"><AddCategory parentId={c.id} label="Agregar subcategoría" /></li>
              </ul>
            </Card>
          </li>
        ))}
      </ul>
      <div className="mt-4"><AddCategory parentId={null} label="Agregar categoría" /></div>
    </>
  );
}
