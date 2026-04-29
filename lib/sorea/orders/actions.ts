import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { todayJakarta } from "@/lib/finance/format";
import { getProductBySku } from "@/lib/sorea/products/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  Order,
  OrderItem,
  OrderSource,
  OrderStatus,
  OrderWithItems,
  PaymentStatus,
} from "@/types/sorea";

import { countOrdersForToday } from "./queries";

// =====================================================================
// Schemas
// =====================================================================

const orderItemInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, { message: "SKU wajib diisi." })
    .max(32, { message: "SKU maksimal 32 karakter." }),
  qty: z
    .number({ message: "Qty harus angka." })
    .int({ message: "Qty harus bilangan bulat." })
    .min(1, { message: "Qty minimal 1." })
    .max(1000, { message: "Qty terlalu besar." }),
});

const orderSourceSchema = z.enum(["dashboard", "chat", "system"]);

export const createOrderInputSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, { message: "Nama customer wajib diisi." })
    .max(120, { message: "Nama customer maksimal 120 karakter." }),
  fulfillment_method: z
    .string()
    .trim()
    .min(1, { message: "Metode fulfillment wajib diisi." })
    .max(60, { message: "Metode fulfillment maksimal 60 karakter." }),
  address: z
    .string()
    .trim()
    .max(500, { message: "Alamat maksimal 500 karakter." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  notes: z
    .string()
    .trim()
    .max(500, { message: "Catatan maksimal 500 karakter." })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  items: z
    .array(orderItemInputSchema)
    .min(1, { message: "Order harus punya minimal 1 item." })
    .max(50, { message: "Order maksimal 50 item." }),
  created_by: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  created_from_source: orderSourceSchema.optional().default("dashboard"),
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

// =====================================================================
// Order code generator
// =====================================================================

/**
 * Generate `ORD-YYYYMMDD-NNN` untuk hari ini di business tertentu.
 *
 * Strategy: count orders hari ini dari DB → next sequence = count + 1.
 * Retry-on-conflict di-handle di caller (createOrderForBusiness): kalau
 * INSERT throw 23505 (unique_violation), caller call function ini lagi
 * dengan attemptOffset bertambah supaya skip ke nomor berikutnya.
 *
 * Untuk volume UMKM (<1000 order/hari), retry max 5x cukup.
 */
async function generateOrderCode(
  businessId: string,
  attemptOffset: number = 0,
): Promise<string> {
  // todayJakarta() returns "YYYY-MM-DD". Strip dash supaya jadi YYYYMMDD.
  const todayDashes = todayJakarta(); // e.g. "2026-04-29"
  const todayPacked = todayDashes.replaceAll("-", ""); // e.g. "20260429"
  const prefix = `ORD-${todayPacked}-`;

  const count = await countOrdersForToday(businessId, prefix);
  const next = count + 1 + attemptOffset;
  // Pad min 3 digits (P001-P999), 4+ digits naturally untuk overflow.
  const padded = String(next).padStart(3, "0");
  return `${prefix}${padded}`;
}

// =====================================================================
// Create order
// =====================================================================

export type CreateOrderResult =
  | { ok: true; order: OrderWithItems }
  | {
      ok: false;
      code:
        | "validation_failed"
        | "product_not_found"
        | "product_inactive"
        | "product_out_of_stock"
        | "order_code_conflict"
        | "db_error";
      message: string;
      fieldErrors?: Record<string, string>;
    };

/**
 * Create order baru untuk business tertentu. Validasi:
 * - Schema validation (Zod)
 * - Dedup duplicate SKU (sum qty)
 * - Resolve setiap product:
 *   - Reject jika tidak ada / soft-deleted
 *   - Reject jika is_active=false
 *   - Reject jika stock_status='habis'
 * - Hitung total dari snapshot harga
 * - Generate order_code dengan retry-on-conflict (max 5x)
 * - Insert orders + order_items dengan compensating delete pattern
 *
 * Tidak pakai RPC karena Supabase JS belum support nested transactions
 * easily; kalau items insert gagal, kita DELETE order yang udah dibuat.
 *
 * Returns: { ok: true, order } atau { ok: false, code, message, fieldErrors }.
 */
export async function createOrderForBusiness(params: {
  businessId: string;
  rawInput: unknown;
}): Promise<CreateOrderResult> {
  const parsed = createOrderInputSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? String(issue.path[0]) : "";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      code: "validation_failed",
      message: "Validasi input gagal.",
      fieldErrors,
    };
  }
  const input = parsed.data;

  // Dedup: kalau ada item dengan SKU sama, sum qty. Bikin data lebih rapih.
  const dedupedItems = dedupeItemsBySku(input.items);

  // Resolve setiap product. Pakai Promise.all untuk parallel lookups.
  const resolvedResults = await Promise.all(
    dedupedItems.map((it) =>
      getProductBySku(params.businessId, it.sku).then((product) => ({
        input: it,
        product,
      })),
    ),
  );

  // Validate setiap resolution.
  for (const { input: it, product } of resolvedResults) {
    if (!product) {
      return {
        ok: false,
        code: "product_not_found",
        message: `Produk dengan SKU "${it.sku}" tidak ditemukan.`,
      };
    }
    if (!product.is_active) {
      return {
        ok: false,
        code: "product_inactive",
        message: `Produk "${product.name}" sedang tidak aktif (off menu).`,
      };
    }
    if (product.stock_status === "habis") {
      return {
        ok: false,
        code: "product_out_of_stock",
        message: `Produk "${product.name}" sedang habis.`,
      };
    }
  }

  // Hitung subtotal per item + total order. Server resolve dari catalog,
  // tidak terima harga dari client.
  const itemRows = resolvedResults.map(({ input: it, product }) => {
    const unitPrice = product!.price; // safe karena udah validate di atas
    const subtotal = unitPrice * it.qty;
    return {
      product_id: product!.id,
      sku: product!.sku,
      product_name: product!.name,
      qty: it.qty,
      unit_price: unitPrice,
      subtotal,
    };
  });

  const orderTotal = itemRows.reduce((sum, r) => sum + r.subtotal, 0);

  // Insert order dengan retry-on-conflict pada order_code unique.
  const supabase = await createClient();
  const created = await insertOrderWithRetry(supabase, {
    businessId: params.businessId,
    customerName: input.customer_name,
    fulfillmentMethod: input.fulfillment_method,
    address: input.address,
    notes: input.notes,
    orderTotalAmount: orderTotal,
    createdBy: input.created_by,
    createdFromSource: input.created_from_source,
  });

  if (!created.ok) {
    return {
      ok: false,
      code: created.reason === "code_conflict" ? "order_code_conflict" : "db_error",
      message:
        created.reason === "code_conflict"
          ? "Gagal generate order_code unik (5x retry). Coba lagi sebentar."
          : created.message ?? "Gagal menyimpan order.",
    };
  }
  const order = created.order;

  // Insert items dengan order_id + business_id (denormalized untuk RLS).
  const itemPayload = itemRows.map((row) => ({
    order_id: order.id,
    business_id: params.businessId,
    product_id: row.product_id,
    sku: row.sku,
    product_name: row.product_name,
    qty: row.qty,
    unit_price: row.unit_price,
    subtotal: row.subtotal,
  }));

  const { data: itemsData, error: itemsErr } = await supabase
    .from("order_items")
    .insert(itemPayload)
    .select("*");

  if (itemsErr) {
    console.error("[createOrderForBusiness] items insert error:", itemsErr.message);
    // Compensating delete: hapus order yg orphan biar gak nyangkut.
    const { error: cleanupErr } = await supabase
      .from("orders")
      .delete()
      .eq("id", order.id)
      .eq("business_id", params.businessId);
    if (cleanupErr) {
      console.error(
        "[createOrderForBusiness] cleanup delete error (orphan order!):",
        cleanupErr.message,
      );
    }
    return {
      ok: false,
      code: "db_error",
      message: itemsErr.message,
    };
  }

  return {
    ok: true,
    order: {
      ...order,
      items: (itemsData as OrderItem[]) ?? [],
    },
  };
}

/**
 * Helper: insert orders row dengan retry pada unique_violation
 * order_code. Setiap retry bump attemptOffset supaya generate code yang
 * berbeda.
 */
async function insertOrderWithRetry(
  supabase: SupabaseClient,
  payload: {
    businessId: string;
    customerName: string;
    fulfillmentMethod: string;
    address: string | null;
    notes: string | null;
    orderTotalAmount: number;
    createdBy: string | null;
    createdFromSource: OrderSource;
  },
): Promise<
  | { ok: true; order: Order }
  | { ok: false; reason: "code_conflict" | "other"; message?: string }
> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const orderCode = await generateOrderCode(payload.businessId, attempt);

    const { data, error } = await supabase
      .from("orders")
      .insert({
        business_id: payload.businessId,
        order_code: orderCode,
        customer_name: payload.customerName,
        fulfillment_method: payload.fulfillmentMethod,
        address: payload.address,
        notes: payload.notes,
        order_total_amount: payload.orderTotalAmount,
        // payment_amount default 1 di DB; biar Phase 3 yang ubah.
        created_by: payload.createdBy,
        created_from_source: payload.createdFromSource,
      })
      .select("*")
      .single();

    if (!error) {
      return { ok: true, order: data as Order };
    }

    // 23505 = unique_violation (postgres). Most likely on order_code.
    if (error.code === "23505") {
      console.warn(
        `[insertOrderWithRetry] order_code conflict on "${orderCode}", attempt ${attempt + 1}`,
      );
      continue;
    }
    console.error("[insertOrderWithRetry] insert error:", error.message);
    return { ok: false, reason: "other", message: error.message };
  }

  return { ok: false, reason: "code_conflict" };
}

/**
 * Dedup items by SKU: kalau client kirim 2 item dengan SKU sama,
 * gabungkan jadi 1 dengan qty di-sum. Bikin DB lebih rapih + customer
 * nampak lebih wajar di invoice.
 */
function dedupeItemsBySku(
  items: ReadonlyArray<{ sku: string; qty: number }>,
): Array<{ sku: string; qty: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.sku.trim();
    map.set(key, (map.get(key) ?? 0) + item.qty);
  }
  return Array.from(map.entries()).map(([sku, qty]) => ({ sku, qty }));
}

// =====================================================================
// Update order (status + minimal info)
// =====================================================================

const orderStatusEnum = z.enum([
  "menunggu_pembayaran",
  "pembayaran_berhasil",
  "diproses",
  "siap_diambil",
  "selesai",
  "dibatalkan",
]);

const paymentStatusEnum = z.enum(["pending", "paid", "failed", "refunded"]);

export const updateOrderInputSchema = z
  .object({
    order_status: orderStatusEnum.optional(),
    payment_status: paymentStatusEnum.optional(),
    customer_name: z.string().trim().min(1).max(120).optional(),
    fulfillment_method: z.string().trim().min(1).max(60).optional(),
    address: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    notes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .strict();

export type UpdateOrderInput = z.infer<typeof updateOrderInputSchema>;

export type UpdateOrderResult =
  | { ok: true; order: Order }
  | {
      ok: false;
      code: "validation_failed" | "not_found" | "db_error";
      message: string;
      fieldErrors?: Record<string, string>;
    };

/**
 * Update order field-field tertentu. Tidak boleh ubah:
 * - id, business_id, order_code, order_total_amount, items
 * - payment_amount/provider/reference (Phase 3)
 * - timestamps
 *
 * Tipikal pakai: update status (menunggu → pembayaran_berhasil → diproses ...)
 * atau koreksi minor info (typo nama customer).
 */
export async function updateOrderForBusiness(params: {
  businessId: string;
  id: string;
  rawInput: unknown;
}): Promise<UpdateOrderResult> {
  const parsed = updateOrderInputSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? String(issue.path[0]) : "";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      code: "validation_failed",
      message: "Validasi input gagal.",
      fieldErrors,
    };
  }
  const input = parsed.data;

  // Reject empty patch.
  const updatePayload = stripUndefined(input);
  if (Object.keys(updatePayload).length === 0) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Tidak ada field yang akan di-update.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", params.id)
    .eq("business_id", params.businessId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        ok: false,
        code: "not_found",
        message: "Order tidak ditemukan.",
      };
    }
    console.error("[updateOrderForBusiness] supabase error:", error.message);
    return {
      ok: false,
      code: "db_error",
      message: error.message,
    };
  }

  return { ok: true, order: data as Order };
}

/**
 * Update khusus status (helper untuk "Quick Action" button).
 * Wrapper di atas updateOrderForBusiness yang cuma kirim order_status.
 */
export async function updateOrderStatusForBusiness(params: {
  businessId: string;
  id: string;
  newStatus: OrderStatus;
  /**
   * Opsional: kalau ada, payment_status juga di-update bersamaan.
   * Pakai untuk Quick Action "Tandai sudah bayar" yang sekaligus set
   * order_status='pembayaran_berhasil' + payment_status='paid'.
   */
  alsoPaymentStatus?: PaymentStatus;
}): Promise<UpdateOrderResult> {
  const rawInput: Record<string, OrderStatus | PaymentStatus> = {
    order_status: params.newStatus,
  };
  if (params.alsoPaymentStatus) {
    rawInput.payment_status = params.alsoPaymentStatus;
  }
  return updateOrderForBusiness({
    businessId: params.businessId,
    id: params.id,
    rawInput,
  });
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}
