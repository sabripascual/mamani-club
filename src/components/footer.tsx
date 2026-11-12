import { cn } from "@/lib/utils";

/** Pie de la app: firma de la marca, discreto y angosto. */
export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("mx-auto mt-14 flex max-w-xs flex-col items-center gap-1 text-center", className)}>
      <span aria-hidden className="mb-2 flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-rose" />
        <span className="size-1.5 rounded-full bg-lime" />
        <span className="size-1.5 rounded-full bg-rose" />
      </span>
      <p className="text-xs text-graphite/55">
        © 2026 <span className="font-display font-semibold text-graphite/80">Brave Tech Studio</span>
      </p>
      <p className="text-[11px] text-graphite/40">Hecho con 💖 para MAMANÍ CLUB</p>
    </footer>
  );
}
