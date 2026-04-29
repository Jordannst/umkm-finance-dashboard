import { apiError, apiOk } from "@/lib/api/responses";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { simulatePakasirSuccess } from "@/lib/sorea/payments/actions";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/orders/:id/payment/pakasir/simulate
 *
 * DEV/SANDBOX HELPER. Memaksa order ke status paid tanpa harus real-pay
 * QRIS. Berguna saat testing webhook flow secara lokal sebelum Pakasir
 * di-config dengan production webhook URL.
 *
 * Endpoint ini DIBLOKIR di production (NODE_ENV='production') kecuali
 * env ALLOW_PAKASIR_SIMULATE='1' explicit di-set.
 *
 * Response:
 *   200 { ok: true, data: { updated: boolean, orderId } }
 *   403 simulate_disabled
 *   404 order_not_found
 *   410 order_cancelled
 *   412 no_business
 *   500 db_error
 */
export async function POST(_request: Request, context: RouteContext) {
  // Guard: blok di production kecuali explicit allow.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PAKASIR_SIMULATE !== "1"
  ) {
    return apiError(
      "simulate_disabled",
      "Endpoint simulate dimatikan di production.",
      403,
    );
  }

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

  const result = await simulatePakasirSuccess({ businessId, orderId: id });

  if (!result.ok) {
    const status =
      result.code === "order_not_found"
        ? 404
        : result.code === "order_cancelled"
          ? 410
          : 500;
    return apiError(result.code, result.message, status);
  }

  return apiOk({ updated: result.updated, orderId: result.orderId });
}
