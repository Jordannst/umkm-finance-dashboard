/**
 * Tipe-tipe domain SOREA UMKM operasional.
 * Terpisah dari `types/finance.ts` karena scope berbeda:
 *
 * - finance.ts → transaksi, piutang, kategori (bookkeeping)
 * - sorea.ts   → produk, order, payment (operational catalog)
 *
 * Phase 1 baru ada Product. Phase 2-4 akan menambah Order, OrderItem,
 * Payment, dll di file yang sama.
 */

export type ProductStockStatus =
  | "ready"
  | "habis"
  | "terbatas"
  | "preorder";

export interface Product {
  id: string;
  business_id: string;
  sku: string;
  name: string;
  category: string;
  /** Rupiah utuh (integer, tanpa desimal). */
  price: number;
  stock_status: ProductStockStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Label Indonesia untuk stock_status. Dipakai di UI. */
export const STOCK_STATUS_LABEL: Record<ProductStockStatus, string> = {
  ready: "Tersedia",
  habis: "Habis",
  terbatas: "Terbatas",
  preorder: "Pre-order",
};

/** Daftar stock status dalam urutan natural untuk dropdown UI. */
export const STOCK_STATUS_OPTIONS: ProductStockStatus[] = [
  "ready",
  "terbatas",
  "habis",
  "preorder",
];

// ============================================================
// Phase 2 — Order Management
// ============================================================

export type OrderStatus =
  | "menunggu_pembayaran"
  | "pembayaran_berhasil"
  | "diproses"
  | "siap_diambil"
  | "selesai"
  | "dibatalkan";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type OrderSource = "dashboard" | "chat" | "system";

export type PaymentProvider = "pakasir";

export interface Order {
  id: string;
  business_id: string;
  order_code: string;
  customer_name: string;
  fulfillment_method: string;
  address: string | null;
  notes: string | null;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  /** Total normal produk (jumlah subtotal items). */
  order_total_amount: number;
  /** Nominal yang di-charge ke payment gateway. Phase 3 demo = 1. */
  payment_amount: number;
  payment_provider: PaymentProvider | null;
  payment_reference: string | null;
  created_from_source: OrderSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  business_id: string;
  product_id: string | null;
  /** Snapshot dari product saat create. */
  sku: string;
  /** Snapshot. */
  product_name: string;
  qty: number;
  /** Snapshot dari products.price saat create. */
  unit_price: number;
  /** qty * unit_price (denormalized untuk simpler query). */
  subtotal: number;
  created_at: string;
}

/** Order dengan items embedded (untuk detail view). */
export interface OrderWithItems extends Order {
  items: OrderItem[];
}

/** Label Indonesia untuk order_status. Dipakai di UI badge. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  pembayaran_berhasil: "Sudah Dibayar",
  diproses: "Diproses",
  siap_diambil: "Siap Diambil",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

/** Daftar order_status dalam urutan lifecycle untuk dropdown UI. */
export const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  "menunggu_pembayaran",
  "pembayaran_berhasil",
  "diproses",
  "siap_diambil",
  "selesai",
  "dibatalkan",
];

/**
 * Lifecycle next-state mapping untuk Quick Action button.
 * Saat status di kunci, action button akan transition ke value.
 *
 * `null` = no quick action (terminal state atau ambiguous).
 */
export const ORDER_STATUS_NEXT: Record<
  OrderStatus,
  { next: OrderStatus; label: string } | null
> = {
  menunggu_pembayaran: {
    next: "pembayaran_berhasil",
    label: "Tandai sudah bayar",
  },
  pembayaran_berhasil: { next: "diproses", label: "Mulai proses" },
  diproses: { next: "siap_diambil", label: "Siap diambil" },
  siap_diambil: { next: "selesai", label: "Selesai" },
  selesai: null,
  dibatalkan: null,
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Belum Dibayar",
  paid: "Lunas",
  failed: "Gagal",
  refunded: "Dikembalikan",
};

export const FULFILLMENT_METHOD_OPTIONS = [
  "Ambil di tempat",
  "Antar",
] as const;
