import "server-only";

import { addDays, format, parseISO, subDays } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/finance/format";
import type {
  DailySeriesPoint,
  FinanceSummary,
  Receivable,
  Transaction,
} from "@/types/finance";

/**
 * Hitung summary harian untuk dashboard overview.
 *
 * Aturan bisnis (lihat plan §10):
 * - total_pemasukan = sum(transactions.type IN ('income','receivable_payment'))
 *   pada `dateRef`, kecuali deleted_at IS NOT NULL
 * - total_pengeluaran = sum(transactions.type = 'expense') pada `dateRef`
 * - laba = total_pemasukan - total_pengeluaran
 * - piutang_aktif = sum(amount - paid_amount) untuk status IN ('unpaid','partial'),
 *   kecuali deleted_at IS NOT NULL
 */
export async function getDashboardSummary(
  businessId: string,
  dateRef: string = todayJakarta(),
): Promise<FinanceSummary> {
  const supabase = await createClient();

  const [{ data: txs, error: txError }, { data: rcs, error: rcError }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("type, amount")
        .eq("business_id", businessId)
        .eq("transaction_date", dateRef)
        .is("deleted_at", null),
      supabase
        .from("receivables")
        .select("amount, paid_amount")
        .eq("business_id", businessId)
        .in("status", ["unpaid", "partial"])
        .is("deleted_at", null),
    ]);

  if (txError) {
    console.error("[getDashboardSummary] transactions:", txError.message);
  }
  if (rcError) {
    console.error("[getDashboardSummary] receivables:", rcError.message);
  }

  let totalIncome = 0;
  let totalExpense = 0;
  for (const tx of txs ?? []) {
    const amount = Number(tx.amount);
    if (tx.type === "income" || tx.type === "receivable_payment") {
      totalIncome += amount;
    } else if (tx.type === "expense") {
      totalExpense += amount;
    }
  }

  let activeReceivables = 0;
  for (const r of rcs ?? []) {
    activeReceivables += Number(r.amount) - Number(r.paid_amount);
  }

  return {
    period: "today",
    start_date: dateRef,
    end_date: dateRef,
    total_income: totalIncome,
    total_expense: totalExpense,
    profit: totalIncome - totalExpense,
    active_receivables: activeReceivables,
  };
}

/**
 * Time series harian untuk grafik N hari terakhir (default 7).
 * Mengembalikan array yang sudah dipadatkan: tiap tanggal pasti ada,
 * angka 0 untuk hari tanpa transaksi.
 */
export async function getDailySeries(
  businessId: string,
  days: number = 7,
  endRef: string = todayJakarta(),
): Promise<DailySeriesPoint[]> {
  const supabase = await createClient();

  const endDate = parseISO(endRef);
  const startDate = subDays(endDate, days - 1);
  const startStr = format(startDate, "yyyy-MM-dd");

  const { data: txs, error } = await supabase
    .from("transactions")
    .select("type, amount, transaction_date")
    .eq("business_id", businessId)
    .gte("transaction_date", startStr)
    .lte("transaction_date", endRef)
    .is("deleted_at", null);

  if (error) {
    console.error("[getDailySeries] supabase error:", error.message);
  }

  const series: DailySeriesPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = format(addDays(startDate, i), "yyyy-MM-dd");
    series.push({ date: d, income: 0, expense: 0 });
  }

  const idx = new Map<string, number>(series.map((s, i) => [s.date, i]));

  for (const tx of txs ?? []) {
    const i = idx.get(tx.transaction_date as string);
    if (i === undefined) continue;
    const amount = Number(tx.amount);
    if (tx.type === "income" || tx.type === "receivable_payment") {
      series[i].income += amount;
    } else if (tx.type === "expense") {
      series[i].expense += amount;
    }
  }

  return series;
}

/**
 * Ambil N transaksi terakhir untuk widget "Transaksi Terbaru".
 * Sortir berdasarkan tanggal lalu created_at (untuk tiebreak).
 */
export async function getRecentTransactions(
  businessId: string,
  limit: number = 5,
): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getRecentTransactions] supabase error:", error.message);
    return [];
  }
  return (data as Transaction[]) ?? [];
}

/**
 * Ambil piutang aktif (unpaid / partial) terbaru untuk widget dashboard.
 */
export async function getActiveReceivables(
  businessId: string,
  limit: number = 5,
): Promise<Receivable[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receivables")
    .select("*")
    .eq("business_id", businessId)
    .in("status", ["unpaid", "partial"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getActiveReceivables] supabase error:", error.message);
    return [];
  }
  return (data as Receivable[]) ?? [];
}
