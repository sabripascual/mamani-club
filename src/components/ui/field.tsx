import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const inputId = id ?? props.name;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-graphite/80">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-12 rounded-2xl border border-graphite/10 bg-white/70 px-4 text-base text-graphite",
          "placeholder:text-graphite/35 transition outline-none",
          "focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15",
          error && "border-rose-dark",
        )}
        {...props}
      />
      {error ? (
        <p className="text-sm text-rose-dark">{error}</p>
      ) : hint ? (
        <p className="text-xs text-graphite/55">{hint}</p>
      ) : null}
    </div>
  );
}
