import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Helpers untuk tabel `liana_runs` — persistence "Tanya Liana" dari dashboard.
 *
 * Pakai admin client karena:
 *   - /api/liana/ask: route handler yang dipanggil user, tapi insert pakai
 *     admin supaya konsisten dengan callback yang juga admin (no RLS race).
 *   - /api/liana/run-callback: dipanggil OpenClaw, tidak ada cookie session.
 *
 * RLS: hanya SELECT yang authenticated. Write 100% lewat admin client.
 */

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

/**
 * Insert run baru dengan status='pending'. Dipanggil di /api/liana/ask
 * SEBELUM forward ke OpenClaw, supaya kalau forward gagal kita masih
 * punya record (status di-update jadi 'error').
 */
export async function insertPendingRun(params: {
  businessId: string;
  userId: string;
  prompt: string;
}): Promise<LianaRun | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("liana_runs")
    .insert({
      business_id: params.businessId,
      user_id: params.userId,
      prompt: params.prompt,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[liana_runs.insertPendingRun]:", error.message);
    return null;
  }
  return data as LianaRun;
}

/**
 * Set runId setelah berhasil forward ke OpenClaw. Status tetap 'pending'
 * sampai callback masuk.
 */
export async function attachRunIdToRun(params: {
  id: string;
  runId: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("liana_runs")
    .update({ run_id: params.runId })
    .eq("id", params.id);
  if (error) {
    console.error("[liana_runs.attachRunIdToRun]:", error.message);
  }
}

/**
 * Tandai run sebagai error. Dipanggil saat forward ke OpenClaw gagal
 * atau callback Liana lapor error.
 */
export async function markRunError(params: {
  id?: string;
  runId?: string;
  errorMessage: string;
}): Promise<void> {
  if (!params.id && !params.runId) {
    console.error("[liana_runs.markRunError]: must provide id or runId");
    return;
  }
  const supabase = createAdminClient();
  let q = supabase
    .from("liana_runs")
    .update({
      status: "error",
      error_message: params.errorMessage.slice(0, 1000),
    });
  q = params.id ? q.eq("id", params.id) : q.eq("run_id", params.runId!);
  const { error } = await q;
  if (error) {
    console.error("[liana_runs.markRunError]:", error.message);
  }
}

/**
 * Tandai run sebagai done dengan reply text Liana. Dipanggil di
 * /api/liana/run-callback saat Liana lapor delivery sukses.
 *
 * Lookup pakai EITHER `id` (UUID dashboardRunId) ATAU `runId` (OpenClaw runId).
 * Liana boleh kirim salah satu atau keduanya di callback body.
 */
export async function markRunDone(params: {
  id?: string;
  runId?: string;
  replyText: string;
  replyFormat?: "plain" | "markdown";
  deliveredAt?: string;
}): Promise<{ updated: boolean }> {
  if (!params.id && !params.runId) {
    console.error("[liana_runs.markRunDone]: must provide id or runId");
    return { updated: false };
  }

  const supabase = createAdminClient();
  let q = supabase
    .from("liana_runs")
    .update({
      status: "done",
      reply_text: params.replyText.slice(0, 50_000),
      reply_format: params.replyFormat ?? "plain",
      delivered_at: params.deliveredAt ?? new Date().toISOString(),
      // Clear error_message jika sebelumnya pernah error transient.
      error_message: null,
    })
    .select("id");

  q = params.id ? q.eq("id", params.id) : q.eq("run_id", params.runId!);
  const { data, error } = await q;

  if (error) {
    console.error("[liana_runs.markRunDone]:", error.message);
    return { updated: false };
  }
  return { updated: (data?.length ?? 0) > 0 };
}
