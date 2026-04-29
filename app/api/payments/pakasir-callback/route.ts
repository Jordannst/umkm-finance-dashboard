import { apiError, apiOk } from "@/lib/api/responses";
import { processPakasirCallback } from "@/lib/sorea/payments/actions";
import type { PakasirWebhookPayload } from "@/types/sorea";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/pakasir-callback
 *
 * Webhook receiver untuk Pakasir QRIS gateway. Pakasir kirim payload
 * saat customer selesai bayar. Validation pipeline (di lib/sorea/payments/actions.ts):
 *
 * 1. Body sanity check (order_id, amount, project, status).
 * 2. status === "completed".
 * 3. project cocok PAKASIR_PROJECT_ID.
 * 4. Order found by order_code.
 * 5. amount cocok order.payment_amount.
 * 6. Re-fetch /api/transactiondetail untuk konfirmasi independent.
 * 7. Update order: payment_status='paid', order_status='pembayaran_berhasil'.
 *
 * Idempotent: kalau order udah paid, return 200 OK tanpa update.
 *
 * Response:
 *   200 { ok: true, data: { updated: boolean } }
 *   200 (idempotent kalau already paid)
 *   400 invalid_payload
 *   404 order_not_found
 *   409 amount_mismatch / project_mismatch
 *   422 status_not_completed (intentional non-200 supaya Pakasir retry kalau status berubah)
 *   500 db_error / verify_failed
 *
 * NOTE penting: untuk 5xx, Pakasir biasanya retry. Untuk 4xx, gak retry.
 * Kita pilih status code yang sesuai supaya behaviour Pakasir benar.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("invalid_json", "Body bukan JSON valid.", 400);
  }

  // Log raw payload (truncated) untuk debug. Hati-hati: jangan log API
  // key kalau Pakasir kirim balik di body.
  console.info(
    "[pakasir-callback] received:",
    JSON.stringify(raw).slice(0, 500),
  );

  const result = await processPakasirCallback(raw as PakasirWebhookPayload);

  if (!result.ok) {
    const status =
      result.code === "invalid_payload"
        ? 400
        : result.code === "order_not_found"
          ? 404
          : result.code === "amount_mismatch" || result.code === "project_mismatch"
            ? 409
            : result.code === "status_not_completed"
              ? 422
              : 500; // db_error / verify_failed

    console.warn(
      `[pakasir-callback] reject ${result.code}:`,
      result.message,
      result.details ? JSON.stringify(result.details) : "",
    );
    return apiError(result.code, result.message, status);
  }

  console.info(
    `[pakasir-callback] ok updated=${result.updated} orderId=${result.orderId}`,
  );
  return apiOk({ updated: result.updated });
}

/**
 * Optional: GET handler buat health-check / verify dari dashboard
 * Pakasir saat setup webhook (beberapa gateway test endpoint dengan GET).
 */
export async function GET() {
  return apiOk({ message: "pakasir-callback endpoint ready" });
}
