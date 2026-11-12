import { cn } from "@/lib/utils";

/** Bloque gris animado que ocupa el lugar del contenido mientras carga. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-2xl bg-graphite/[0.07]", className)} />;
}

export function PageSkeleton({ variant = "list" }: { variant?: "list" | "home" | "detail" | "grid" }) {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
      <span className="sr-only">Cargando…</span>
      {variant === "home" ? (
        <>
          <Skeleton className="h-16 w-56" />
          <Skeleton className="h-8 w-40" />
          <div className="grid grid-cols-2 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-48" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
        </>
      ) : (
        <>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-64" />
          {variant === "detail" && <Skeleton className="h-40" />}
          {variant === "grid" ? (
            <div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div>
          ) : (
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[4.5rem]" />)
          )}
        </>
      )}
    </div>
  );
}
