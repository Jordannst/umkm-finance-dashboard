"use client";

import {
  useRealtimeRefresh,
  type RealtimeTable,
} from "@/hooks/use-realtime-refresh";

interface RealtimeWatcherProps {
  businessId: string;
  tables: RealtimeTable[];
  /** Default true — tampilkan toast saat ada data baru dari Liana. */
  showLianaToast?: boolean;
}

/**
 * Thin wrapper untuk `useRealtimeRefresh`. Render `null`.
 * Inserted di server component pages tanpa block render.
 *
 * Contoh:
 *   <RealtimeWatcher businessId={businessId} tables={["transactions"]} />
 */
export function RealtimeWatcher({
  businessId,
  tables,
  showLianaToast = true,
}: RealtimeWatcherProps) {
  useRealtimeRefresh({ businessId, tables, showLianaToast });
  return null;
}
