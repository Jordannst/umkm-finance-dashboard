import { z } from "zod";

import { apiError, apiOk, zodIssuesToFieldErrors } from "@/lib/api/responses";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { listProducts } from "@/lib/sorea/products/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/products
 *
 * List produk untuk business yang sedang login. Filter via query string:
 *   ?active=true             — hanya is_active=true (untuk customer view)
 *   ?category=Coffee         — exact match category
 *   ?search=kopi             — case-insensitive name OR sku contains
 *   ?stock_status=ready      — filter by stock_status
 *   ?limit=N                 — default 200
 *
 * Response: { ok: true, data: { products: Product[] } }
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
  const products = await listProducts(businessId, {
    activeOnly: url.searchParams.get("active") === "true",
    category: url.searchParams.get("category"),
    search: url.searchParams.get("search"),
    stockStatus: parseStockStatus(url.searchParams.get("stock_status")),
    limit: parseLimit(url.searchParams.get("limit")),
  });

  return apiOk({ products });
}

/**
 * POST /api/products
 *
 * Create produk baru. Body JSON sesuai createBodySchema. Auth via
 * Supabase session, RLS guarantee scope per business.
 *
 * Response sukses: { ok: true, data: { product: Product } } status 201
 * Response error : { ok: false, error: { code, message, fieldErrors? } }
 *   - 400 validation_failed
 *   - 409 sku_conflict (SKU sudah dipakai)
 *   - 412 no_business
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

  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      "validation_failed",
      "Validasi gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      business_id: businessId,
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category,
      price: parsed.data.price,
      stock_status: parsed.data.stock_status,
      is_active: parsed.data.is_active,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "sku_conflict",
        `SKU "${parsed.data.sku}" sudah dipakai produk lain.`,
        409,
        { sku: "SKU sudah dipakai." },
      );
    }
    console.error("[api/products POST] supabase error:", error.message);
    return apiError("db_error", error.message, 500);
  }

  return apiOk({ product: data }, 201);
}

// ===== Schemas =====

const stockStatusSchema = z.enum(
  ["ready", "habis", "terbatas", "preorder"],
  {
    message: "Status stok tidak valid.",
  },
);

const createBodySchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, { message: "SKU wajib diisi." })
    .max(32, { message: "SKU maksimal 32 karakter." })
    .regex(/^[A-Za-z0-9_-]+$/, {
      message: "SKU hanya boleh huruf, angka, dash, underscore.",
    }),
  name: z
    .string()
    .trim()
    .min(1, { message: "Nama wajib diisi." })
    .max(120, { message: "Nama maksimal 120 karakter." }),
  category: z
    .string()
    .trim()
    .min(1, { message: "Kategori wajib diisi." })
    .max(60, { message: "Kategori maksimal 60 karakter." }),
  price: z
    .number({ message: "Harga harus angka." })
    .int({ message: "Harga harus bilangan bulat (rupiah utuh)." })
    .min(0, { message: "Harga tidak boleh negatif." })
    .max(100_000_000, { message: "Harga terlalu besar." }),
  stock_status: stockStatusSchema.optional().default("ready"),
  is_active: z.boolean().optional().default(true),
});

// ===== Helpers =====

function parseStockStatus(
  raw: string | null,
): "ready" | "habis" | "terbatas" | "preorder" | null {
  if (!raw) return null;
  if (raw === "ready" || raw === "habis" || raw === "terbatas" || raw === "preorder") {
    return raw;
  }
  return null;
}

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), 1000);
}
