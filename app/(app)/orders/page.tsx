import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { OrderTable } from "@/components/orders/order-table";
import { OrdersFilters } from "@/components/orders/orders-filters";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { listOrders } from "@/lib/sorea/orders/queries";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, PaymentStatus } from "@/types/sorea";

export const metadata: Metadata = {
  title: "Pesanan",
};

export const dynamic = "force-dynamic";

interface OrdersPageProps {
  searchParams: Promise<{
    status?: string;
    payment_status?: string;
    from?: string;
    to?: string;
    search?: string;
  }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const businessId = await getCurrentBusinessId();

  if (!businessId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Pesanan"
          description="Order operasional SOREA — list, status, dan update fulfillment."
        />
        <EmptyState
          icon={Building2}
          title="Belum ada bisnis terhubung"
          description="Pastikan migration dan seed Supabase sudah dijalankan."
        />
      </div>
    );
  }

  const sp = await searchParams;

  const orders = await listOrders(businessId, {
    status: parseOrderStatus(sp.status),
    paymentStatus: parsePaymentStatus(sp.payment_status),
    from: sp.from ?? null,
    to: sp.to ?? null,
    search: sp.search ?? null,
  });

  // Hitung jumlah items per order via 1x query agregat (group by order_id).
  // Lebih hemat round-trip daripada N+1 fetch detail.
  const itemCounts = await fetchItemCounts(
    businessId,
    orders.map((o) => o.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pesanan"
        description="Order operasional SOREA — masuk via Liana /pesan atau API. Klik baris untuk detail dan update status."
      />
      <OrdersFilters />
      <OrderTable orders={orders} itemCounts={itemCounts} />
    </div>
  );
}

/**
 * Bulk-fetch jumlah items per order. Pakai 1 query yang scoped ke
 * order_id list, lalu reduce di JS layer (Supabase Postgrest tidak
 * support GROUP BY directly tanpa RPC).
 *
 * Untuk volume order page (50 row default), jumlah item ~50-200 row,
 * cheap untuk fetch + reduce.
 */
async function fetchItemCounts(
  businessId: string,
  orderIds: string[],
): Promise<Record<string, number>> {
  if (orderIds.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("order_id, qty")
    .eq("business_id", businessId)
    .in("order_id", orderIds);

  if (error) {
    console.error("[fetchItemCounts] supabase error:", error.message);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { order_id: string; qty: number }[]) {
    counts[row.order_id] = (counts[row.order_id] ?? 0) + row.qty;
  }
  return counts;
}

function parseOrderStatus(raw: string | undefined): OrderStatus | null {
  const allowed: OrderStatus[] = [
    "menunggu_pembayaran",
    "pembayaran_berhasil",
    "diproses",
    "siap_diambil",
    "selesai",
    "dibatalkan",
  ];
  return raw && (allowed as string[]).includes(raw)
    ? (raw as OrderStatus)
    : null;
}

function parsePaymentStatus(raw: string | undefined): PaymentStatus | null {
  const allowed: PaymentStatus[] = ["pending", "paid", "failed", "refunded"];
  return raw && (allowed as string[]).includes(raw)
    ? (raw as PaymentStatus)
    : null;
}
