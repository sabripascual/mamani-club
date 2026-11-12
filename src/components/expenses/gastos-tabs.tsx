"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function GastosTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/gastos", label: "Juntadas", active: pathname === "/gastos" },
    { href: "/gastos/balances", label: "Balances", active: pathname.startsWith("/gastos/balances") },
  ];
  return (
    <div className="mb-6 inline-flex rounded-full bg-white/70 p-1 ring-1 ring-graphite/10">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={cn("inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition", t.active ? "bg-graphite text-cream" : "text-graphite/60")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
