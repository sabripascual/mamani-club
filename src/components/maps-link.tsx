import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ubicación con link a Google Maps (búsqueda, sin API paga). */
export function mapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export function MapsLink({ location, className }: { location: string; className?: string }) {
  return (
    <a href={mapsUrl(location)} target="_blank" rel="noopener noreferrer"
      className={cn("mt-1 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-rose-dark underline-offset-4 hover:underline", className)}>
      <MapPin className="size-4 shrink-0" /> <span className="truncate">{location}</span>
    </a>
  );
}
