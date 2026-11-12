import { cn } from "@/lib/utils";

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-2xl px-4 py-3 text-sm",
        tone === "error" && "bg-rose/15 text-rose-dark",
        tone === "info" && "bg-powder/50 text-graphite",
        tone === "success" && "bg-blush text-graphite",
      )}
    >
      {children}
    </div>
  );
}
