import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft } from "lucide-react";

import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/orders/order-status-badge";
import { OrderStatusActions } from "@/components/orders/order-status-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { formatRupiah } from "@/lib/finance/format";
import { getOrderWithItems } from "@/lib/sorea/orders/queries";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(
  props: OrderDetailPageProps,
): Promise<Metadata> {
  const { id } = await props.params;
  return { title: `Pesanan ${id.slice(0, 8)}` };
}

export const dynamic = "force-dynamic";

export default async function OrderDetailPage(props: OrderDetailPageProps) {
  const { id } = await props.params;

  const businessId = await getCurrentBusinessId();
  if (!businessId) {
    notFound();
  }

  const order = await getOrderWithItems(businessId, id);
  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Pesanan
        </Link>
        <ChevronLeft className="h-3 w-3 rotate-180 text-muted-foreground" />
        <span className="font-mono text-xs tabular-nums">
          {order.order_code}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Pesanan {order.order_code}
        </h1>
        <p className="text-sm text-muted-foreground">
          Dibuat {formatDateTime(order.created_at)}
          {order.created_by ? ` · oleh ${order.created_by}` : ""}
          {order.created_from_source !== "dashboard"
            ? ` · sumber ${order.created_from_source}`
            : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Customer info + Items */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer & Fulfillment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Nama" value={order.customer_name} />
              <InfoRow label="Metode" value={order.fulfillment_method} />
              {order.address && (
                <InfoRow label="Alamat" value={order.address} multiline />
              )}
              {order.notes && (
                <InfoRow label="Catatan" value={order.notes} multiline />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Item Pesanan</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">SKU</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead className="w-16 text-center">Qty</TableHead>
                    <TableHead className="w-32 text-right">Harga</TableHead>
                    <TableHead className="w-32 text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {it.sku}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {it.product_name}
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {it.qty}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatRupiah(it.unit_price)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatRupiah(it.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="text-right text-base font-bold tabular-nums">
                      {formatRupiah(order.order_total_amount)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Status + actions + meta */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Status order</p>
                <div>
                  <OrderStatusBadge status={order.order_status} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Status bayar</p>
                <div>
                  <PaymentStatusBadge status={order.payment_status} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Update Status</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderStatusActions
                orderId={order.id}
                currentStatus={order.order_status}
                currentPaymentStatus={order.payment_status}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow
                label="Total order"
                value={formatRupiah(order.order_total_amount)}
              />
              <InfoRow
                label="Nominal bayar"
                value={
                  order.payment_amount === 1
                    ? `${formatRupiah(order.payment_amount)} (demo)`
                    : formatRupiah(order.payment_amount)
                }
              />
              {order.payment_provider && (
                <InfoRow label="Provider" value={order.payment_provider} />
              )}
              {order.payment_reference && (
                <InfoRow label="Ref" value={order.payment_reference} />
              )}
              {!order.payment_provider && (
                <p className="text-xs italic text-muted-foreground">
                  Payment gateway aktif di Phase 3.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          multiline ? "whitespace-pre-line text-sm" : "text-sm font-medium"
        }
      >
        {value}
      </p>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
