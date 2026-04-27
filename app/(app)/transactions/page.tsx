import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TransactionAddButton } from "@/components/transactions/transaction-add-button";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { todayJakarta } from "@/lib/finance/format";
import {
  getCategoriesForBusiness,
  listTransactions,
  type TransactionFilters as Filters,
} from "@/lib/finance/transactions/queries";
import type { TransactionType } from "@/types/finance";

export const metadata: Metadata = {
  title: "Transaksi",
};

export const dynamic = "force-dynamic";

interface TransactionsPageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    type?: string;
    categoryId?: string;
    search?: string;
  }>;
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const businessId = await getCurrentBusinessId();
  const today = todayJakarta();

  if (!businessId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Transaksi"
          description="Catat dan kelola pemasukan serta pengeluaran harian."
        />
        <EmptyState
          icon={Building2}
          title="Belum ada bisnis terhubung"
          description="Pastikan migration dan seed Supabase sudah dijalankan."
        />
      </div>
    );
  }

  const sp = await searchParams;
  const filters: Filters = {
    from: sp.from?.match(/^\d{4}-\d{2}-\d{2}$/) ? sp.from : null,
    to: sp.to?.match(/^\d{4}-\d{2}-\d{2}$/) ? sp.to : null,
    type: normalizeType(sp.type),
    categoryId: sp.categoryId ?? null,
    search: sp.search ?? null,
    limit: 100,
  };

  const [transactions, categories] = await Promise.all([
    listTransactions(businessId, filters),
    getCategoriesForBusiness(businessId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaksi"
        description="Catat dan kelola pemasukan serta pengeluaran harian."
        actions={
          <TransactionAddButton categories={categories} defaultDate={today} />
        }
      />

      <TransactionFilters categories={categories} />

      <TransactionTable
        transactions={transactions}
        categories={categories}
        defaultDate={today}
      />
    </div>
  );
}

function normalizeType(value: string | undefined): TransactionType | "all" {
  if (
    value === "income" ||
    value === "expense" ||
    value === "receivable_payment"
  ) {
    return value;
  }
  return "all";
}
