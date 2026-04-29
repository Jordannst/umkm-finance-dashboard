import "server-only";

import QRCode from "qrcode";

import {
  createPakasirTransaction,
  getPakasirConfig,
  getPakasirTransactionDetail,
  type CreatePakasirParams,
} from "@/lib/sorea/payments/pakasir";
import { createClient } from "@/lib/supabase/server";
import type {
  Order,
  PakasirWebhookPayload,
  QrisDisplayPayload,
} from "@/types/sorea";

// =====================================================================
// Generate QRIS untuk order
// =====================================================================

export type GenerateQrisResult =
  | {
      ok: true;
      display: QrisDisplayPayload;
      order: Order;
    }
  | {
      ok: false;
      code:
        | "order_not_found"
        | "order_already_paid"
        | "order_cancelled"
        | "config_error"
        | "pakasir_error"
        | "qr_render_error"
        | "db_error";
      message: string;
      raw?: unknown;
    };

/**
 * Generate QRIS Pakasir untuk order. Workflow:
 *
 * 1. Validate order: ada, belum paid, belum cancelled.
 * 2. Call Pakasir create-transaction (server, dengan API key).
 * 3. Render QRIS string → data URL gambar (server-side via `qrcode`).
 * 4. Update order: payment_provider='pakasir', payment_reference (kalau
 *    ada transaction_id dari Pakasir), payment_amount echoed.
 * 5. Return display payload untuk UI.
 *
 * NOTE: kita TIDAK ubah order_status di sini. Order tetap "menunggu
 * pembayaran" sampai webhook pakasir-callback datang dengan status
 * "completed".
 */
export async function generateQrisForOrder(params: {
  businessId: string;
  orderId: string;
  /** Optional callback URL override; default dibangun dari NEXT_PUBLIC_APP_URL */
  callbackUrl?: string;
}): Promise<GenerateQrisResult> {
  const supabase = await createClient();

  // 1. Fetch order
  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", params.orderId)
    .eq("business_id", params.businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (orderErr) {
    console.error("[generateQrisForOrder] supabase fetch error:", orderErr.message);
    return { ok: false, code: "db_error", message: orderErr.message };
  }
  if (!orderRow) {
    return { ok: false, code: "order_not_found", message: "Order tidak ditemukan." };
  }
  const order = orderRow as Order;

  if (order.payment_status === "paid") {
    return {
      ok: false,
      code: "order_already_paid",
      message: "Order sudah lunas; tidak perlu generate QRIS lagi.",
    };
  }
  if (order.order_status === "dibatalkan") {
    return {
      ok: false,
      code: "order_cancelled",
      message: "Order sudah dibatalkan.",
    };
  }

  // 2. Build callback URL (kalau gak di-override).
  const callbackUrl =
    params.callbackUrl ??
    buildCallbackUrl();

  // 3. Call Pakasir
  const createParams: CreatePakasirParams = {
    orderId: order.order_code, // pakai order_code, bukan UUID, supaya gampang dibaca human
    amount: order.payment_amount,
    callbackUrl,
  };

  const pakasirResult = await createPakasirTransaction(createParams);
  if (!pakasirResult.ok) {
    return {
      ok: false,
      code:
        pakasirResult.message.includes("PAKASIR_") ||
        pakasirResult.message.includes("env")
          ? "config_error"
          : "pakasir_error",
      message: pakasirResult.message,
      raw: pakasirResult.raw,
    };
  }

  const pkResp = pakasirResult.response;
  const emv = pkResp.payment_number ?? "";
  const expiredAt = pkResp.expired_at ?? null;
  const fee = typeof pkResp.fee === "number" ? pkResp.fee : null;
  const totalPayment =
    typeof pkResp.total_payment === "number" ? pkResp.total_payment : null;
  // Pakasir tidak return transaction_id terpisah; pakai order_id sebagai
  // reference (dia memang pakai (project, order_id, amount) sebagai
  // composite key di backend mereka).
  const pakasirReference =
    typeof pkResp.transaction_id === "string"
      ? pkResp.transaction_id
      : (pkResp.order_id as string | undefined) ?? order.order_code;

  // 4. Render QR ke data URL (server-side, hemat client bundle).
  let qrDataUrl = "";
  if (emv) {
    try {
      qrDataUrl = await QRCode.toDataURL(emv, {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 6,
      });
    } catch (err) {
      console.error("[generateQrisForOrder] qr render error:", err);
      return {
        ok: false,
        code: "qr_render_error",
        message: "Gagal render QR code dari payment_number.",
      };
    }
  } else if (pkResp.payment_url) {
    // Fallback: kalau Pakasir cuma kasih payment_url (non-QRIS), kita
    // simpan tapi gak render QR — UI akan tampilin link button.
    qrDataUrl = "";
  }

  // 5. Update order metadata. Compose updates carefully — kita tidak
  // ubah status order/payment di sini (biarkan webhook yang flip).
  const update: Partial<Order> = {
    payment_provider: "pakasir",
  };
  if (pakasirReference) {
    update.payment_reference = pakasirReference;
  }

  const { data: updatedRow, error: updErr } = await supabase
    .from("orders")
    .update(update)
    .eq("id", order.id)
    .eq("business_id", params.businessId)
    .select("*")
    .single();

  if (updErr) {
    console.error(
      "[generateQrisForOrder] update order error (non-fatal):",
      updErr.message,
    );
    // Non-fatal: kita tetap return ke client supaya QR bisa di-display,
    // metadata bisa di-retry nanti via re-generate.
  }

  return {
    ok: true,
    display: {
      qrDataUrl,
      emv,
      expiredAt,
      amount: order.payment_amount,
      fee,
      totalPayment,
      pakasirReference,
    },
    order: (updatedRow as Order) ?? order,
  };
}

// =====================================================================
// Webhook callback processor
// =====================================================================

export type ProcessCallbackResult =
  | {
      ok: true;
      /** True jika status berubah, false jika idempotent (already paid). */
      updated: boolean;
      orderId: string;
    }
  | {
      ok: false;
      code:
        | "invalid_payload"
        | "order_not_found"
        | "amount_mismatch"
        | "project_mismatch"
        | "status_not_completed"
        | "verify_failed"
        | "db_error";
      message: string;
      details?: Record<string, unknown>;
    };

/**
 * Process webhook callback dari Pakasir. Validation pipeline:
 *
 * 1. Payload sanity (order_id + amount + project + status).
 * 2. Status === "completed" (kita tidak care payment_status lain di sini).
 * 3. Project cocok env PAKASIR_PROJECT_ID.
 * 4. Find order by order_code dalam DB (admin client supaya bypass RLS;
 *    webhook tidak punya session user).
 * 5. Amount cocok order.payment_amount.
 * 6. Re-fetch via /api/transactiondetail untuk konfirmasi (defense-in-depth).
 * 7. Update order: payment_status='paid', order_status='pembayaran_berhasil',
 *    save provider payload ke notes? — kita pilih cara yang minim breaking:
 *    payment_reference kalau belum ada, dan payment_provider='pakasir'.
 * 8. Idempotent: kalau order sudah paid, return ok updated=false (200).
 */
export async function processPakasirCallback(
  payload: PakasirWebhookPayload,
): Promise<ProcessCallbackResult> {
  const orderCode = typeof payload.order_id === "string" ? payload.order_id : null;
  const amount =
    typeof payload.amount === "number"
      ? payload.amount
      : typeof payload.amount === "string"
        ? Number(payload.amount)
        : NaN;
  const project = typeof payload.project === "string" ? payload.project : null;
  const status = typeof payload.status === "string" ? payload.status : null;

  if (!orderCode || !Number.isFinite(amount) || !project || !status) {
    return {
      ok: false,
      code: "invalid_payload",
      message: "Payload webhook tidak lengkap.",
      details: { orderCode, amount, project, status },
    };
  }

  if (status !== "completed") {
    return {
      ok: false,
      code: "status_not_completed",
      message: `Status webhook bukan completed (got: ${status}). Diabaikan.`,
    };
  }

  // Verify project match.
  let cfg;
  try {
    cfg = getPakasirConfig();
  } catch (err) {
    return {
      ok: false,
      code: "verify_failed",
      message:
        err instanceof Error ? err.message : "Konfigurasi Pakasir invalid.",
    };
  }
  if (project !== cfg.projectId) {
    return {
      ok: false,
      code: "project_mismatch",
      message: `Project di webhook (${project}) tidak cocok dengan PAKASIR_PROJECT_ID.`,
    };
  }

  // Find order. Webhook gak punya session, pakai admin client.
  const adminSupabase = await createAdminClient();
  const { data: orderRow, error: fetchErr } = await adminSupabase
    .from("orders")
    .select("*")
    .eq("order_code", orderCode)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr) {
    console.error("[processPakasirCallback] fetch error:", fetchErr.message);
    return { ok: false, code: "db_error", message: fetchErr.message };
  }
  if (!orderRow) {
    return {
      ok: false,
      code: "order_not_found",
      message: `Order ${orderCode} tidak ditemukan.`,
    };
  }
  const order = orderRow as Order;

  // Idempotent: kalau udah paid, return 200 OK tanpa update.
  if (order.payment_status === "paid") {
    return { ok: true, updated: false, orderId: order.id };
  }

  // Amount cocok payment_amount order.
  if (amount !== order.payment_amount) {
    return {
      ok: false,
      code: "amount_mismatch",
      message: `Amount webhook (${amount}) tidak cocok dengan payment_amount order (${order.payment_amount}).`,
    };
  }

  // Defense-in-depth: re-fetch dari Pakasir API.
  const detailRes = await getPakasirTransactionDetail({
    orderId: order.order_code,
    amount: order.payment_amount,
  });
  if (!detailRes.ok) {
    console.error(
      "[processPakasirCallback] re-verify failed:",
      detailRes.message,
    );
    return {
      ok: false,
      code: "verify_failed",
      message: `Verifikasi ulang ke Pakasir gagal: ${detailRes.message}`,
    };
  }
  const verifiedStatus =
    typeof detailRes.detail.status === "string" ? detailRes.detail.status : null;
  if (verifiedStatus !== "completed") {
    return {
      ok: false,
      code: "verify_failed",
      message: `Pakasir API confirm status: ${verifiedStatus ?? "unknown"} (bukan completed).`,
    };
  }

  // Update order.
  const completedAt =
    typeof payload.completed_at === "string" ? payload.completed_at : null;

  const update: Partial<Order> = {
    payment_status: "paid",
    order_status: "pembayaran_berhasil",
    payment_provider: "pakasir",
  };
  // Save provider reference (kalau detail kasih transaction id).
  const refFromDetail =
    typeof (detailRes.detail as Record<string, unknown>).transaction_id === "string"
      ? ((detailRes.detail as Record<string, unknown>).transaction_id as string)
      : null;
  if (refFromDetail && !order.payment_reference) {
    update.payment_reference = refFromDetail;
  }

  const { error: updErr } = await adminSupabase
    .from("orders")
    .update(update)
    .eq("id", order.id);

  if (updErr) {
    console.error("[processPakasirCallback] update error:", updErr.message);
    return { ok: false, code: "db_error", message: updErr.message };
  }

  console.info(
    `[processPakasirCallback] order ${order.order_code} marked paid via Pakasir; completed_at=${completedAt}`,
  );
  return { ok: true, updated: true, orderId: order.id };
}

// =====================================================================
// Simulate (dev/sandbox only): paksa order ke status paid tanpa harus
// real-pay QRIS. Berguna untuk smoke test webhook flow lokal.
// =====================================================================

export type SimulateResult =
  | { ok: true; updated: boolean; orderId: string }
  | {
      ok: false;
      code: "order_not_found" | "order_cancelled" | "db_error";
      message: string;
    };

/**
 * Simulasi webhook completed untuk order. Behaviour identik dengan
 * processPakasirCallback() success path, tapi skip semua verify ke
 * Pakasir. Endpoint API yang invoke ini di-gate per env (lihat route).
 */
export async function simulatePakasirSuccess(params: {
  businessId: string;
  orderId: string;
}): Promise<SimulateResult> {
  const supabase = await createClient();
  const { data: orderRow, error: fetchErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", params.orderId)
    .eq("business_id", params.businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr) {
    console.error("[simulatePakasirSuccess] fetch error:", fetchErr.message);
    return { ok: false, code: "db_error", message: fetchErr.message };
  }
  if (!orderRow) {
    return {
      ok: false,
      code: "order_not_found",
      message: "Order tidak ditemukan.",
    };
  }
  const order = orderRow as Order;

  if (order.order_status === "dibatalkan") {
    return {
      ok: false,
      code: "order_cancelled",
      message: "Order sudah dibatalkan.",
    };
  }

  if (order.payment_status === "paid") {
    return { ok: true, updated: false, orderId: order.id };
  }

  const { error: updErr } = await supabase
    .from("orders")
    .update({
      payment_status: "paid",
      order_status: "pembayaran_berhasil",
      payment_provider: "pakasir",
    })
    .eq("id", order.id)
    .eq("business_id", params.businessId);

  if (updErr) {
    console.error("[simulatePakasirSuccess] update error:", updErr.message);
    return { ok: false, code: "db_error", message: updErr.message };
  }

  console.info(
    `[simulatePakasirSuccess] order ${order.order_code} marked paid (SIMULATE).`,
  );
  return { ok: true, updated: true, orderId: order.id };
}

// =====================================================================
// Helpers
// =====================================================================

function buildCallbackUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000";
  return `${base}/api/payments/pakasir-callback`;
}

/**
 * Admin client untuk webhook handler — webhook gak punya session user,
 * jadi kita pakai service role untuk bypass RLS. Hanya dipakai di
 * server-side handler webhook.
 */
async function createAdminClient() {
  const { createClient: createSupabaseClient } = await import(
    "@supabase/supabase-js"
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY tidak di-set; webhook tidak bisa update DB.",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
