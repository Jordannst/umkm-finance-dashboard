import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Product, ProductStockStatus } from "@/types/sorea";

export interface ProductFilters {
  /** Hanya produk aktif. Default: tidak filter (admin lihat semua). */
  activeOnly?: boolean;
  /** Filter by category exact match. */
  category?: string | null;
  /** Search di nama atau SKU (case-insensitive). */
  search?: string | null;
  /** Filter by stock status. */
  stockStatus?: ProductStockStatus | null;
  limit?: number;
}

/**
 * Daftar produk sesuai filter. Soft-deleted (deleted_at IS NOT NULL)
 * selalu disembunyikan. Default order: SKU ascending (P001, P002, ...).
 */
export async function listProducts(
  businessId: string,
  filters: ProductFilters = {},
  client?: SupabaseClient,
): Promise<Product[]> {
  const supabase = client ?? (await createClient());
  let query = supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("sku", { ascending: true })
    .limit(filters.limit ?? 200);

  if (filters.activeOnly) {
    query = query.eq("is_active", true);
  }
  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.stockStatus) {
    query = query.eq("stock_status", filters.stockStatus);
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%_]/g, "");
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[listProducts] supabase error:", error.message);
    return [];
  }
  return (data as Product[]) ?? [];
}

/**
 * Ambil satu produk berdasarkan ID. Return null kalau tidak ada atau
 * sudah soft-deleted. Dipakai untuk pre-fill form edit + API single
 * fetch.
 */
export async function getProductById(
  businessId: string,
  id: string,
  client?: SupabaseClient,
): Promise<Product | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[getProductById] supabase error:", error.message);
    return null;
  }
  return (data as Product | null) ?? null;
}

/**
 * Ambil produk berdasarkan SKU. Dipakai untuk validation di create
 * (cek conflict) dan future Phase 2 saat order item resolve harga
 * dari SKU yang dikirim Liana.
 */
export async function getProductBySku(
  businessId: string,
  sku: string,
  client?: SupabaseClient,
): Promise<Product | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .eq("sku", sku)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[getProductBySku] supabase error:", error.message);
    return null;
  }
  return (data as Product | null) ?? null;
}

/**
 * List unique categories yang sedang dipakai produk aktif. Dipakai
 * untuk populate filter dropdown di catalog page.
 */
export async function listProductCategories(
  businessId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("category")
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (error) {
    console.error("[listProductCategories] supabase error:", error.message);
    return [];
  }
  const set = new Set<string>();
  for (const row of (data ?? []) as { category: string }[]) {
    if (row.category) set.add(row.category);
  }
  return Array.from(set).sort();
}
