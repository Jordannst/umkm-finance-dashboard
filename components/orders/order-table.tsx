import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";

import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/orders/order-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/finance/format";
import type { Order } from "@/types/sorea";

interface OrderTableProps {
  orders: Order[];
  /**
   * Optional map order_id -> jumlah items, supaya kolom "Items" bisa
   * tampil dari satu kali query agregat (kalau gak dikirim, kolom kosong).
   */
  itemCounts?: Record<string, number>;
}

export function OrderTable({ orders, itemCounts }: OrderTableProps) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Belum ada pesanan"
        description="Pesanan baru muncul di sini setelah customer order via Liana atau API."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Kode</TableHead>
            <TableHead className="hidden md:table-cell w-40">Tanggal</TableHead>
            <TableHead>Customer & Fulfillment</TableHead>
            <TableHead className="hidden sm:table-cell w-20 text-center">
              Item
            </TableHead>
            <TableHead className="text-right w-32">Total</TableHead>
            <TableHead className="w-44">Status</TableHead>
            <TableHead className="w-8" aria-label="Detail" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const count = itemCounts?.[o.id];
            return (
              <TableRow
                key={o.id}
                className="cursor-pointer hover:bg-muted/30"
              >
                <TableCell className="font-mono text-xs tabular-nums">
                  <Link
                    href={`/orders/${o.id}`}
                    className="block"
                    aria-label={`Detail order ${o.order_code}`}
                  >
                    {o.order_code}
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm tabular-nums text-muted-foreground">
                  {formatDateTime(o.created_at)}
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium leading-tight">
                      {o.customer_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.fulfillment_method}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center text-sm tabular-nums">
                  {count !== undefined ? count : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm font-medium">
                  {formatRupiah(o.order_total_amount)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <OrderStatusBadge status={o.order_status} />
                    <PaymentStatusBadge status={o.payment_status} />
                  </div>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/orders/${o.id}`}
                    className="inline-flex items-center text-muted-foreground"
                    aria-label="Detail order"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Format created_at jadi tanggal+jam ringkas Indonesia.
 * 2026-04-29T15:34:00Z → "29 Apr · 15:34"
 */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
