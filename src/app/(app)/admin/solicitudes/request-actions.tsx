"use client";

import { useTransition, useState } from "react";
import { Check, X } from "lucide-react";
import { setMemberStatus } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";

export function RequestActions({ memberId, approveOnly }: { memberId: string; approveOnly?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (status: "active" | "rejected") =>
    start(async () => {
      setError(null);
      const res = await setMemberStatus(memberId, status);
      if (!res.ok) setError(res.error ?? "Error");
    });

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex gap-2">
        {!approveOnly && (
          <Button variant="danger" className="h-10 flex-1 px-4" disabled={pending} onClick={() => run("rejected")}>
            <X className="size-4" /> Rechazar
          </Button>
        )}
        <Button className="h-10 flex-1 px-4" disabled={pending} onClick={() => run("active")}>
          <Check className="size-4" /> Aprobar
        </Button>
      </div>
      {error && <p className="text-sm text-rose-dark">{error}</p>}
    </div>
  );
}
