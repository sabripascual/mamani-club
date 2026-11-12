import Image from "next/image";
import { cn } from "@/lib/utils";
import wordmark from "../../public/brand/wordmark.png";

/** Logo "MAMANÍ club" (imagen de la marca). El ancho se controla con className (w-…). */
export function Wordmark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={wordmark}
      alt="MAMANÍ club"
      priority={priority}
      sizes="(min-width: 1024px) 240px, 80vw"
      className={cn("h-auto w-40 select-none", className)}
    />
  );
}
