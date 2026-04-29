import { z } from "zod";

import { apiError, apiOk, zodIssuesToFieldErrors } from "@/lib/api/responses";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { getProductById } from "@/lib/sorea/products/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/products/:id
 *
 * Single product fetch. 404 kalau tidak ada / soft-deleted.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return apiError("invalid_id", "ID produk tidak valid.", 400);
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return apiError(
      "no_business",
      "Akun belum terhubung ke bisnis manapun.",
      412,
    );
  }

  const product = await getProductById(businessId, id);
  if (!product) {
    return apiError("not_found", "Produk tidak ditemukan.", 404);
  }

  return apiOk({ product });
}

/**
 * PATCH /api/products/:id
 *
 * Partial update. SKU TIDAK BISA diubah (immutable identifier).
 * Field selain SKU semua optional. Yang gak dikirim, gak di-update.
 *
 * Response: { ok: true, data: { product: Product } }
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return apiError("invalid_id", "ID produk tidak valid.", 400);
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

  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      "validation_failed",
      "Validasi gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  // Reject empty patch (gak ada field valid yang dikirim).
  if (Object.keys(parsed.data).length === 0) {
    return apiError(
      "empty_patch",
      "Tidak ada field yang akan di-update.",
      400,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    // PGRST116 = "JSON object requested, multiple (or no) rows returned"
    // → row tidak ada / sudah soft-deleted / RLS reject.
    if (error.code === "PGRST116") {
      return apiError("not_found", "Produk tidak ditemukan.", 404);
    }
    console.error("[api/products/:id PATCH] supabase error:", error.message);
    return apiError("db_error", error.message, 500);
  }

  return apiOk({ product: data });
}

/**
 * DELETE /api/products/:id
 *
 * Soft delete: set deleted_at = now(). Row fisik tidak dihapus supaya
 * order historis (Phase 2) yang reference produk ini tetap punya
 * snapshot data.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) {
    return apiError("invalid_id", "ID produk tidak valid.", 400);
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return apiError(
      "no_business",
      "Akun belum terhubung ke bisnis manapun.",
      412,
    );
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[api/products/:id DELETE] supabase error:", error.message);
    return apiError("db_error", error.message, 500);
  }
  if ((count ?? 0) === 0) {
    return apiError("not_found", "Produk tidak ditemukan.", 404);
  }

  return apiOk({ deleted: true });
}

// ===== Schemas =====

const stockStatusSchema = z.enum(
  ["ready", "habis", "terbatas", "preorder"],
  {
    message: "Status stok tidak valid.",
  },
);

/**
 * Body PATCH — semua field optional. SKU sengaja tidak ada di sini.
 * Pakai .strict() supaya field tidak dikenal (mis. user iseng kirim
 * `sku` atau `business_id`) di-reject.
 */
const patchBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: "Nama wajib diisi." })
      .max(120, { message: "Nama maksimal 120 karakter." })
      .optional(),
    category: z
      .string()
      .trim()
      .min(1, { message: "Kategori wajib diisi." })
      .max(60, { message: "Kategori maksimal 60 karakter." })
      .optional(),
    price: z
      .number({ message: "Harga harus angka." })
      .int({ message: "Harga harus bilangan bulat (rupiah utuh)." })
      .min(0, { message: "Harga tidak boleh negatif." })
      .max(100_000_000, { message: "Harga terlalu besar." })
      .optional(),
    stock_status: stockStatusSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .strict();
