"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

/** Campo de contraseña con botón para mostrar/ocultar lo que se escribe. */
export function PasswordField({
  label, hint, error, className, id, ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; hint?: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? props.name;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-graphite/80">{label}</label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            "h-12 w-full rounded-2xl border border-graphite/10 bg-white/70 pr-12 pl-4 text-base text-graphite",
            "placeholder:text-graphite/35 transition outline-none focus:border-rose focus:bg-white focus:ring-4 focus:ring-rose/15",
            error && "border-rose-dark",
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-1 my-auto inline-flex size-10 items-center justify-center rounded-full text-graphite/50 hover:text-graphite"
        >
          {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      {error ? <p className="text-sm text-rose-dark">{error}</p> : hint ? <p className="text-xs text-graphite/55">{hint}</p> : null}
    </div>
  );
}
