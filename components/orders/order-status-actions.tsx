"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_NEXT,
  ORDER_STATUS_OPTIONS,
  type OrderStatus,
  type PaymentStatus,
} from "@/types/sorea";

interface OrderStatusActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
  currentPaymentStatus: PaymentStatus;
}

/**
 * Quick Action button + free dropdown untuk update status order.
 *
 * - Quick Action: button utama untuk transition ke next-state common
 *   (lihat ORDER_STATUS_NEXT). Khusus untuk transition `menunggu_pembayaran
 *   → pembayaran_berhasil`, sekaligus update payment_status='paid'.
 * - Free dropdown: untuk override / cancel / koreksi state. Free karena
 *   admin perlu fleksibilitas (mis. customer batal di tengah jalan).
 */
export function OrderStatusActions({
  orderId,
  currentStatus,
  currentPaymentStatus,
}: OrderStatusActionsProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const next = ORDER_STATUS_NEXT[currentStatus];

  async function patchStatus(
    newStatus: OrderStatus,
    alsoPaymentPaid: boolean = false,
  ) {
    if (pending) return;
    setPending(true);
    try {
      const body: Record<string, OrderStatus | PaymentStatus> = {
        order_status: newStatus,
      };
      if (alsoPaymentPaid) {
        body.payment_status = "paid";
      }
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { order: { order_status: OrderStatus } } }
        | { ok: false; error?: { message?: string } }
        | null;
      if (!res.ok || !json?.ok) {
        const msg =
          (json && !json.ok && json.error?.message) ||
          "Gagal update status order.";
        toast.error(msg);
        return;
      }
      toast.success(
        `Status updated → ${ORDER_STATUS_LABEL[newStatus]}`,
      );
      // Refresh server component supaya data baru ke-render.
      router.refresh();
    } catch (err) {
      console.error("[OrderStatusActions] PATCH error:", err);
      toast.error("Tidak bisa menghubungi server. Periksa koneksi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Quick action button */}
      {next && (
        <Button
          onClick={() => {
            // Khusus transition "menunggu_pembayaran → pembayaran_berhasil",
            // juga set payment_status='paid' (UX: user nampak satu klik,
            // server update 2 field dalam 1 PATCH).
            const alsoPaid =
              currentStatus === "menunggu_pembayaran" &&
              next.next === "pembayaran_berhasil" &&
              currentPaymentStatus !== "paid";
            void patchStatus(next.next, alsoPaid);
          }}
          disabled={pending}
          className="sm:flex-1"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
          {next.label}
        </Button>
      )}

      {/* Free dropdown — untuk override (mis. cancel) atau roll-back */}
      <div
        className={cn(
          "flex items-center gap-2",
          next ? "sm:flex-1" : "w-full",
        )}
      >
        <Select
          value={currentStatus}
          onValueChange={(v) => void patchStatus(v as OrderStatus)}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
