import { Badge } from "@/components/ui/badge";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrderStatus,
  type PaymentStatus,
} from "@/types/sorea";

const ORDER_VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  menunggu_pembayaran: "warning",
  pembayaran_berhasil: "secondary",
  diproses: "default",
  siap_diambil: "success",
  selesai: "success",
  dibatalkan: "destructive",
};

const PAYMENT_VARIANT: Record<
  PaymentStatus,
  "default" | "secondary" | "success" | "destructive" | "warning" | "outline"
> = {
  pending: "warning",
  paid: "success",
  failed: "destructive",
  refunded: "outline",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={ORDER_VARIANT[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant={PAYMENT_VARIANT[status]}>
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
