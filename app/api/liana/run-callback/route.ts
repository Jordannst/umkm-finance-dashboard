import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
import { markRunDone, markRunError } from "@/lib/finance/liana/runs";

export const dynamic = "force-dynamic";

/**
 * POST /api/liana/run-callback
 *
 * Endpoint yang Liana POST setelah hook /hooks/agent selesai diproses
 * (reply sudah dikirim ke Telegram, atau gagal). Kita update row
 * `liana_runs` supaya dashboard bisa render reply via Realtime.
 *
 * Auth: `Authorization: Bearer <OPENCLAW_HOOK_TOKEN>`
 *   Symmetric dengan token outbound — Liana yang punya token saat hook
 *   dikirim, dia juga yang pakai token saat callback. Token sama supaya
 *   gak nambah env var (defense-in-depth bisa di-improve nanti).
 *
 * Body shape (kasus sukses delivery):
 *   {
 *     "status": "delivered",          // mandatory
 *     "runId": "abc-...",             // dari OpenClaw
 *     "replyText": "Pengeluaranmu...", // text final yang dikirim ke Telegram
 *     "replyFormat": "markdown",       // optional, default 'plain'
 *     "deliveredAt": "2026-04-28T10:23:45.000Z", // optional
 *     "metadata": {
 *       "dashboardRunId": "<uuid>",    // <--- yang kita pakai untuk lookup row
 *       "userId": "<uuid>",
 *       "businessId": "<uuid>"
 *     }
 *   }
 *
 * Body shape (kasus error):
 *   {
 *     "status": "error",
 *     "runId": "abc-...",
 *     "error": "telegram api 403: bot was blocked by the user",
 *     "metadata": { ... }
 *   }
 *
 * Idempotent: callback bisa di-retry oleh Liana (network glitch, dll).
 * Update by id selalu deterministik — jadi multi-call aman.
 */

// Auth: bearer = process.env.OPENCLAW_HOOK_TOKEN, timing-safe compare.
function verifyCallbackAuth(request: Request): Response | null {
  const expected = process.env.OPENCLAW_HOOK_TOKEN;
  if (!expected || expected.trim() === "") {
    console.error(
      "[liana/run-callback] OPENCLAW_HOOK_TOKEN tidak diset. DITOLAK.",
    );
    return apiError(
      "server_misconfigured",
      "Callback endpoint tidak aktif: token belum dikonfigurasi di server.",
      503,
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return apiError(
      "unauthorized",
      "Header Authorization Bearer tidak ditemukan.",
      401,
    );
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(match[1].trim());
  if (a.length !== b.length) {
    return apiError("unauthorized", "Token tidak valid.", 401);
  }
  try {
    if (!timingSafeEqual(a, b)) {
      return apiError("unauthorized", "Token tidak valid.", 401);
    }
  } catch {
    return apiError("unauthorized", "Token tidak valid.", 401);
  }
  return null;
}

const metadataSchema = z
  .object({
    dashboardRunId: z.string().uuid().optional(),
    userId: z.string().optional(),
    businessId: z.string().optional(),
  })
  .partial();

const bodySchema = z
  .object({
    status: z.enum(["delivered", "done", "error", "failed"]),
    runId: z.string().min(1).optional(),
    replyText: z.string().min(1).max(50_000).optional(),
    replyFormat: z.enum(["plain", "markdown"]).optional(),
    deliveredAt: z.string().datetime().optional(),
    error: z.string().max(2000).optional(),
    metadata: metadataSchema.optional(),
  })
  .refine(
    (val) =>
      // Minimal salah satu identifier ada (runId atau metadata.dashboardRunId)
      Boolean(val.runId || val.metadata?.dashboardRunId),
    {
      message:
        "Body harus mengandung runId atau metadata.dashboardRunId.",
    },
  );

export async function POST(request: Request) {
  const authError = verifyCallbackAuth(request);
  if (authError) return authError;

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
      "Validasi callback body gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  const { status, runId, replyText, replyFormat, deliveredAt, error, metadata } =
    parsed.data;
  const dashboardRunId = metadata?.dashboardRunId;

  // Lookup keys: prefer dashboardRunId (UUID dari kita) karena lebih
  // reliable. Fall back ke runId kalau metadata gak dipassing.
  const lookup = dashboardRunId
    ? { id: dashboardRunId }
    : runId
      ? { runId }
      : null;

  if (!lookup) {
    // Sudah dijamin oleh refine di schema, tapi guard sekali lagi.
    return apiError(
      "validation_failed",
      "runId atau dashboardRunId wajib ada.",
      400,
    );
  }

  if (status === "delivered" || status === "done") {
    if (!replyText) {
      return apiError(
        "validation_failed",
        "replyText wajib ada untuk status delivered/done.",
        400,
      );
    }
    const result = await markRunDone({
      ...lookup,
      replyText,
      replyFormat,
      deliveredAt,
    });
    if (!result.updated) {
      // Tidak ada row yang cocok — bisa karena dashboardRunId / runId
      // tidak match (race condition atau callback dari run lama).
      // Return 200 supaya Liana gak retry tanpa henti.
      console.warn(
        "[liana/run-callback] no row matched for done callback",
        lookup,
      );
      return apiOk({ matched: false });
    }
    return apiOk({ matched: true, status: "done" });
  }

  // status = error | failed
  await markRunError({
    ...lookup,
    errorMessage: error ?? "Unknown error from Liana",
  });
  return apiOk({ matched: true, status: "error" });
}
