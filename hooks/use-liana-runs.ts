"use client";

import * as React from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

export type LianaRunStatus = "pending" | "done" | "error";

export interface LianaRun {
  id: string;
  business_id: string;
  user_id: string;
  run_id: string | null;
  prompt: string;
  reply_text: string | null;
  reply_format: "plain" | "markdown";
  status: LianaRunStatus;
  error_message: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface UseLianaRunsOptions {
  /** UUID user yang sedang login. Filter row + Realtime channel. */
  userId: string;
  /**
   * Berapa run terbaru yang difetch saat mount. Default 20.
   * Per request: ditampilin di chat panel sebagai history.
   */
  initialLimit?: number;
}

interface UseLianaRunsReturn {
  runs: LianaRun[];
  /** Jumlah run dengan status='pending'. Dipakai untuk badge / pulsing dot. */
  pendingCount: number;
  /** True saat initial fetch berjalan. */
  loading: boolean;
  /** Refetch manual. Jarang dipakai karena Realtime handle update. */
  refetch: () => Promise<void>;
}

/**
 * Subscribe ke `liana_runs` user yang sedang login.
 *
 * - Initial fetch: get N runs terbaru via SELECT (RLS filter ke user_id).
 * - Realtime: subscribe ke `postgres_changes` di `liana_runs` filter
 *   `user_id=eq.<userId>`. Handle INSERT (run baru saat user klik tombol),
 *   UPDATE (status berubah jadi done/error saat Liana callback masuk).
 *
 * State management: simple array, deduplicate by `id`. INSERT prepend,
 * UPDATE replace in-place.
 */
export function useLianaRuns({
  userId,
  initialLimit = 20,
}: UseLianaRunsOptions): UseLianaRunsReturn {
  const [runs, setRuns] = React.useState<LianaRun[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Initial fetch — load N run terbaru saat mount / userId berubah.
  // Pakai cancel flag supaya tidak setState setelah unmount (React strict
  // mode safety) dan tidak overwrite update Realtime yang lebih baru.
  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("liana_runs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(initialLimit);

      if (cancelled) return;
      if (error) {
        console.error("[useLianaRuns] initial fetch error:", error.message);
        setLoading(false);
        return;
      }
      setRuns((data ?? []) as LianaRun[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, initialLimit]);

  // Refetch handler untuk dipakai manual oleh caller (jarang, karena
  // Realtime sudah handle update). Pakai useCallback supaya stable.
  const refetch = React.useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("liana_runs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(initialLimit);
    if (error) {
      console.error("[useLianaRuns] refetch error:", error.message);
      return;
    }
    setRuns((data ?? []) as LianaRun[]);
  }, [userId, initialLimit]);

  React.useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channelName = `liana_runs:${userId}`;
    const channel: RealtimeChannel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "liana_runs",
        filter: `user_id=eq.${userId}`,
      },
      (payload: RealtimePostgresChangesPayload<LianaRun>) => {
        const row = payload.new as LianaRun;
        setRuns((prev) => {
          // Skip kalau sudah ada (race kalau initial fetch overlap).
          if (prev.some((r) => r.id === row.id)) return prev;
          return [row, ...prev];
        });
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "liana_runs",
        filter: `user_id=eq.${userId}`,
      },
      (payload: RealtimePostgresChangesPayload<LianaRun>) => {
        const row = payload.new as LianaRun;
        setRuns((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          if (idx === -1) {
            // UPDATE pada row yang belum ada di state (mungkin insert
            // belum sampai). Insert sekarang juga.
            return [row, ...prev];
          }
          const next = prev.slice();
          next[idx] = row;
          return next;
        });
      },
    );

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const pendingCount = React.useMemo(
    () => runs.filter((r) => r.status === "pending").length,
    [runs],
  );

  return {
    runs,
    pendingCount,
    loading,
    refetch,
  };
}
