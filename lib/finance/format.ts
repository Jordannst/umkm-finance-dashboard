import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";

/**
 * Format angka jadi Rupiah, contoh: 120000 -> "Rp120.000".
 * Kalau angka tidak valid, return "Rp0".
 */
export function formatRupiah(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "Rp0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
    .format(n)
    .replace(/\s/g, "");
}

/**
 * Format angka tanpa simbol mata uang, contoh: 120000 -> "120.000".
 */
export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Parse string yang ditulis user (boleh pakai titik/koma) jadi number.
 * Contoh: "Rp120.000" -> 120000, "1,5" -> 1.5
 */
export function parseRupiahInput(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace(/[^0-9.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Format tanggal ISO/Date jadi string Indonesia: "27 Apr 2026"
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "d MMM yyyy", { locale: idLocale });
}

/**
 * Format tanggal lengkap, contoh: "Senin, 27 April 2026"
 */
export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "EEEE, d MMMM yyyy", { locale: idLocale });
}

/**
 * Format ke YYYY-MM-DD untuk kolom DATE Postgres.
 */
export function toIsoDate(value: Date | string): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "yyyy-MM-dd");
}

/**
 * Tanggal hari ini dalam zona waktu Asia/Jakarta sebagai YYYY-MM-DD.
 */
export function todayJakarta(): string {
  // Pakai Intl untuk dapat tanggal lokal, lalu ambil bagian YMD.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
