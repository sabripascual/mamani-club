import Link from "next/link";
import { cn } from "@/lib/utils";

/** Selector Grupo / Yo. Conserva los filtros de período al cambiar. */
export function ViewToggle({ sp, current }: { sp: Record<string, string | undefined>; current: "grupo" | "yo" }) {
  const href = (v: "grupo" | "yo") => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, val]) => !!val && k !== "vista" && !(v === "yo" && k === "integrante")) as [string, string][]);
    if (v === "yo") q.set("vista", "yo");
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };
  return (
    <div className="mb-4 inline-flex rounded-full bg-white/70 p-1 ring-1 ring-graphite/10" role="tablist" aria-label="Ver estadísticas de">
      {(["grupo", "yo"] as const).map((v) => (
        <Link
          key={v}
          href={href(v)}
          role="tab"
          aria-selected={current === v}
          scroll={false}
          className={cn("inline-flex h-9 items-center rounded-full px-5 text-sm font-semibold transition", current === v ? "bg-graphite text-cream" : "text-graphite/60")}
        >
          {v === "grupo" ? "Grupo" : "Yo"}
        </Link>
      ))}
    </div>
  );
}
