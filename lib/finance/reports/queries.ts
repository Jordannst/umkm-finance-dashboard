import "server-only";

import { addDays, format, parseISO } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import type { DailySeriesPoint, Transaction } from "@/types/finance";

export interface ReportSummary {
  total_income: number;
  total_expense: number;
  profit: number;
  transactions_count: number;
}

export interface CategoryBreakdownItem {
  category_id: string | null;
  category_name: string;
  type: "income" | "expense";
  amount: number;
  count: number;
  percentage: number;
}

/**
 * Ambil semua transaksi dalam periode (inclusive). Untuk laporan + export
 * cukup pakai 1 fetch lalu agregasi di JS — periode laporan biasanya pendek
 * (≤ 90 hari), jadi performa dan kompleksitas masih wajar.
 *
 * Type `receivable_payment` dianggap pemasukan (income) untuk perhitungan.
 */
async function fetchTransactionsInRange(
  businessId: string,
  from: string,
  to: string,
): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[fetchTransactionsInRange]:", error.message);
    return [];
  }
  return (data as Transaction[]) ?? [];
}

/**
 * Ringkasan summary untuk periode.
 */
export async function getReportSummary(
  businessId: string,
  from: string,
  to: string,
): Promise<ReportSummary> {
  const txs = await fetchTransactionsInRange(businessId, from, to);

  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    const amt = Number(tx.amount);
    if (tx.type === "expense") {
      expense += amt;
    } else {
      // income atau receivable_payment
      income += amt;
    }
  }

  return {
    total_income: income,
    total_expense: expense,
    profit: income - expense,
    transactions_count: txs.length,
  };
}

/**
 * Time series harian untuk chart trend. Hari kosong di-padding dengan
 * income=0, expense=0 supaya chart tidak skip tanggal.
 */
export async function getReportSeries(
  businessId: string,
  from: string,
  to: string,
): Promise<DailySeriesPoint[]> {
  const txs = await fetchTransactionsInRange(businessId, from, to);

  const map = new Map<string, { income: number; expense: number }>();
  for (const tx of txs) {
    const key = tx.transaction_date;
    const acc = map.get(key) ?? { income: 0, expense: 0 };
    const amt = Number(tx.amount);
    if (tx.type === "expense") acc.expense += amt;
    else acc.income += amt;
    map.set(key, acc);
  }

  // Pad semua hari dalam range supaya chart kontinu
  const result: DailySeriesPoint[] = [];
  const startDate = parseISO(from);
  const endDate = parseISO(to);
  let cursor = startDate;
  while (cursor.getTime() <= endDate.getTime()) {
    const key = format(cursor, "yyyy-MM-dd");
    const acc = map.get(key) ?? { income: 0, expense: 0 };
    result.push({ date: key, income: acc.income, expense: acc.expense });
    cursor = addDays(cursor, 1);
  }
  return result;
}

/**
 * Breakdown per kategori untuk satu jenis (income atau expense). Sortir DESC
 * by amount. `category_id = null` digabungkan ke "Tanpa kategori".
 */
export async function getCategoryBreakdown(
  businessId: string,
  from: string,
  to: string,
  type: "income" | "expense",
): Promise<CategoryBreakdownItem[]> {
  const txs = await fetchTransactionsInRange(businessId, from, to);

  // Filter sesuai type — income mencakup juga receivable_payment.
  const filtered = txs.filter((tx) => {
    if (type === "expense") return tx.type === "expense";
    return tx.type === "income" || tx.type === "receivable_payment";
  });

  const map = new Map<
    string,
    { id: string | null; name: string; amount: number; count: number }
  >();
  for (const tx of filtered) {
    const key = tx.category_id ?? "__none__";
    const existing = map.get(key);
    const amt = Number(tx.amount);
    if (existing) {
      existing.amount += amt;
      existing.count += 1;
    } else {
      map.set(key, {
        id: tx.category_id,
        name: tx.category_name ?? "Tanpa kategori",
        amount: amt,
        count: 1,
      });
    }
  }

  const total = Array.from(map.values()).reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  return Array.from(map.values())
    .map<CategoryBreakdownItem>((item) => ({
      category_id: item.id,
      category_name: item.name,
      type,
      amount: item.amount,
      count: item.count,
      percentage: total === 0 ? 0 : (item.amount / total) * 100,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Daftar transaksi dalam periode untuk diekspor CSV.
 */
export async function getReportTransactions(
  businessId: string,
  from: string,
  to: string,
): Promise<Transaction[]> {
  return fetchTransactionsInRange(businessId, from, to);
}
