import { apiError, apiOk } from "@/lib/api/responses";
import { resolveBusinessAuth } from "@/lib/api/dual-auth";
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
 *
 * Auth: dual mode (Phase 4) — session atau Bearer LIANA_SHARED_SECRET.
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return apiError("invalid_id", "ID order tidak valid.", 400);
  }

  const auth = await resolveBusinessAuth(request);
  if (!auth.ok) return auth.response;

  const order = await getOrderWithItems(auth.businessId, id, auth.supabase);
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
 * Auth: dual mode (Phase 4) — session atau Bearer LIANA_SHARED_SECRET.
 *
 * Response: { ok: true, data: { order } }
 *   400 validation_failed
 *   401 unauthorized
 *   404 not_found
 *   500 db_error
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return apiError("invalid_id", "ID order tidak valid.", 400);
  }

  const auth = await resolveBusinessAuth(request);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("invalid_json", "Body bukan JSON valid.", 400);
  }

  const result = await updateOrderForBusiness({
    businessId: auth.businessId,
    id,
    rawInput: raw,
    client: auth.supabase,
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
