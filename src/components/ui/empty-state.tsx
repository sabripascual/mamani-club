import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-rose/40 px-6 py-12 text-center">
      <span className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-blush">
        <Icon className="size-6 text-rose-dark" strokeWidth={1.6} />
      </span>
      <p className="font-display text-xl">{title}</p>
      {children && <div className="mt-2 max-w-xs text-sm text-graphite/65">{children}</div>}
    </div>
  );
}
