import "server-only";

import type {
  PakasirCreateResponse,
  PakasirWebhookPayload,
} from "@/types/sorea";

// =====================================================================
// Pakasir API client
// =====================================================================
//
// Pakasir QRIS gateway:
// - Base URL: https://app.pakasir.com (configurable via PAKASIR_API_URL)
// - Auth: API key sebagai query param atau body field (depends endpoint)
// - Project ID: identifier project (bukan secret), dipakai untuk routing
//
// Konfigurasi via env:
// - PAKASIR_PROJECT_ID
// - PAKASIR_API_KEY (RAHASIA — jangan log/expose)
// - PAKASIR_API_URL
//
// Resiliensi: kita parse response Pakasir dengan defensive shape — JSON
// boleh null, field boleh missing — daripada crash hard kalau Pakasir
// ubah field naming.
// =====================================================================

export interface PakasirConfig {
  projectId: string;
  apiKey: string;
  apiUrl: string;
}

export class PakasirConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PakasirConfigError";
  }
}

/**
 * Read Pakasir config dari env. Throws kalau ada yang missing supaya
 * jelas masalahnya di startup / first call (bukan silent failure).
 */
export function getPakasirConfig(): PakasirConfig {
  const projectId = process.env.PAKASIR_PROJECT_ID?.trim();
  const apiKey = process.env.PAKASIR_API_KEY?.trim();
  const apiUrl = (process.env.PAKASIR_API_URL ?? "https://app.pakasir.com").trim();

  if (!projectId) {
    throw new PakasirConfigError(
      "PAKASIR_PROJECT_ID belum di-set di env.",
    );
  }
  if (!apiKey) {
    throw new PakasirConfigError(
      "PAKASIR_API_KEY belum di-set di env.",
    );
  }
  return { projectId, apiKey, apiUrl };
}

/**
 * Helper: cek availability config tanpa throw. Untuk UI yang mau tau
 * apakah feature Pakasir bisa di-enable atau tidak.
 */
export function isPakasirConfigured(): boolean {
  try {
    getPakasirConfig();
    return true;
  } catch {
    return false;
  }
}

// =====================================================================
// Create transaction (generate QRIS)
// =====================================================================

export interface CreatePakasirParams {
  /** Order code internal kita (mis. ORD-20260429-001) */
  orderId: string;
  /** Nominal Rupiah yang di-charge ke customer */
  amount: number;
  /** Optional callback URL override; default: NEXT_PUBLIC_APP_URL + /api/payments/pakasir-callback */
  callbackUrl?: string;
  /** Optional redirect URL setelah customer bayar */
  redirectUrl?: string;
}

export type CreatePakasirResult =
  | {
      ok: true;
      response: PakasirCreateResponse;
      /** Raw response body untuk audit log */
      raw: unknown;
    }
  | {
      ok: false;
      message: string;
      /** HTTP status kalau ada response */
      status?: number;
      /** Raw body untuk debug */
      raw?: unknown;
    };

/**
 * Create transaction di Pakasir → response berisi QRIS string yang akan
 * di-render jadi QR code di UI.
 *
 * Endpoint: POST {apiUrl}/api/transactioncreate
 * (kalau Pakasir punya path lain di docs, ganti di sini.)
 *
 * Body fields yang biasa Pakasir terima:
 *   project, amount, order_id, api_key, redirect_url, is_qris_only
 *
 * Pakasir response shape variable; kita pakai PakasirCreateResponse yang
 * defensive (semua field optional).
 */
export async function createPakasirTransaction(
  params: CreatePakasirParams,
): Promise<CreatePakasirResult> {
  let cfg: PakasirConfig;
  try {
    cfg = getPakasirConfig();
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Konfigurasi Pakasir invalid.",
    };
  }

  // Pakasir API: POST {apiUrl}/api/transactioncreate/{method}
  // Untuk QRIS, method = "qris". Body cuma {project, order_id, amount, api_key}.
  // Webhook + redirect URL di-config dari dashboard Pakasir, bukan per-request.
  const url = `${cfg.apiUrl.replace(/\/+$/, "")}/api/transactioncreate/qris`;

  const body = {
    project: cfg.projectId,
    amount: params.amount,
    order_id: params.orderId,
    api_key: cfg.apiKey,
  };
  // params.callbackUrl & params.redirectUrl tidak dipakai di payload (Pakasir
  // ambil dari project config), tapi tetap di-accept di interface untuk
  // forward-compat. Suppress unused-var warning.
  void params.callbackUrl;
  void params.redirectUrl;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      // 8s timeout (Pakasir biasanya cepat, kalau slow lebih baik fail)
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[pakasir.create] network error:", err);
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Gagal hubungi Pakasir: ${err.message}`
          : "Gagal hubungi Pakasir.",
    };
  }

  const raw = await safeReadJson(res);

  if (!res.ok) {
    console.error(
      "[pakasir.create] non-2xx:",
      res.status,
      JSON.stringify(raw).slice(0, 500),
    );
    return {
      ok: false,
      message:
        extractErrorMessage(raw) ?? `Pakasir mengembalikan ${res.status}.`,
      status: res.status,
      raw,
    };
  }

  // Pakasir bungkus response create dengan key "payment".
  const response = unwrapPayload<PakasirCreateResponse>(raw, [
    "payment",
    "data",
  ]);

  // Validasi minimal: harus ada payment_number (untuk render QR).
  if (!response.payment_number && !response.payment_url) {
    console.error(
      "[pakasir.create] response missing payment_number / payment_url:",
      JSON.stringify(raw).slice(0, 500),
    );
    return {
      ok: false,
      message:
        "Response Pakasir tidak punya payment_number/payment_url. Periksa API key dan project.",
      raw,
    };
  }

  return { ok: true, response, raw };
}

// =====================================================================
// Get transaction detail (verify webhook claim)
// =====================================================================

export type PakasirDetailResult =
  | {
      ok: true;
      detail: PakasirWebhookPayload;
      raw: unknown;
    }
  | {
      ok: false;
      message: string;
      status?: number;
      raw?: unknown;
    };

/**
 * Re-fetch detail transaksi langsung dari Pakasir API. Dipakai untuk
 * verify webhook payload — tidak trust webhook body 100%, kita tanya
 * langsung Pakasir "transaksi ini benar completed?".
 *
 * Endpoint umum: GET {apiUrl}/api/transactiondetail?project=&amount=&order_id=&api_key=
 *
 * Pakasir typically return same shape sebagai webhook (status, amount,
 * completed_at, dst), jadi kita re-use PakasirWebhookPayload type.
 */
export async function getPakasirTransactionDetail(params: {
  orderId: string;
  amount: number;
}): Promise<PakasirDetailResult> {
  let cfg: PakasirConfig;
  try {
    cfg = getPakasirConfig();
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Konfigurasi Pakasir invalid.",
    };
  }

  const search = new URLSearchParams({
    project: cfg.projectId,
    amount: String(params.amount),
    order_id: params.orderId,
    api_key: cfg.apiKey,
  });

  const url = `${cfg.apiUrl.replace(/\/+$/, "")}/api/transactiondetail?${search.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[pakasir.detail] network error:", err);
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Gagal hubungi Pakasir: ${err.message}`
          : "Gagal hubungi Pakasir.",
    };
  }

  const raw = await safeReadJson(res);

  if (!res.ok) {
    console.error(
      "[pakasir.detail] non-2xx:",
      res.status,
      JSON.stringify(raw).slice(0, 500),
    );
    return {
      ok: false,
      message:
        extractErrorMessage(raw) ?? `Pakasir mengembalikan ${res.status}.`,
      status: res.status,
      raw,
    };
  }

  // Pakasir bungkus response detail dengan key "transaction".
  const detail = unwrapPayload<PakasirWebhookPayload>(raw, [
    "transaction",
    "data",
  ]);
  return { ok: true, detail, raw };
}

// =====================================================================
// Helpers
// =====================================================================

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      const text = await res.text();
      return { _raw_text: text };
    } catch {
      return null;
    }
  }
}

/**
 * Pakasir bungkus payload dengan key yang berbeda per endpoint:
 *   - transactioncreate/qris  -> { payment: {...} }
 *   - transactiondetail        -> { transaction: {...} }
 *   - (generic / future)       -> { data: {...} }
 *
 * Helper ini coba unwrap berdasarkan key yang dispesifikasikan caller,
 * fallback ke body flat kalau gak ada wrapper.
 */
function unwrapPayload<T extends object>(
  body: unknown,
  keys: readonly string[] = ["data"],
): T {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of keys) {
      const inner = obj[key];
      if (inner && typeof inner === "object") {
        return inner as T;
      }
    }
  }
  return (body ?? {}) as T;
}

function extractErrorMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.error === "string") return obj.error;
  if (
    typeof obj.error === "object" &&
    obj.error !== null &&
    typeof (obj.error as Record<string, unknown>).message === "string"
  ) {
    return (obj.error as Record<string, unknown>).message as string;
  }
  return null;
}
