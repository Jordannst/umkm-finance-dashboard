import { apiError, apiOk } from "@/lib/api/responses";
import { resolveBusinessAuth } from "@/lib/api/dual-auth";
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
 * Auth: dual mode (Phase 4):
 *   - Session: dashboard user normal (RLS scoped via cookie)
 *   - Bearer LIANA_SHARED_SECRET: MCP, scoped via LIANA_BUSINESS_ID env.
 */
export async function GET(request: Request) {
  const auth = await resolveBusinessAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const orders = await listOrders(
    auth.businessId,
    {
      status: parseOrderStatus(url.searchParams.get("status")),
      paymentStatus: parsePaymentStatus(url.searchParams.get("payment_status")),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      search: url.searchParams.get("search"),
      limit: parseLimit(url.searchParams.get("limit")),
    },
    auth.supabase,
  );

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
 * Auth: dual mode (Phase 4):
 *   - Session: dashboard user normal (RLS scoped via cookie)
 *   - Bearer LIANA_SHARED_SECRET: Liana MCP server-to-server. business
 *     scope di-enforce dari env LIANA_BUSINESS_ID, bukan dari payload
 *     client — jadi penyerang yang punya secret tetap tidak bisa create
 *     order untuk business lain.
 *
 * Response sukses: { ok: true, data: { order, items } } status 201
 * Response error :
 *   400 validation_failed
 *   401 unauthorized (bearer salah)
 *   409 order_code_conflict (rare)
 *   412 no_business
 *   422 product_not_found / product_inactive / product_out_of_stock
 *   500 db_error
 */
export async function POST(request: Request) {
  const auth = await resolveBusinessAuth(request);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("invalid_json", "Body bukan JSON valid.", 400);
  }

  // Untuk request bearer (MCP), set default created_from_source='chat'
  // kalau client tidak kirim explicit. Untuk session, default tetap 'manual'.
  if (auth.mode === "bearer" && raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.created_from_source === undefined) {
      obj.created_from_source = "chat";
    }
    if (obj.created_by === undefined) {
      obj.created_by = "Liana";
    }
  }

  const result = await createOrderForBusiness({
    businessId: auth.businessId,
    rawInput: raw,
    client: auth.supabase,
  });

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
