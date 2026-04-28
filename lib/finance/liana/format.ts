import type { LucideIcon } from "lucide-react";
import { Brain, Database, ListOrdered, Sparkles } from "lucide-react";

/**
 * Helpers presentational untuk Liana run lifecycle. Pure functions,
 * gak depend ke client/server boundary — bisa dipanggil dari mana aja.
 */

/** Subset minimal LianaRun yang dibutuhkan untuk hitung latency.
 *  Pakai structural type biar gak coupling ke salah satu definisi
 *  LianaRun (ada 2: server-only di lib/finance/liana/runs.ts dan
 *  client di hooks/use-liana-runs.ts). */
export interface RunForLatency {
  status: "pending" | "done" | "error";
  created_at: string;
  forwarded_at: string | null;
  delivered_at: string | null;
}

/**
 * Render breakdown latency dari liana_run timestamps. Hanya return
 * string kalau run sukses + ke-3 timestamp ada (created/forwarded/delivered).
 *
 * Format: "total 8.3s (LLM 7.1s, network 1.2s)"
 *
 * Return null untuk:
 *   - status != 'done' (gak ada delivered_at yang valid)
 *   - forwarded_at null (run lama sebelum migration 0009)
 *   - parse error (timestamp invalid)
 */
export function formatLatencyBreakdown(run: RunForLatency): string | null {
  if (run.status !== "done") return null;
  if (!run.forwarded_at || !run.delivered_at) return null;

  const created = Date.parse(run.created_at);
  const forwarded = Date.parse(run.forwarded_at);
  const delivered = Date.parse(run.delivered_at);

  if (
    Number.isNaN(created) ||
    Number.isNaN(forwarded) ||
    Number.isNaN(delivered)
  ) {
    return null;
  }

  const totalSec = (delivered - created) / 1000;
  const llmSec = (delivered - forwarded) / 1000;
  const networkSec = (forwarded - created) / 1000;

  // Clamp negative values (clock skew between Vercel + OpenClaw).
  // Better tampil 0.0s daripada "-0.3s" yang bingungin user.
  const total = Math.max(0, totalSec);
  const llm = Math.max(0, llmSec);
  const network = Math.max(0, networkSec);

  return `total ${total.toFixed(1)}s (LLM ${llm.toFixed(1)}s, network ${network.toFixed(1)}s)`;
}

export interface PillPhase {
  label: string;
  icon: LucideIcon;
}

/**
 * Map elapsed time (ms sejak pill dibuat) ke phase label + icon.
 *
 * Speculative — kita gak punya signal real-time dari Liana, jadi labels
 * di-pick generic enough buat match typical agent flow tanpa mislead user.
 *
 * Rentang dipilih berdasarkan pengamatan empiris flow Liana (think →
 * fetch context → format → finalize). Akan di-tune ulang setelah Phase 2
 * data analysis.
 */
export function elapsedToPhase(elapsedMs: number): PillPhase {
  const s = elapsedMs / 1000;
  if (s < 3) return { label: "Liana memikirkan", icon: Brain };
  if (s < 8) return { label: "Mengakses data keuangan", icon: Database };
  if (s < 15) return { label: "Menyusun struktur jawaban", icon: ListOrdered };
  return { label: "Hampir selesai", icon: Sparkles };
}
