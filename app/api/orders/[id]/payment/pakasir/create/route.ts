import { apiError, apiOk } from "@/lib/api/responses";
import { resolveBusinessAuth } from "@/lib/api/dual-auth";
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
 * Auth: dual mode (Phase 4) — session atau Bearer LIANA_SHARED_SECRET.
 *
 * Response: { ok: true, data: { display: QrisDisplayPayload } }
 *   400 invalid_id
 *   401 unauthorized
 *   404 order_not_found
 *   409 order_already_paid
 *   410 order_cancelled
 *   412 no_business
 *   500 config_error / pakasir_error / qr_render_error / db_error
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return apiError("invalid_id", "ID order tidak valid.", 400);
  }

  const auth = await resolveBusinessAuth(request);
  if (!auth.ok) return auth.response;

  const result = await generateQrisForOrder({
    businessId: auth.businessId,
    orderId: id,
    client: auth.supabase,
  });

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
