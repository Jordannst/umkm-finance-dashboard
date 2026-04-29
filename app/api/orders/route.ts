import { apiError, apiOk } from "@/lib/api/responses";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { createOrderForBusiness } from "@/lib/sorea/orders/actions";
import { listOrders } from "@/lib/sorea/orders/queries";
import type { OrderStatus, PaymentStatus } from "@/types/sorea";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders
 *
 * List order untuk business yang sedang login. Filter via query string:
 *   ?status=menunggu_pembayaran          — filter order_status
 *   ?payment_status=paid                  — filter payment_status
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD        — date range pada created_at
 *   ?search=patricia                      — search customer_name OR order_code
 *   ?limit=N                              — default 50
 *
 * Response: { ok: true, data: { orders: Order[] } }
 *
 * Auth: dashboard session (RLS auto-scope ke current business).
 */
export async function GET(request: Request) {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return apiError(
      "no_business",
      "Akun belum terhubung ke bisnis manapun.",
      412,
    );
  }

  const url = new URL(request.url);
  const orders = await listOrders(businessId, {
    status: parseOrderStatus(url.searchParams.get("status")),
    paymentStatus: parsePaymentStatus(url.searchParams.get("payment_status")),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    search: url.searchParams.get("search"),
    limit: parseLimit(url.searchParams.get("limit")),
  });

  return apiOk({ orders });
}

/**
 * POST /api/orders
 *
 * Create order baru. Server resolve harga dari catalog (TIDAK terima
 * harga dari client). Validasi:
 * - Schema body
 * - Dedup duplicate SKU
 * - Reject product yang inactive / habis / tidak ada
 * - Generate order_code unique (retry-on-conflict)
 *
 * Auth: dashboard session. Phase 4 nanti tambah jalur shared-secret
 * bearer untuk Liana MCP — sementara session-only.
 *
 * Response sukses: { ok: true, data: { order, items } } status 201
 * Response error :
 *   400 validation_failed
 *   409 order_code_conflict (rare)
 *   412 no_business
 *   422 product_not_found / product_inactive / product_out_of_stock
 *   500 db_error
 */
export async function POST(request: Request) {
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

  const result = await createOrderForBusiness({ businessId, rawInput: raw });

  if (!result.ok) {
    const status =
      result.code === "validation_failed"
        ? 400
        : result.code === "order_code_conflict"
          ? 409
          : result.code === "db_error"
            ? 500
            : 422; // product_*

    return apiError(
      result.code,
      result.message,
      status,
      result.fieldErrors,
    );
  }

  const { items, ...order } = result.order;
  return apiOk({ order, items }, 201);
}

// =====================================================================
// Helpers
// =====================================================================

function parseOrderStatus(raw: string | null): OrderStatus | null {
  if (!raw) return null;
  const allowed: OrderStatus[] = [
    "menunggu_pembayaran",
    "pembayaran_berhasil",
    "diproses",
    "siap_diambil",
    "selesai",
    "dibatalkan",
  ];
  return (allowed as string[]).includes(raw) ? (raw as OrderStatus) : null;
}

function parsePaymentStatus(raw: string | null): PaymentStatus | null {
  if (!raw) return null;
  const allowed: PaymentStatus[] = ["pending", "paid", "failed", "refunded"];
  return (allowed as string[]).includes(raw) ? (raw as PaymentStatus) : null;
}

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), 1000);
}
