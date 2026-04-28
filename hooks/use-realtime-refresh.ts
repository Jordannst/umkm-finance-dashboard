"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { formatRupiah } from "@/lib/finance/format";
import { createClient } from "@/lib/supabase/client";

export type RealtimeTable = "transactions" | "receivables";

interface UseRealtimeRefreshOptions {
  /** UUID business yang user terhubung. Filter event di Supabase. */
  businessId: string;
  /** Tabel yang mau di-watch. */
  tables: RealtimeTable[];
  /** Tampilkan toast saat INSERT dari Liana (source='chat'). Default true. */
  showLianaToast?: boolean;
  /** Debounce window untuk router.refresh(). Default 500ms. */
  debounceMs?: number;
}

interface TransactionPayload {
  type?: "income" | "expense" | "receivable_payment";
  amount?: number;
  category_name?: string | null;
  note?: string | null;
  source?: string;
  business_id?: string;
}

interface ReceivablePayload {
  customer_name?: string;
  amount?: number;
  source?: string;
  business_id?: string;
}

/**
 * Subscribe ke Supabase Realtime untuk tabel keuangan UMKM.
 * Saat ada INSERT/UPDATE/DELETE pada baris yang `business_id` cocok,
 * trigger `router.refresh()` (debounced) supaya RSC re-fetch query
 * server-side dengan filter yang sudah ada.
 *
 * Bonus: kalau INSERT bersumber dari Liana (`source='chat'`), tampilkan
 * toast notif supaya owner aware tanpa harus stare ke screen.
 */
export function useRealtimeRefresh({
  businessId,
  tables,
  showLianaToast = true,
  debounceMs = 500,
}: UseRealtimeRefreshOptions): void {
  const router = useRouter();
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const tablesKey = tables.join("-");

  const debouncedRefresh = React.useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      router.refresh();
    }, debounceMs);
  }, [router, debounceMs]);

  React.useEffect(() => {
    if (!businessId || tables.length === 0) return;

    const supabase = createClient();
    const channelName = `realtime:${businessId}:${tablesKey}`;
    const channel: RealtimeChannel = supabase.channel(channelName);

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          // Selalu trigger refresh
          debouncedRefresh();

          // Toast hanya untuk INSERT dari Liana
          if (
            !showLianaToast ||
            payload.eventType !== "INSERT" ||
            payload.new?.source !== "chat"
          ) {
            return;
          }

          if (payload.table === "transactions") {
            const tx = payload.new as TransactionPayload;
            const verb =
              tx.type === "income"
                ? "pemasukan"
                : tx.type === "expense"
                  ? "pengeluaran"
                  : "pembayaran piutang";
            toast.success(
              `Liana mencatat ${verb}: ${formatRupiah(tx.amount ?? 0)}`,
              {
                description: tx.note ?? tx.category_name ?? undefined,
              },
            );
          } else if (payload.table === "receivables") {
            const rc = payload.new as ReceivablePayload;
            toast.info(`Liana mencatat piutang: ${rc.customer_name ?? "-"}`, {
              description: formatRupiah(rc.amount ?? 0),
            });
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
    // tablesKey already encodes tables array; debouncedRefresh stable via useCallback
  }, [
    businessId,
    tablesKey,
    showLianaToast,
    debouncedRefresh,
    debounceMs,
    tables,
  ]);
}
