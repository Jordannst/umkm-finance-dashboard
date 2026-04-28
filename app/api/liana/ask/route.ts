import { z } from "zod";

import { askLiana } from "@/lib/api/openclaw-client";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
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

  // 3. Lookup telegram_chat_id user
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("telegram_chat_id, full_name")
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

  // 4. Build idempotency key default: bucket 5 menit (sama dengan dedup
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

  // 5. Forward ke OpenClaw
  const result = await askLiana({
    message: parsed.data.prompt,
    telegramChatId: profile.telegram_chat_id,
    name: profile.full_name ?? "UMKM Finance Dashboard",
    sessionKey: `hook:umkm-dashboard:${user.id}`,
    idempotencyKey,
  });

  if (!result.ok) {
    const res = apiError(result.reason, result.message, result.status);
    if (
      result.reason === "rate_limited" &&
      result.retryAfterSeconds !== undefined
    ) {
      res.headers.set("Retry-After", String(result.retryAfterSeconds));
    }
    return res;
  }

  return apiOk({ runId: result.runId });
}
