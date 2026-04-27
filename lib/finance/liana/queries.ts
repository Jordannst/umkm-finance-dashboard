import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { todayJakarta } from "@/lib/finance/format";
import type {
  Category,
  CategoryType,
  Receivable,
  Transaction,
} from "@/types/finance";

/**
 * Helper khusus endpoint /api/liana/* — pakai service-role client karena
 * Liana tidak punya cookie session. SETIAP query WAJIB filter eksplisit
 * `business_id` (Liana harus kirim di body/query).
 */

/**
 * Cari kategori by slug atau name (case-insensitive). Liana umumnya
 * kirim nama kategori bahasa Indonesia ("penjualan", "Belanja Bahan").
 * Return null kalau tidak ketemu — caller boleh fallback ke kategori
 * default atau biarkan transaksi tanpa kategori.
 */
export async function lookupCategoryByNameOrSlug(
  businessId: string,
  type: CategoryType,
  nameOrSlug: string,
): Promise<Category | null> {
  const term = nameOrSlug.trim();
  if (!term) return null;

  const supabase = createAdminClient();

  // Coba slug exact dulu (lowercase, snake_case style).
  const slugCandidate = term
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  if (slugCandidate) {
    const { data: bySlug } = await supabase
      .from("categories")
      .select("*")
      .eq("business_id", businessId)
      .eq("type", type)
      .eq("slug", slugCandidate)
      .maybeSingle();
    if (bySlug) return bySlug as Category;
  }

  // Lalu name ilike (case-insensitive).
  const { data: byName } = await supabase
    .from("categories")
    .select("*")
    .eq("business_id", businessId)
    .eq("type", type)
    .ilike("name", term)
    .maybeSingle();
  if (byName) return byName as Category;

  return null;
}

/**
 * Cari piutang aktif (unpaid/partial) berdasarkan nama pelanggan.
 * Liana akan kirim "Budi" dan kita harus tebak piutang mana.
 *
 * Strategi:
 * - Match exact ilike duluan
 * - Kalau ada multiple aktif, return yang paling dekat jatuh temponya
 * - Return null kalau tidak ada match aktif
 */
export async function findActiveReceivableByCustomerName(
  businessId: string,
  customerName: string,
): Promise<Receivable | null> {
  const term = customerName.trim();
  if (!term) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("receivables")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .in("status", ["unpaid", "partial"])
    .ilike("customer_name", term)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error(
      "[findActiveReceivableByCustomerName]:",
      error.message,
    );
    return null;
  }
  return ((data?.[0] as Receivable | undefined) ?? null);
}

/**
 * Validasi business_id ada di tabel businesses. Lapisan defense-in-depth
 * supaya endpoint Liana tidak meng-insert data ke business_id sembarangan.
 */
export async function ensureBusinessExists(
  businessId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .maybeSingle();
  if (error) {
    console.error("[ensureBusinessExists]:", error.message);
    return false;
  }
  return Boolean(data);
}

// =====================================================================
// Recap (untuk endpoint /api/liana/recap)
// =====================================================================

export interface LianaRecapPeriod {
  preset: "today" | "week" | "month";
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  label: string;
}

export interface LianaRecapPayload {
  period: LianaRecapPeriod;
  summary: {
    total_income: number;
    total_expense: number;
    profit: number;
    transactions_count: number;
    active_receivables: number;
  };
  recent_transactions: Pick<
    Transaction,
    | "id"
    | "type"
    | "amount"
    | "category_name"
    | "note"
    | "transaction_date"
    | "source"
  >[];
  active_receivables: Pick<
    Receivable,
    | "id"
    | "customer_name"
    | "amount"
    | "paid_amount"
    | "status"
    | "due_date"
    | "note"
  >[];
}

/**
 * Resolve preset recap (today | week | month) ke {from, to, label}
 * di TZ Jakarta.
 */
export function resolveLianaRecapPeriod(
  preset: string | null | undefined,
): LianaRecapPeriod {
  const today = todayJakarta();
  switch (preset) {
    case "week": {
      // 7 hari terakhir termasuk hari ini.
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - 6);
      const from = d.toISOString().slice(0, 10);
      return {
        preset: "week",
        from,
        to: today,
        label: "7 hari terakhir",
      };
    }
    case "month": {
      const [y, m] = today.split("-");
      const from = `${y}-${m}-01`;
      return {
        preset: "month",
        from,
        to: today,
        label: "Bulan ini",
      };
    }
    case "today":
    default:
      return {
        preset: "today",
        from: today,
        to: today,
        label: "Hari ini",
      };
  }
}

/**
 * Hitung recap untuk Liana balas chat. Pakai admin client (no RLS).
 */
export async function getLianaRecap(
  businessId: string,
  period: LianaRecapPeriod,
): Promise<LianaRecapPayload> {
  const supabase = createAdminClient();

  // Transaksi dalam periode
  const { data: txs } = await supabase
    .from("transactions")
    .select(
      "id, type, amount, category_name, note, transaction_date, source, created_at",
    )
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .gte("transaction_date", period.from)
    .lte("transaction_date", period.to)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  // Piutang aktif (independen periode — selalu show kondisi sekarang)
  const { data: receivables } = await supabase
    .from("receivables")
    .select(
      "id, customer_name, amount, paid_amount, status, due_date, note",
    )
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .in("status", ["unpaid", "partial"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(20);

  let income = 0;
  let expense = 0;
  for (const tx of txs ?? []) {
    const amt = Number((tx as { amount: number }).amount);
    if ((tx as { type: string }).type === "expense") expense += amt;
    else income += amt;
  }

  const activeReceivables = (receivables ?? []).reduce((sum, rc) => {
    const r = rc as { amount: number; paid_amount: number };
    return sum + (Number(r.amount) - Number(r.paid_amount));
  }, 0);

  return {
    period,
    summary: {
      total_income: income,
      total_expense: expense,
      profit: income - expense,
      transactions_count: (txs ?? []).length,
      active_receivables: activeReceivables,
    },
    recent_transactions: ((txs ?? []).slice(0, 10) as LianaRecapPayload["recent_transactions"]),
    active_receivables: (receivables ?? []) as LianaRecapPayload["active_receivables"],
  };
}
