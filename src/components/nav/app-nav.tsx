"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand";
import { ADMIN_ITEM, NAV_ITEMS, isActive } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-graphite/5 bg-cream/90 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-end justify-between px-3 pt-2 pb-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, primary }) => {
          const active = isActive(pathname, href);
          if (primary) {
            return (
              <li key={href} className="-mt-6">
                <Link
                  href={href}
                  aria-label={label}
                  className="flex size-14 items-center justify-center rounded-full bg-graphite text-cream shadow-lg shadow-graphite/25 transition active:scale-95"
                >
                  <Icon className="size-6" strokeWidth={2} />
                </Link>
              </li>
            );
          }
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition",
                  active ? "text-graphite" : "text-graphite/45",
                )}
              >
                <span className={cn("rounded-full px-4 py-1 transition", active && "bg-blush")}>
                  <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.6} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-graphite/5 px-5 py-8 lg:flex">
      <Link href="/" className="px-3">
        <Wordmark className="text-xl" />
      </Link>
      <p className="mt-1 px-3 text-xs text-graphite/50">La cuenta de nuestras juntadas.</p>
      <nav aria-label="Navegación principal" className="mt-10">
        <ul className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon, primary }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-full px-4 py-3 text-[15px] font-semibold transition",
                    primary
                      ? "my-2 bg-graphite text-cream hover:bg-graphite/90"
                      : active
                        ? "bg-blush text-graphite"
                        : "text-graphite/60 hover:bg-graphite/5 hover:text-graphite",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active || primary ? 2 : 1.6} />
                  {primary ? "Nueva juntada" : label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
