import { apiError, apiOk } from "@/lib/api/responses";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { updateOrderForBusiness } from "@/lib/sorea/orders/actions";
import { getOrderWithItems } from "@/lib/sorea/orders/queries";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/orders/:id
 *
 * Detail order beserta items. 404 kalau tidak ada / soft-deleted.
 */
export async function GET(_request: Request, context: RouteContext) {
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

  const order = await getOrderWithItems(businessId, id);
  if (!order) {
    return apiError("not_found", "Order tidak ditemukan.", 404);
  }

  const { items, ...header } = order;
  return apiOk({ order: header, items });
}

/**
 * PATCH /api/orders/:id
 *
 * Update field-field tertentu (status, customer_name, fulfillment, dst).
 * Tidak boleh ubah: id, business_id, order_code, total, items, payment_*.
 *
 * Body partial — pakai schema di lib/sorea/orders/actions.ts.
 *
 * Response: { ok: true, data: { order } }
 *   400 validation_failed
 *   404 not_found
 *   500 db_error
 */
export async function PATCH(request: Request, context: RouteContext) {
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("invalid_json", "Body bukan JSON valid.", 400);
  }

  const result = await updateOrderForBusiness({
    businessId,
    id,
    rawInput: raw,
  });

  if (!result.ok) {
    const status =
      result.code === "validation_failed"
        ? 400
        : result.code === "not_found"
          ? 404
          : 500;
    return apiError(
      result.code,
      result.message,
      status,
      result.fieldErrors,
    );
  }

  return apiOk({ order: result.order });
}
