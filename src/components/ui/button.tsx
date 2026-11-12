import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-graphite text-cream hover:bg-graphite/90",
  secondary: "bg-blush text-graphite hover:bg-blush/80",
  ghost: "bg-transparent text-graphite hover:bg-graphite/5",
  danger: "bg-transparent text-rose-dark ring-1 ring-rose/50 hover:bg-rose/10",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold",
        "transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
