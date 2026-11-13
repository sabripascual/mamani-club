import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estilo de las acciones principales: fondo amarillo, borde rosa, ícono con solo el contorno. */
export const actionCardClass =
  "group flex items-center gap-4 rounded-[var(--radius-card)] bg-lime p-4 text-graphite shadow-lg shadow-rose/25 ring-4 ring-rose transition hover:brightness-105 active:scale-[0.99]";
export const actionButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-lime font-semibold text-graphite shadow-lg shadow-rose/25 ring-4 ring-rose transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50";

export function ActionIcon({ icon: Icon = Plus, spin = true }: { icon?: LucideIcon; spin?: boolean }) {
  return (
    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full border-[2.5px] border-graphite text-graphite transition", spin && "group-hover:rotate-90")}>
      <Icon className="size-6" strokeWidth={2.5} />
    </span>
  );
}

/** Tarjeta-botón grande ("Agregar gasto", "Nuevo evento", "Nueva juntada"). */
export function ActionCard({ href, title, subtitle, icon, className }: { href: string; title: string; subtitle?: string; icon?: LucideIcon; className?: string }) {
  return (
    <Link href={href} className={cn(actionCardClass, className)}>
      <ActionIcon icon={icon} spin={!icon} />
      <span className="flex-1">
        <span className="block font-display text-xl font-semibold">{title}</span>
        {subtitle && <span className="text-sm text-graphite/75">{subtitle}</span>}
      </span>
    </Link>
  );
}
