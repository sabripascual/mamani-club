import { Home, ReceiptText, Plus, Trophy, UserRound, ShieldCheck, Images, CalendarDays, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; primary?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/gastos", label: "Juntadas", icon: ReceiptText },
  { href: "/gastos/nuevo", label: "Agregar", icon: Plus, primary: true },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/perfil", label: "Mi perfil", icon: UserRound },
];

export const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

/** Solo en la barra lateral de desktop (en mobile se llega desde Inicio). */
export const MEMORIES_ITEM: NavItem = { href: "/recuerdos", label: "Manija Memories", icon: Images };
export const RANKINGS_ITEM: NavItem = { href: "/rankings", label: "Rankings", icon: Trophy };

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/gastos") return pathname === "/gastos" || (pathname.startsWith("/gastos/") && pathname !== "/gastos/nuevo");
  return pathname === href || pathname.startsWith(href + "/");
}
