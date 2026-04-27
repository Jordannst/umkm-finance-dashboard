/**
 * Tipe-tipe domain keuangan UMKM.
 * Selaras dengan skema Supabase di supabase/migrations/.
 */

export type TransactionType = "income" | "expense" | "receivable_payment";
export type CategoryType = "income" | "expense" | "receivable";
export type ReceivableStatus = "unpaid" | "partial" | "paid";
export type DataSource = "dashboard" | "chat" | "system";

export type UserRole = "owner" | "staff";

export interface Business {
  id: string;
  name: string;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  business_id: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  business_id: string;
  type: CategoryType;
  name: string;
  slug: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  business_id: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
  category_name: string | null;
  note: string | null;
  transaction_date: string; // YYYY-MM-DD
  source: DataSource;
  related_receivable_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Receivable {
  id: string;
  business_id: string;
  customer_name: string;
  amount: number;
  paid_amount: number;
  status: ReceivableStatus;
  category_id: string | null;
  category_name: string | null;
  note: string | null;
  due_date: string | null; // YYYY-MM-DD
  created_from_source: DataSource;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ReceivablePayment {
  id: string;
  business_id: string;
  receivable_id: string;
  transaction_id: string | null;
  amount: number;
  payment_date: string; // YYYY-MM-DD
  note: string | null;
  source: DataSource;
  created_at: string;
}

/** Hasil ringkasan dashboard untuk satu periode. */
export interface FinanceSummary {
  period: "today" | "week" | "month" | "custom";
  start_date: string;
  end_date: string;
  total_income: number;
  total_expense: number;
  profit: number;
  active_receivables: number;
}

/** Titik data harian untuk grafik 7 hari terakhir. */
export interface DailySeriesPoint {
  date: string; // YYYY-MM-DD
  income: number;
  expense: number;
}
