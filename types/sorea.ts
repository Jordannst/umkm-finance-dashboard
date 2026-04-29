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
