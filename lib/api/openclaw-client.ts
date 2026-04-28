import "server-only";

/**
 * Client wrapper untuk memanggil OpenClaw `/hooks/agent` dari Vercel server
 * route. Mengisolasi: building URL, auth header, body shape, error mapping,
 * timeout, dan idempotency.
 *
 * Spec referensi: see docs/integrasi-liana.md (POST /hooks/agent)
 *   - Auth: Authorization: Bearer <OPENCLAW_HOOK_TOKEN>
 *   - Body: { message, deliver, channel, to, sessionKey, ... }
 *   - Success: 200 { ok: true, runId: "uuid" }
 *   - Error 400/401/413/429/5xx (lihat OpenClawAskError)
 */

export interface OpenClawAskParams {
  /** Prompt user dalam bahasa natural. Wajib. */
  message: string;
  /**
   * Telegram chat_id user TANPA prefix "telegram:".
   * Wrapper ini akan tambahkan prefix saat kirim ke OpenClaw.
   */
  telegramChatId: string;
  /** Display name (muncul di OpenClaw "from"). Default: "UMKM Finance Dashboard". */
  name?: string;
  /**
   * Session continuity per user. Format yang direkomendasikan:
   *   `hook:umkm-dashboard:<userId>`
   * supaya context Liana untuk user X tetap konsisten antar request.
   *
   * CATATAN: hanya akan dikirim ke OpenClaw kalau env
   * `OPENCLAW_HOOKS_ALLOW_SESSION_KEY=1` (atau `true`). Default OpenClaw
   * blokir field ini dari external hooks dengan error:
   *   "sessionKey is disabled for externally supplied hooks".
   * Untuk enable: di VPS set `hooks.allowRequestSessionKey=true` lalu
   * restart openclaw-gateway, baru flip env Vercel.
   */
  sessionKey?: string;
  /**
   * Idempotency key (max 256 char). Kalau key sama dikirim ulang dalam
   * 5 menit, OpenClaw return runId yang sama. Pakai untuk hindari
   * double-submit dari user double-click.
   */
  idempotencyKey?: string;
  /**
   * Callback config — Liana POST balik ke endpoint kita waktu reply
   * sudah dikirim ke Telegram (atau gagal). Dipakai dashboard untuk
   * update inline chat panel real-time tanpa polling.
   *
   * Hanya dikirim ke OpenClaw kalau `callback.url` & `callback.token`
   * dua-duanya ada. Kalau Liana belum support fitur ini, dia akan
   * abaikan field ini (graceful degradation — request tetap dilayani,
   * cuma tidak ada notifikasi delivery di dashboard).
   */
  callback?: {
    /** Endpoint yang Liana POST setelah delivery sukses/gagal. */
    url: string;
    /** Bearer token yang Liana sertakan di header Authorization. */
    token: string;
    /**
     * Metadata yang Liana echo balik di body callback. Pakai untuk
     * passing identifier internal seperti `dashboardRunId` (UUID row
     * di tabel liana_runs).
     */
    metadata?: Record<string, string>;
  };
}

export interface OpenClawAskSuccess {
  ok: true;
  runId: string;
}

export type OpenClawAskFailureReason =
  | "not_configured"
  | "telegram_not_linked" // tidak dipakai di sini, untuk konsumen di route
  | "validation_failed"
  | "upstream_unauthorized"
  | "rate_limited"
  | "upstream_error"
  | "timeout";

export interface OpenClawAskFailure {
  ok: false;
  /** HTTP status untuk dikembalikan ke client browser. */
  status: number;
  reason: OpenClawAskFailureReason;
  message: string;
  /** Hanya ada saat reason = 'rate_limited'. */
  retryAfterSeconds?: number;
}

export type OpenClawAskResult = OpenClawAskSuccess | OpenClawAskFailure;

const DEFAULT_TIMEOUT_MS = 65_000;

export async function askLiana(
  params: OpenClawAskParams,
): Promise<OpenClawAskResult> {
  const baseUrl = process.env.OPENCLAW_HOOKS_URL;
  const token = process.env.OPENCLAW_HOOK_TOKEN;
  const path = process.env.OPENCLAW_HOOKS_PATH ?? "/hooks/agent";
  // OpenClaw default blokir `sessionKey` dari external hooks (validation_failed).
  // Aktifkan hanya kalau VPS sudah set `hooks.allowRequestSessionKey=true`.
  const allowSessionKey =
    process.env.OPENCLAW_HOOKS_ALLOW_SESSION_KEY?.trim() === "1" ||
    process.env.OPENCLAW_HOOKS_ALLOW_SESSION_KEY?.trim().toLowerCase() ===
      "true";

  if (!baseUrl || !token) {
    return {
      ok: false,
      status: 503,
      reason: "not_configured",
      message:
        "Liana hooks belum dikonfigurasi di server. Set OPENCLAW_HOOKS_URL & OPENCLAW_HOOK_TOKEN.",
    };
  }

  let url: string;
  try {
    url = new URL(path, baseUrl).toString();
  } catch {
    return {
      ok: false,
      status: 503,
      reason: "not_configured",
      message: "OPENCLAW_HOOKS_URL tidak valid.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (params.idempotencyKey) {
    // OpenClaw support both "Idempotency-Key" dan "X-OpenClaw-Idempotency-Key";
    // pakai standar industri.
    headers["Idempotency-Key"] = params.idempotencyKey.slice(0, 256);
  }

  const body = JSON.stringify({
    name: params.name ?? "UMKM Finance Dashboard",
    message: params.message,
    // sessionKey hanya dikirim kalau OpenClaw enable allowRequestSessionKey
    // (lihat OPENCLAW_HOOKS_ALLOW_SESSION_KEY). Default OpenClaw reject 400
    // dengan message "sessionKey is disabled for externally supplied hooks".
    ...(allowSessionKey && params.sessionKey
      ? { sessionKey: params.sessionKey }
      : {}),
    wakeMode: "now",
    deliver: true,
    channel: "telegram",
    to: `telegram:${params.telegramChatId}`,
    timeoutSeconds: 60,
    // Callback supaya Liana POST balik waktu reply sudah dikirim ke
    // Telegram. Liana yang belum support fitur ini akan abaikan field
    // ini (request tetap dilayani; tidak ada notifikasi delivery).
    ...(params.callback?.url && params.callback?.token
      ? {
          callback: {
            url: params.callback.url,
            headers: {
              Authorization: `Bearer ${params.callback.token}`,
              "Content-Type": "application/json",
            },
            metadata: params.callback.metadata ?? {},
            events: ["delivered", "error"],
          },
        }
      : {}),
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    console.error(
      "[openclaw-client] fetch failed:",
      isAbort ? "timeout" : err,
    );
    return {
      ok: false,
      status: 504,
      reason: isAbort ? "timeout" : "upstream_error",
      message: isAbort
        ? "Liana tidak menjawab dalam 65 detik."
        : "Tidak bisa menghubungi server Liana.",
    };
  } finally {
    clearTimeout(timer);
  }

  // Specific status mapping dulu sebelum body parsing — beberapa error
  // (401, 429) bodynya plain text saja.
  if (res.status === 401) {
    console.error(
      "[openclaw-client] OpenClaw rejected token (401). Cek OPENCLAW_HOOK_TOKEN.",
    );
    return {
      ok: false,
      status: 502,
      reason: "upstream_unauthorized",
      message: "Token Liana tidak diterima OpenClaw. Hubungi admin.",
    };
  }
  if (res.status === 429) {
    const retryAfterStr = res.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterStr ? Number(retryAfterStr) : undefined;
    return {
      ok: false,
      status: 429,
      reason: "rate_limited",
      retryAfterSeconds: Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds
        : undefined,
      message: "Liana sedang sibuk. Coba lagi sebentar.",
    };
  }

  // Try parse body sebagai JSON, fallback ke teks.
  const contentType = res.headers.get("content-type") ?? "";
  let parsedBody: unknown = null;
  let textBody = "";
  if (contentType.includes("application/json")) {
    parsedBody = await res.json().catch(() => null);
  } else {
    textBody = await res.text().catch(() => "");
  }

  if (!res.ok) {
    const upstreamMsg =
      (parsedBody &&
        typeof parsedBody === "object" &&
        "error" in parsedBody &&
        typeof (parsedBody as { error: unknown }).error === "string"
        ? (parsedBody as { error: string }).error
        : null) ?? textBody.slice(0, 200);

    console.error(
      "[openclaw-client] upstream error:",
      res.status,
      upstreamMsg || "(no body)",
    );

    if (res.status === 400 || res.status === 413) {
      return {
        ok: false,
        status: 400,
        reason: "validation_failed",
        message: upstreamMsg || `Validasi OpenClaw gagal (HTTP ${res.status}).`,
      };
    }
    return {
      ok: false,
      status: 502,
      reason: "upstream_error",
      message: upstreamMsg || `OpenClaw error ${res.status}.`,
    };
  }

  // Success path: harus { ok: true, runId: "..." }
  if (
    parsedBody &&
    typeof parsedBody === "object" &&
    "ok" in parsedBody &&
    (parsedBody as { ok: unknown }).ok === true &&
    "runId" in parsedBody &&
    typeof (parsedBody as { runId: unknown }).runId === "string"
  ) {
    return { ok: true, runId: (parsedBody as { runId: string }).runId };
  }

  console.error(
    "[openclaw-client] unexpected success body shape:",
    parsedBody,
  );
  return {
    ok: false,
    status: 502,
    reason: "upstream_error",
    message: "Response Liana tidak sesuai format yang diharapkan.",
  };
}

/**
 * Boolean helper: apakah server saat ini punya konfigurasi lengkap untuk
 * mode 'send' (forward ke OpenClaw). Dipakai oleh route untuk early-return,
 * dan oleh halaman/komponen untuk decision tree mode.
 */
export function isOpenClawHooksConfigured(): boolean {
  return Boolean(
    process.env.OPENCLAW_HOOKS_URL?.trim() &&
      process.env.OPENCLAW_HOOK_TOKEN?.trim(),
  );
}
