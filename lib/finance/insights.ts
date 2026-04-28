import "server-only";

import { format, parseISO, subDays } from "date-fns";

import { formatRupiah, todayJakarta } from "@/lib/finance/format";
import { createClient } from "@/lib/supabase/server";

// =====================================================================
// Types
// =====================================================================

export type InsightSeverity = "success" | "warning" | "alert" | "info";

export type InsightIcon =
  | "trend-up"
  | "trend-down"
  | "alert-triangle"
  | "lightbulb"
  | "calendar-clock"
  | "wallet";

export interface DashboardInsight {
  id: string;
  severity: InsightSeverity;
  icon: InsightIcon;
  title: string;
  description: string;
  /**
   * Pre-filled prompt untuk AskLianaButton — sudah include angka konkret
   * supaya Liana bisa langsung kasih jawaban kontekstual tanpa tanya balik.
   */
  liana_prompt: string;
  /**
   * Importance score 0-100, dipakai untuk sort. Semakin tinggi semakin
   * prominent / muncul lebih dulu di UI.
   */
  score: number;
}

// =====================================================================
// Compute insights
// =====================================================================

/**
 * Hitung proactive insights untuk dashboard.
 *
 * Strategi: ambil data 14 hari (untuk perbandingan week-over-week) +
 * piutang overdue, lalu jalankan 4 rule:
 *
 *   1. Trend pengeluaran kategori (week-over-week, perubahan >= 20%)
 *   2. Piutang overdue > 14 hari (alert kalau ada)
 *   3. Anomali pemasukan hari ini vs avg 6 hari sebelumnya (>= 25%)
 *   4. Profit margin minggu ini (sehat / tipis / rugi)
 *
 * Return MAX 4 insights, sorted by score descending.
 */
export async function getDashboardInsights(
  businessId: string,
  todayRef: string = todayJakarta(),
): Promise<DashboardInsight[]> {
  const supabase = await createClient();
  const today = parseISO(todayRef);

  // Window definition (inclusive both ends, kecuali ada catatan):
  const last7Start = format(subDays(today, 6), "yyyy-MM-dd"); // 7 hari terakhir
  const prev7Start = format(subDays(today, 13), "yyyy-MM-dd"); // 7 hari sebelum itu
  const prev7End = format(subDays(today, 7), "yyyy-MM-dd");
  const overdueCutoff = format(subDays(today, 14), "yyyy-MM-dd");

  const [{ data: tx14d, error: txErr }, { data: overdueRc, error: rcErr }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("type, amount, category_name, transaction_date")
        .eq("business_id", businessId)
        .gte("transaction_date", prev7Start)
        .lte("transaction_date", todayRef)
        .is("deleted_at", null),
      supabase
        .from("receivables")
        .select(
          "id, customer_name, amount, paid_amount, due_date, created_at",
        )
        .eq("business_id", businessId)
        .in("status", ["unpaid", "partial"])
        .lte("due_date", overdueCutoff)
        .is("deleted_at", null)
        .order("due_date", { ascending: true })
        .limit(20),
    ]);

  if (txErr) console.error("[insights] tx14d:", txErr.message);
  if (rcErr) console.error("[insights] overdueRc:", rcErr.message);

  const insights: DashboardInsight[] = [];

  insights.push(...computeExpenseTrend(tx14d ?? [], { last7Start, prev7Start, prev7End, todayRef }));
  insights.push(...computeOverdueReceivables(overdueRc ?? []));
  insights.push(...computeIncomeAnomaly(tx14d ?? [], { last7Start, todayRef }));
  insights.push(...computeWeekMargin(tx14d ?? [], { last7Start, todayRef }));

  return insights.sort((a, b) => b.score - a.score).slice(0, 4);
}

// =====================================================================
// Rule 1: Expense category trend (week-over-week)
// =====================================================================

interface TxRow {
  type: string;
  amount: number | string;
  category_name: string | null;
  transaction_date: string;
}

interface DateWindow {
  last7Start: string;
  prev7Start?: string;
  prev7End?: string;
  todayRef: string;
}

function computeExpenseTrend(
  txs: TxRow[],
  window: DateWindow,
): DashboardInsight[] {
  if (!window.prev7Start || !window.prev7End) return [];

  const thisWeek = new Map<string, number>();
  const prevWeek = new Map<string, number>();

  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    const cat = tx.category_name ?? "Tanpa kategori";
    const amount = Number(tx.amount);
    const date = tx.transaction_date;
    if (date >= window.last7Start && date <= window.todayRef) {
      thisWeek.set(cat, (thisWeek.get(cat) ?? 0) + amount);
    } else if (date >= window.prev7Start && date <= window.prev7End) {
      prevWeek.set(cat, (prevWeek.get(cat) ?? 0) + amount);
    }
  }

  // Cari kategori dengan delta absolut + relatif paling signifikan.
  // Kalau prevAmt=0 (kategori baru muncul), wajib thisAmt >= 100k supaya
  // tidak jadi noise dari satu transaksi kecil.
  let best: {
    category: string;
    thisWeek: number;
    prevWeek: number;
    pctChange: number;
  } | null = null;

  for (const [cat, thisAmt] of thisWeek.entries()) {
    const prevAmt = prevWeek.get(cat) ?? 0;
    if (prevAmt === 0 && thisAmt < 100_000) continue;
    const pctChange =
      prevAmt === 0 ? 100 : ((thisAmt - prevAmt) / prevAmt) * 100;
    if (Math.abs(pctChange) < 20) continue;
    if (!best || Math.abs(pctChange) > Math.abs(best.pctChange)) {
      best = { category: cat, thisWeek: thisAmt, prevWeek: prevAmt, pctChange };
    }
  }

  if (!best) return [];

  const isUp = best.pctChange > 0;
  const pctRounded = Math.abs(Math.round(best.pctChange));
  const isNew = best.prevWeek === 0;

  return [
    {
      id: "expense-trend",
      severity: isUp ? "warning" : "success",
      icon: isUp ? "trend-up" : "trend-down",
      title: `Pengeluaran "${best.category}" ${isUp ? "naik" : "turun"} ${pctRounded}%`,
      description: isNew
        ? `Kategori baru: ${formatRupiah(best.thisWeek)} minggu ini.`
        : `${formatRupiah(best.thisWeek)} minggu ini vs ${formatRupiah(best.prevWeek)} minggu lalu.`,
      liana_prompt: isNew
        ? `Liana, kategori pengeluaran "${best.category}" muncul sebagai pengeluaran baru minggu ini sebesar ${formatRupiah(best.thisWeek)}, padahal minggu lalu Rp0. Apa kemungkinan penyebabnya dan saran untuk owner UMKM?`
        : `Liana, pengeluaran "${best.category}" ${isUp ? "naik" : "turun"} ${pctRounded}% minggu ini (${formatRupiah(best.thisWeek)} vs ${formatRupiah(best.prevWeek)} minggu lalu). Apa kemungkinan penyebabnya dan saran konkret untuk owner UMKM?`,
      score: Math.min(85, pctRounded + (isNew ? 10 : 0)),
    },
  ];
}

// =====================================================================
// Rule 2: Overdue receivables (>14 hari)
// =====================================================================

interface ReceivableRow {
  id: string;
  customer_name: string | null;
  amount: number | string;
  paid_amount: number | string;
  due_date: string | null;
  created_at: string;
}

function computeOverdueReceivables(rows: ReceivableRow[]): DashboardInsight[] {
  if (rows.length === 0) return [];

  const totalOverdue = rows.reduce(
    (sum, r) => sum + (Number(r.amount) - Number(r.paid_amount)),
    0,
  );
  if (totalOverdue <= 0) return [];

  const names = rows
    .slice(0, 3)
    .map((r) => r.customer_name?.trim())
    .filter((n): n is string => Boolean(n));
  const namesText =
    names.length > 0 ? names.join(", ") : "beberapa pelanggan";
  const moreCount = rows.length - names.length;
  const tail = moreCount > 0 ? `, dan ${moreCount} lainnya` : "";

  return [
    {
      id: "overdue-receivables",
      severity: "alert",
      icon: "calendar-clock",
      title: `${rows.length} piutang lewat 14 hari`,
      description: `Total ${formatRupiah(totalOverdue)} dari ${namesText}${tail}.`,
      liana_prompt: `Liana, ada ${rows.length} piutang yang sudah lewat 14 hari dengan total ${formatRupiah(totalOverdue)}, antara lain dari ${namesText}. Tolong susunkan pesan reminder yang sopan dan singkat dalam bahasa Indonesia untuk dikirim ke pelanggan-pelanggan ini.`,
      score: Math.min(95, 55 + rows.length * 5),
    },
  ];
}

// =====================================================================
// Rule 3: Today income anomaly vs 6-day avg
// =====================================================================

function computeIncomeAnomaly(
  txs: TxRow[],
  window: DateWindow,
): DashboardInsight[] {
  let todayIncome = 0;
  const dailyIncomeBefore = new Map<string, number>();

  for (const tx of txs) {
    if (tx.type !== "income" && tx.type !== "receivable_payment") continue;
    const amount = Number(tx.amount);
    const date = tx.transaction_date;
    if (date === window.todayRef) {
      todayIncome += amount;
    } else if (date >= window.last7Start && date < window.todayRef) {
      dailyIncomeBefore.set(date, (dailyIncomeBefore.get(date) ?? 0) + amount);
    }
  }

  if (todayIncome <= 0) return []; // skip kalau belum ada pemasukan hari ini

  const beforeValues = Array.from(dailyIncomeBefore.values());
  if (beforeValues.length === 0) return []; // tidak ada baseline

  // Avg dari 6 hari sebelumnya (denominator = 6, termasuk hari kosong).
  const sumBefore = beforeValues.reduce((s, v) => s + v, 0);
  const avg6 = sumBefore / 6;
  if (avg6 <= 0) return [];

  const pctChange = ((todayIncome - avg6) / avg6) * 100;
  if (Math.abs(pctChange) < 25) return [];

  const isUp = pctChange > 0;
  const pctRounded = Math.abs(Math.round(pctChange));

  return [
    {
      id: "today-income-anomaly",
      severity: isUp ? "success" : "warning",
      icon: isUp ? "trend-up" : "trend-down",
      title: `Pemasukan hari ini ${isUp ? "menonjol" : "rendah"}`,
      description: `${formatRupiah(todayIncome)} — ${pctRounded}% ${isUp ? "di atas" : "di bawah"} rata-rata 6 hari (${formatRupiah(avg6)}).`,
      liana_prompt: `Liana, pemasukan hari ini ${formatRupiah(todayIncome)}, sekitar ${pctRounded}% ${isUp ? "lebih tinggi" : "lebih rendah"} dari rata-rata 6 hari sebelumnya (${formatRupiah(avg6)}). Apa kira-kira yang terjadi dan saran konkret untuk owner UMKM?`,
      score: Math.min(75, pctRounded),
    },
  ];
}

// =====================================================================
// Rule 4: Profit margin minggu ini
// =====================================================================

function computeWeekMargin(
  txs: TxRow[],
  window: DateWindow,
): DashboardInsight[] {
  let income = 0;
  let expense = 0;

  for (const tx of txs) {
    const date = tx.transaction_date;
    if (date < window.last7Start || date > window.todayRef) continue;
    const amount = Number(tx.amount);
    if (tx.type === "income" || tx.type === "receivable_payment")
      income += amount;
    else if (tx.type === "expense") expense += amount;
  }

  if (income <= 0 && expense <= 0) return []; // belum ada aktivitas

  const profit = income - expense;
  const margin = income > 0 ? (profit / income) * 100 : 0;
  const marginRounded = Math.round(margin);

  // Kalau pemasukan kosong tapi ada pengeluaran -> warning khusus.
  if (income === 0) {
    return [
      {
        id: "week-margin",
        severity: "alert",
        icon: "alert-triangle",
        title: `Belum ada pemasukan minggu ini`,
        description: `Pengeluaran sudah ${formatRupiah(expense)}.`,
        liana_prompt: `Liana, minggu ini belum ada pemasukan tercatat sama sekali tapi pengeluaran sudah ${formatRupiah(expense)}. Apa langkah konkret pertama yang sebaiknya saya ambil sebagai owner UMKM?`,
        score: 90,
      },
    ];
  }

  const isLoss = profit < 0;
  const isHealthy = margin >= 20;

  const severity: InsightSeverity = isLoss
    ? "alert"
    : isHealthy
      ? "success"
      : "warning";
  const icon: InsightIcon = isLoss
    ? "alert-triangle"
    : isHealthy
      ? "wallet"
      : "lightbulb";

  return [
    {
      id: "week-margin",
      severity,
      icon,
      title: `Profit minggu ini ${formatRupiah(profit)} (margin ${marginRounded}%)`,
      description: `Pemasukan ${formatRupiah(income)} · pengeluaran ${formatRupiah(expense)}.`,
      liana_prompt: isLoss
        ? `Liana, bisnis saya rugi minggu ini sebesar ${formatRupiah(Math.abs(profit))} (pemasukan ${formatRupiah(income)}, pengeluaran ${formatRupiah(expense)}, margin ${marginRounded}%). Apa langkah konkret untuk pulihkan kondisi minggu depan?`
        : isHealthy
          ? `Liana, profit minggu ini ${formatRupiah(profit)} dengan margin ${marginRounded}% (income ${formatRupiah(income)}, expense ${formatRupiah(expense)}). Apa yang membuat margin ini sehat dan bagaimana mempertahankannya?`
          : `Liana, profit minggu ini ${formatRupiah(profit)} dengan margin ${marginRounded}% — masih tipis (income ${formatRupiah(income)}, expense ${formatRupiah(expense)}). Saran konkret untuk meningkatkan margin minggu depan?`,
      score: isLoss ? 92 : isHealthy ? 45 : 65,
    },
  ];
}
