import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Category, Transaction, TransactionType } from "@/types/finance";

export interface TransactionFilters {
  from?: string | null; // YYYY-MM-DD
  to?: string | null; // YYYY-MM-DD
  type?: TransactionType | "all" | null;
  categoryId?: string | null;
  search?: string | null;
  limit?: number;
}

/**
 * Daftar transaksi sesuai filter, sortir terbaru duluan.
 * Soft-deleted (deleted_at IS NOT NULL) selalu disembunyikan.
 */
export async function listTransactions(
  businessId: string,
  filters: TransactionFilters = {},
): Promise<Transaction[]> {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.from) {
    query = query.gte("transaction_date", filters.from);
  }
  if (filters.to) {
    query = query.lte("transaction_date", filters.to);
  }
  if (filters.type && filters.type !== "all") {
    query = query.eq("type", filters.type);
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%_]/g, "");
    query = query.or(
      `note.ilike.%${term}%,category_name.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[listTransactions] supabase error:", error.message);
    return [];
  }
  return (data as Transaction[]) ?? [];
}

/**
 * Ambil satu transaksi (untuk pre-fill form edit).
 */
export async function getTransactionById(
  businessId: string,
  id: string,
): Promise<Transaction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[getTransactionById] supabase error:", error.message);
    return null;
  }
  return (data as Transaction | null) ?? null;
}

/**
 * Daftar kategori per bisnis. Optional filter by `type` untuk dropdown
 * yang dinamis (income vs expense vs receivable).
 */
export async function getCategoriesForBusiness(
  businessId: string,
  type?: Category["type"] | null,
): Promise<Category[]> {
  const supabase = await createClient();
  let query = supabase
    .from("categories")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[getCategoriesForBusiness] supabase error:", error.message);
    return [];
  }
  return (data as Category[]) ?? [];
}
