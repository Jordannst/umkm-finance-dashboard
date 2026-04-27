import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Receivable,
  ReceivablePayment,
  ReceivableStatus,
} from "@/types/finance";

export interface ReceivableFilters {
  status?: ReceivableStatus | "all" | "active" | null;
  search?: string | null;
  limit?: number;
}

/**
 * Daftar piutang sesuai filter. Default: semua status kecuali deleted.
 * `status='active'` = unpaid OR partial.
 * Sortir: due_date ASC (yang paling mendesak duluan, NULL terakhir),
 * lalu created_at DESC.
 */
export async function listReceivables(
  businessId: string,
  filters: ReceivableFilters = {},
): Promise<Receivable[]> {
  const supabase = await createClient();
  let query = supabase
    .from("receivables")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null);

  if (filters.status === "active") {
    query = query.in("status", ["unpaid", "partial"]);
  } else if (
    filters.status === "unpaid" ||
    filters.status === "partial" ||
    filters.status === "paid"
  ) {
    query = query.eq("status", filters.status);
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%_]/g, "");
    query = query.or(
      `customer_name.ilike.%${term}%,note.ilike.%${term}%`,
    );
  }

  query = query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  const { data, error } = await query;
  if (error) {
    console.error("[listReceivables] supabase error:", error.message);
    return [];
  }
  return (data as Receivable[]) ?? [];
}

/**
 * Ambil satu piutang (untuk pre-fill form edit).
 */
export async function getReceivableById(
  businessId: string,
  id: string,
): Promise<Receivable | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receivables")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[getReceivableById] supabase error:", error.message);
    return null;
  }
  return (data as Receivable | null) ?? null;
}

/**
 * Ambil daftar pembayaran untuk satu piutang.
 */
export async function getReceivablePayments(
  businessId: string,
  receivableId: string,
): Promise<ReceivablePayment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receivable_payments")
    .select("*")
    .eq("business_id", businessId)
    .eq("receivable_id", receivableId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getReceivablePayments] supabase error:", error.message);
    return [];
  }
  return (data as ReceivablePayment[]) ?? [];
}
