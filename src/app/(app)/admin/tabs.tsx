"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/integrantes", label: "Integrantes" },
  { href: "/admin/auditoria", label: "Auditoría" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-5 mt-3 mb-6 overflow-x-auto px-5 lg:mx-0 lg:px-0">
      <ul className="flex gap-2">
        {TABS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className={cn(
                "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition",
                pathname.startsWith(t.href) ? "bg-graphite text-cream" : "bg-white/70 text-graphite/70 hover:text-graphite",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
