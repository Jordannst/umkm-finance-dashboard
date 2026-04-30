import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderWithItems,
  PaymentStatus,
} from "@/types/sorea";

export interface OrderListFilters {
  /** Filter by order_status */
  status?: OrderStatus | null;
  /** Filter by payment_status */
  paymentStatus?: PaymentStatus | null;
  /** Date range pada created_at (YYYY-MM-DD inclusive). */
  from?: string | null;
  to?: string | null;
  /** Search di customer_name OR order_code (case-insensitive). */
  search?: string | null;
  limit?: number;
}

/**
 * List orders sesuai filter, sortir terbaru duluan. Soft-deleted
 * (deleted_at IS NOT NULL) selalu disembunyikan.
 *
 * Tidak include items — pakai getOrderWithItems() untuk detail view.
 */
export async function listOrders(
  businessId: string,
  filters: OrderListFilters = {},
  client?: SupabaseClient,
): Promise<Order[]> {
  const supabase = client ?? (await createClient());
  let query = supabase
    .from("orders")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.status) {
    query = query.eq("order_status", filters.status);
  }
  if (filters.paymentStatus) {
    query = query.eq("payment_status", filters.paymentStatus);
  }
  if (filters.from) {
    // Inclusive: created_at >= start of day in UTC. Untuk sederhana,
    // kita filter pakai date-only comparison. Bisa improve nanti dengan
    // timezone-aware ranges.
    query = query.gte("created_at", `${filters.from}T00:00:00`);
  }
  if (filters.to) {
    query = query.lte("created_at", `${filters.to}T23:59:59`);
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%_]/g, "");
    query = query.or(
      `customer_name.ilike.%${term}%,order_code.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[listOrders] supabase error:", error.message);
    return [];
  }
  return (data as Order[]) ?? [];
}

/**
 * Ambil 1 order beserta items untuk detail page.
 * Return null kalau tidak ditemukan / soft-deleted / RLS reject.
 */
export async function getOrderWithItems(
  businessId: string,
  id: string,
  client?: SupabaseClient,
): Promise<OrderWithItems | null> {
  const supabase = client ?? (await createClient());

  // Two queries in parallel untuk hemat RTT.
  const [orderRes, itemsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("business_id", businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("*")
      .eq("business_id", businessId)
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (orderRes.error) {
    console.error(
      "[getOrderWithItems] orders supabase error:",
      orderRes.error.message,
    );
    return null;
  }
  if (!orderRes.data) return null;

  if (itemsRes.error) {
    console.error(
      "[getOrderWithItems] order_items supabase error:",
      itemsRes.error.message,
    );
    return { ...(orderRes.data as Order), items: [] };
  }

  return {
    ...(orderRes.data as Order),
    items: (itemsRes.data as OrderItem[]) ?? [],
  };
}

/**
 * Hitung jumlah order untuk hari ini di business tertentu, dipakai
 * untuk generate order_code (`ORD-YYYYMMDD-NNN`).
 *
 * Returned count adalah inclusive (existing orders). Caller harus
 * +1 untuk dapat sequence number berikutnya, +attempt untuk retry
 * pada race conflict.
 */
export async function countOrdersForToday(
  businessId: string,
  todayPrefix: string, // mis. "ORD-20260429-"
  client?: SupabaseClient,
): Promise<number> {
  const supabase = client ?? (await createClient());
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .like("order_code", `${todayPrefix}%`);

  if (error) {
    console.error("[countOrdersForToday] supabase error:", error.message);
    return 0;
  }
  return count ?? 0;
}
