/**
 * Helper untuk preset periode laporan. Semua tanggal pakai zona waktu
 * Asia/Jakarta dan format `YYYY-MM-DD`.
 */
import {
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

import { todayJakarta } from "@/lib/finance/format";

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this-month"
  | "last-month"
  | "custom";

export interface ResolvedPeriod {
  preset: PeriodPreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  label: string;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tentukan periode aktif berdasarkan searchParams. Kalau preset valid
 * dipakai, kalau tidak fallback ke `7d`. `custom` berlaku jika `from`
 * dan `to` keduanya valid YYYY-MM-DD.
 */
export function resolvePeriod(params: {
  preset?: string;
  from?: string;
  to?: string;
}): ResolvedPeriod {
  const today = todayJakarta();
  const todayDate = parseISO(today);

  const customFromValid = params.from && ISO_RE.test(params.from);
  const customToValid = params.to && ISO_RE.test(params.to);

  // Custom range dipakai jika:
  // - preset eksplisit "custom" + minimal salah satu dari from/to,
  //   atau
  // - tidak ada preset tapi from+to valid.
  if (
    (params.preset === "custom" && (customFromValid || customToValid)) ||
    (!params.preset && customFromValid && customToValid)
  ) {
    const from = customFromValid ? params.from! : today;
    const to = customToValid ? params.to! : today;
    // Kalau urutan kebalik, koreksi.
    const [a, b] = from <= to ? [from, to] : [to, from];
    return {
      preset: "custom",
      from: a,
      to: b,
      label: a === b ? a : `${a} – ${b}`,
    };
  }

  switch (params.preset) {
    case "today":
      return { preset: "today", from: today, to: today, label: "Hari ini" };
    case "yesterday": {
      const y = format(subDays(todayDate, 1), "yyyy-MM-dd");
      return { preset: "yesterday", from: y, to: y, label: "Kemarin" };
    }
    case "30d": {
      const from = format(subDays(todayDate, 29), "yyyy-MM-dd");
      return { preset: "30d", from, to: today, label: "30 hari terakhir" };
    }
    case "this-month": {
      const from = format(startOfMonth(todayDate), "yyyy-MM-dd");
      return {
        preset: "this-month",
        from,
        to: today,
        label: "Bulan ini",
      };
    }
    case "last-month": {
      const lastMonth = subMonths(todayDate, 1);
      const from = format(startOfMonth(lastMonth), "yyyy-MM-dd");
      const to = format(endOfMonth(lastMonth), "yyyy-MM-dd");
      return { preset: "last-month", from, to, label: "Bulan lalu" };
    }
    case "7d":
    default: {
      const from = format(subDays(todayDate, 6), "yyyy-MM-dd");
      return {
        preset: "7d",
        from,
        to: today,
        label: "7 hari terakhir",
      };
    }
  }
}

/**
 * Hitung jumlah hari (inclusive) antara dua tanggal YYYY-MM-DD.
 */
export function dayCountInclusive(from: string, to: string): number {
  const a = parseISO(from);
  const b = parseISO(to);
  const diff = Math.round(
    (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(1, diff + 1);
}
