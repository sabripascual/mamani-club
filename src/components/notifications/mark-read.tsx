"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/lib/notifications/actions";

/** Al ver la bandeja, marca todo como leído (la campanita del inicio vuelve a cero). */
export function MarkRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) void markNotificationsRead();
  }, [unread]);
  return null;
}
