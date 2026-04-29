import { apiError, apiOk } from "@/lib/api/responses";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { generateQrisForOrder } from "@/lib/sorea/payments/actions";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/orders/:id/payment/pakasir/create
 *
 * Generate QRIS demo via Pakasir untuk order ini. Server kirim:
 * - amount = order.payment_amount (default 600 Rupiah)
 * - order_id = order.order_code (untuk audit Pakasir)
 * - callback_url = /api/payments/pakasir-callback
 *
 * Response: { ok: true, data: { display: QrisDisplayPayload } }
 *   400 invalid_id
 *   404 order_not_found
 *   409 order_already_paid
 *   410 order_cancelled
 *   412 no_business
 *   500 config_error / pakasir_error / qr_render_error / db_error
 */
export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return apiError("invalid_id", "ID order tidak valid.", 400);
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return apiError(
      "no_business",
      "Akun belum terhubung ke bisnis manapun.",
      412,
    );
  }

  const result = await generateQrisForOrder({ businessId, orderId: id });

  if (!result.ok) {
    const status =
      result.code === "order_not_found"
        ? 404
        : result.code === "order_already_paid"
          ? 409
          : result.code === "order_cancelled"
            ? 410
            : result.code === "config_error"
              ? 500
              : result.code === "pakasir_error"
                ? 502
                : result.code === "qr_render_error"
                  ? 500
                  : 500; // db_error
    return apiError(result.code, result.message, status);
  }

  return apiOk({ display: result.display });
}
