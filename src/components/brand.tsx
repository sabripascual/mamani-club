import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-tight", className)}>
      MAMANÍ <span className="text-rose">CLUB</span>
    </span>
  );
}
