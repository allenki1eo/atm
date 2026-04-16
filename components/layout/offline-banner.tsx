"use client";

import { useOffline } from "@/hooks/use-offline";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const { isOffline } = useOffline();

  if (!isOffline) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-white text-sm font-medium">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>You&apos;re offline. Attendance changes will sync when connection is restored.</span>
    </div>
  );
}
