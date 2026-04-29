"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentBusinessId } from "@/lib/finance/business";
import { createClient } from "@/lib/supabase/server";

const stockStatusSchema = z.enum(
  ["ready", "habis", "terbatas", "preorder"],
  {
    message: "Status stok tidak valid.",
  },
);

const baseSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, { message: "SKU wajib diisi." })
    .max(32, { message: "SKU maksimal 32 karakter." })
    // SKU biasanya alfanumerik + dash/underscore. Hindari spasi/special
    // char yang bisa bikin URL routing bermasalah nanti.
    .regex(/^[A-Za-z0-9_-]+$/, {
      message: "SKU hanya boleh huruf, angka, dash, underscore.",
    }),
  name: z
    .string()
    .trim()
    .min(1, { message: "Nama produk wajib diisi." })
    .max(120, { message: "Nama produk maksimal 120 karakter." }),
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
  stock_status: stockStatusSchema.default("ready"),
  is_active: z.boolean().default(true),
});

const updateSchema = baseSchema.partial().extend({
  // SKU immutable setelah create. Field ini sengaja di-omit dari update.
  sku: z.never().optional(),
});

export type ProductFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<
      "sku" | "name" | "category" | "price" | "stock_status" | "is_active",
      string
    >
  >;
};

const initialState: ProductFormState = { ok: false };

function parsePrice(raw: FormDataEntryValue | null): number {
  if (raw === null || raw === undefined) return Number.NaN;
  const cleaned = String(raw).replace(/[^0-9-]/g, "");
  return Number(cleaned);
}

function parseBool(raw: FormDataEntryValue | null, defaultVal: boolean): boolean {
  if (raw === null || raw === undefined) return defaultVal;
  const s = String(raw).toLowerCase();
  if (s === "true" || s === "1" || s === "on") return true;
  if (s === "false" || s === "0" || s === "off") return false;
  return defaultVal;
}

function parseCreatePayload(formData: FormData) {
  return baseSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    category: formData.get("category"),
    price: parsePrice(formData.get("price")),
    stock_status: formData.get("stock_status") || "ready",
    is_active: parseBool(formData.get("is_active"), true),
  });
}

/**
 * Convert Zod issues ke fieldErrors map. Caller passes `error.issues`
 * langsung supaya bebas dari versi-spesifik Zod type internals.
 * Hanya field yang ada di ProductFormState.fieldErrors yang ke-include.
 */
function fieldErrorsFromIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): ProductFormState["fieldErrors"] {
  const fe: ProductFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof NonNullable<
      ProductFormState["fieldErrors"]
    >;
    if (typeof key === "string" && !fe[key]) {
      fe[key] = issue.message;
    }
  }
  return fe;
}

/**
 * Create produk baru. Validasi:
 * - SKU unique per business (DB constraint + soft-check di sini untuk
 *   pesan error yang lebih jelas).
 * - Auth via session (RLS otomatis apply business_id check).
 */
export async function createProductAction(
  _prev: ProductFormState = initialState,
  formData: FormData,
): Promise<ProductFormState> {
  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const parsed = parseCreatePayload(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    business_id: businessId,
    sku: parsed.data.sku,
    name: parsed.data.name,
    category: parsed.data.category,
    price: parsed.data.price,
    stock_status: parsed.data.stock_status,
    is_active: parsed.data.is_active,
  });

  if (error) {
    // 23505 = unique_violation di Postgres
    if (error.code === "23505") {
      return {
        ok: false,
        fieldErrors: { sku: `SKU "${parsed.data.sku}" sudah dipakai produk lain.` },
      };
    }
    console.error("[createProductAction] supabase error:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/products");
  return { ok: true, message: "Produk berhasil ditambahkan." };
}

/**
 * Update produk existing. SKU TIDAK BISA diubah (immutable identifier).
 * Field selain SKU semuanya optional — hanya yang dikirim yang di-update
 * (partial update). Ini cocok untuk inline-edit: misal cuma toggle
 * is_active, gak perlu kirim semua field.
 */
export async function updateProductAction(
  _prev: ProductFormState = initialState,
  formData: FormData,
): Promise<ProductFormState> {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false, message: "ID produk tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  // Build partial payload — hanya field yang ada di FormData yang
  // di-include. Field yang tidak ada (mis. cuma update price) di-skip.
  const partial: Record<string, unknown> = {};
  if (formData.has("name")) partial.name = formData.get("name");
  if (formData.has("category")) partial.category = formData.get("category");
  if (formData.has("price")) partial.price = parsePrice(formData.get("price"));
  if (formData.has("stock_status")) partial.stock_status = formData.get("stock_status");
  if (formData.has("is_active")) partial.is_active = parseBool(formData.get("is_active"), true);

  const parsed = updateSchema
    .omit({ sku: true })
    .safeParse(partial);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
    };
  }

  // Kalau gak ada field valid yang ke-update, gak perlu hit DB.
  if (Object.keys(parsed.data).length === 0) {
    return { ok: true, message: "Tidak ada perubahan." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[updateProductAction] supabase error:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/products");
  return { ok: true, message: "Produk berhasil diperbarui." };
}

/**
 * Soft delete produk: set deleted_at = now(). Tidak menghapus baris
 * fisik supaya order historis (Phase 2) yang reference produk ini
 * tetap punya nama + harga sebagai snapshot.
 */
export async function deleteProductAction(formData: FormData) {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false as const, message: "ID produk tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false as const, message: "Akun belum terhubung ke bisnis." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[deleteProductAction] supabase error:", error.message);
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/products");
  return { ok: true as const };
}

/**
 * Toggle is_active — convenience action untuk row dropdown.
 * Memanggil updateProductAction dengan field tunggal.
 */
export async function toggleProductActiveAction(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const id = formData.get("id");
  const nextActive = parseBool(formData.get("is_active"), true);
  if (!id || typeof id !== "string") {
    return { ok: false, message: "ID produk tidak valid." };
  }

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    return { ok: false, message: "Akun belum terhubung ke bisnis." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: nextActive })
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[toggleProductActiveAction] supabase error:", error.message);
    return { ok: false, message: error.message };
  }

  revalidatePath("/products");
  return { ok: true };
}
