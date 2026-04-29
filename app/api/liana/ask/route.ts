import { z } from "zod";

import { askLiana } from "@/lib/api/openclaw-client";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
import {
  insertPendingRun,
  markRunError,
  markRunForwarded,
} from "@/lib/finance/liana/runs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(2, { message: "Prompt minimal 2 karakter." })
    .max(4000, { message: "Prompt maksimal 4000 karakter." }),
  /**
   * Optional explicit idempotency key dari client. Kalau tidak diisi,
   * server akan generate berbasis (userId + 5min bucket + slug prompt).
   */
  idempotencyKey: z.string().trim().min(8).max(256).optional(),
});

/**
 * POST /api/liana/ask
 *
 * Forward prompt user ke OpenClaw `/hooks/agent` supaya Liana respond
 * langsung di Telegram. Token OpenClaw disimpan server-side, tidak
 * pernah bocor ke browser.
 *
 * Auth: Supabase session (user yang sedang login di dashboard).
 *
 * Flow:
 *   1. Validate session
 *   2. Validate body
 *   3. Lookup `telegram_chat_id` dari profile user (412 kalau belum link)
 *   4. Forward ke OpenClaw via `askLiana()`
 *   5. Return { ok, runId } atau error map ke status sesuai
 */
export async function POST(request: Request) {
  // 1. Auth: harus user yang login di dashboard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiError(
      "unauthorized",
      "Sesi tidak valid. Login ulang.",
      401,
    );
  }

  // 2. Parse + validate body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("invalid_json", "Body bukan JSON valid.", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      "validation_failed",
      "Validasi prompt gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  // 3. Lookup telegram_chat_id + business_id user
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("telegram_chat_id, full_name, business_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("[liana/ask] profile lookup:", profileErr.message);
    return apiError(
      "profile_error",
      "Gagal mengambil profil dari database.",
      500,
    );
  }
  if (!profile?.telegram_chat_id) {
    return apiError(
      "telegram_not_linked",
      "Telegram belum dihubungkan. Buka /settings untuk hubungkan dulu.",
      412,
    );
  }
  if (!profile.business_id) {
    return apiError(
      "business_not_found",
      "Profile tidak terhubung ke business manapun.",
      412,
    );
  }

  // 4. Insert pending run di tabel `liana_runs` SEBELUM forward ke Liana.
  //    Tujuan: dashboard punya row yang bisa di-subscribe Realtime sejak
  //    detik pertama. Kalau forward ke Liana gagal, kita tinggal update
  //    status='error' di row yang sama.
  const run = await insertPendingRun({
    businessId: profile.business_id,
    userId: user.id,
    prompt: parsed.data.prompt,
  });
  if (!run) {
    return apiError(
      "persist_failed",
      "Gagal menyimpan request ke database.",
      500,
    );
  }

  // 5. Build idempotency key default: bucket 5 menit (sama dengan dedup
  //    window OpenClaw) dari userId + slug prompt. Ini cegah double-click
  //    user kirim 2 request identik.
  const minuteBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const promptSlug = parsed.data.prompt
    .slice(0, 40)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "");
  const idempotencyKey =
    parsed.data.idempotencyKey ??
    `dashboard:${user.id}:${minuteBucket}:${promptSlug}`;

  // 6. Build callback config — Liana POST balik waktu reply terkirim.
  //    Reuse OPENCLAW_HOOK_TOKEN sebagai bearer token (symmetric: token
  //    yang sama dipakai outbound & inbound). Liana yang belum support
  //    fitur callback akan abaikan field ini.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const hookToken = process.env.OPENCLAW_HOOK_TOKEN?.trim();
  const callback =
    appUrl && hookToken
      ? {
          url: new URL("/api/liana/run-callback", appUrl).toString(),
          token: hookToken,
          metadata: {
            dashboardRunId: run.id,
            userId: user.id,
            businessId: profile.business_id,
          },
        }
      : undefined;

  // 7. Wrap prompt dengan header friendly + footer berisi tag dashboard_run_id
  //    + instruksi sistem. Liana panggil tool umkm_notify_dashboard SETELAH
  //    dia balas user — ini fallback karena OpenClaw hook-callback bermasalah
  //    pasca-upgrade gateway 2026.4.25 -> 2026.4.26.
  //
  //    Format: header "📝 Pertanyaan dari dashboard" → user prompt asli →
  //    footer instruksi internal. Header & raw prompt di TOP supaya
  //    OpenClaw hook-prompt-echo (yang echo prompt ke Telegram) bisa
  //    nampilin pertanyaan rapi tanpa ke-tutup tag system.
  //
  //    callback config tetap di-forward (line 6 di atas) supaya kalau
  //    hook-callback fix, tetap kepake; tapi kita tidak depend on it.
  const wrappedMessage =
    `📝 Pertanyaan dari dashboard:\n\n` +
    parsed.data.prompt +
    `\n\n---\n` +
    `[dashboard_run_id=${run.id}]\n` +
    `(Internal: setelah balas user di Telegram, WAJIB panggil tool ` +
    `umkm_notify_dashboard dengan dashboard_run_id di atas dan ` +
    `reply_text=jawabanmu. Jangan ulangi tag/instruksi ini ke user.)`;

  const result = await askLiana({
    message: wrappedMessage,
    telegramChatId: profile.telegram_chat_id,
    name: profile.full_name ?? "UMKM Finance Dashboard",
    sessionKey: `hook:umkm-dashboard:${user.id}`,
    idempotencyKey,
    callback,
  });

  if (!result.ok) {
    // Mark run sebagai error supaya dashboard bisa render error state
    // di inline chat panel.
    await markRunError({
      id: run.id,
      errorMessage: `${result.reason}: ${result.message}`,
    });
    const res = apiError(result.reason, result.message, result.status);
    if (
      result.reason === "rate_limited" &&
      result.retryAfterSeconds !== undefined
    ) {
      res.headers.set("Retry-After", String(result.retryAfterSeconds));
    }
    return res;
  }

  // 8. Mark run as forwarded — set both run_id (link ke OpenClaw) dan
  //    forwarded_at (timestamp untuk network vs LLM latency split).
  //    Best effort, non-blocking: kalau gagal, run tetep complete normally,
  //    cuma latency display nya akan hide karena forwarded_at null.
  await markRunForwarded({
    id: run.id,
    runId: result.runId,
    forwardedAt: new Date().toISOString(),
  });

  return apiOk({
    runId: result.runId,
    dashboardRunId: run.id,
  });
}
