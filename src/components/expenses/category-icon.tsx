import {
  Utensils, Wine, PartyPopper, Trophy, Car, Cake, Plane, ShoppingBag, Sparkles, Home, Beer, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, wine: Wine, "party-popper": PartyPopper, trophy: Trophy,
  car: Car, cake: Cake, plane: Plane, "shopping-bag": ShoppingBag, home: Home, beer: Beer, sparkles: Sparkles,
};

export const CATEGORY_ICON_OPTIONS = Object.keys(ICONS);

// Alterna blush/powder para que la lista tenga ritmo visual sin ser un arcoíris.
const TONES = ["bg-blush", "bg-powder/70"];

export function CategoryIcon({ icon, index = 0, size = "md" }: { icon: string | null; index?: number; size?: "sm" | "md" }) {
  const Icon = (icon && ICONS[icon]) || Sparkles;
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center justify-center rounded-2xl text-graphite",
      TONES[index % TONES.length],
      size === "md" ? "size-12" : "size-9 rounded-xl",
    )}>
      <Icon className={size === "md" ? "size-5" : "size-4"} strokeWidth={1.7} />
    </span>
  );
}
