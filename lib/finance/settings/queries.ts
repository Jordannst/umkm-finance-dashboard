import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Category, CategoryType } from "@/types/finance";

export interface CategoriesGrouped {
  income: Category[];
  expense: Category[];
  receivable: Category[];
}

/**
 * Ambil semua kategori untuk business dan group berdasarkan type. Sortir
 * by name (A-Z). RLS tetap berlaku — user hanya lihat kategori bisnisnya.
 */
export async function getCategoriesGrouped(
  businessId: string,
): Promise<CategoriesGrouped> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (error) {
    console.error("[getCategoriesGrouped]:", error.message);
    return { income: [], expense: [], receivable: [] };
  }

  const all = (data as Category[]) ?? [];
  return {
    income: all.filter((c) => c.type === "income"),
    expense: all.filter((c) => c.type === "expense"),
    receivable: all.filter((c) => c.type === "receivable"),
  };
}

/**
 * Hitung jumlah transaksi yang masih pakai category_id ini (kecuali
 * deleted). Dipakai sebagai info di UI sebelum delete kategori.
 */
export async function countCategoryUsage(
  businessId: string,
  categoryId: string,
  type: CategoryType,
): Promise<number> {
  const supabase = await createClient();
  const table = type === "receivable" ? "receivables" : "transactions";
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("category_id", categoryId)
    .is("deleted_at", null);

  if (error) {
    console.error("[countCategoryUsage]:", error.message);
    return 0;
  }
  return count ?? 0;
}
