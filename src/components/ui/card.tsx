import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] bg-white/70 p-5 shadow-[0_1px_0_rgba(56,51,59,0.04),0_8px_24px_-12px_rgba(56,51,59,0.12)]",
        className,
      )}
      {...props}
    />
  );
}
