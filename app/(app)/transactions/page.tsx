import { Suspense } from "react";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { AskLianaButton } from "@/components/liana/ask-liana-button";
import { RealtimeWatcher } from "@/components/realtime/realtime-watcher";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TransactionAddButton } from "@/components/transactions/transaction-add-button";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { todayJakarta } from "@/lib/finance/format";
import {
  getCategoriesForBusiness,
  listTransactions,
  type TransactionFilters as Filters,
} from "@/lib/finance/transactions/queries";
import type { Category, DataSource, TransactionType } from "@/types/finance";

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
    source?: string;
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
    source: normalizeSource(sp.source),
    limit: 100,
  };

  // Categories diambil eager karena dipakai oleh filter UI + add button
  // di bagian header (first paint). Transactions list di-stream via Suspense.
  const categories = await getCategoriesForBusiness(businessId);

  return (
    <div className="space-y-6">
      <RealtimeWatcher businessId={businessId} tables={["transactions"]} />

      <PageHeader
        title="Transaksi"
        description="Catat dan kelola pemasukan serta pengeluaran harian."
        actions={
          <>
            <AskLianaButton
              label="Cek transaksi terakhir"
              prompt="Liana, cek transaksi terakhir di dashboard dan ringkas 5 transaksi terbaru."
            />
            <AskLianaButton
              label="Pengeluaran terbesar"
              prompt="Liana, cari pengeluaran terbesar minggu ini dan beri saran singkat."
            />
            <TransactionAddButton categories={categories} defaultDate={today} />
          </>
        }
      />

      <TransactionFilters categories={categories} />

      <Suspense
        key={JSON.stringify(filters)}
        fallback={<TransactionTableSkeleton />}
      >
        <TransactionTableSection
          businessId={businessId}
          filters={filters}
          categories={categories}
          defaultDate={today}
        />
      </Suspense>
    </div>
  );
}

async function TransactionTableSection({
  businessId,
  filters,
  categories,
  defaultDate,
}: {
  businessId: string;
  filters: Filters;
  categories: Category[];
  defaultDate: string;
}) {
  const transactions = await listTransactions(businessId, filters);
  return (
    <TransactionTable
      transactions={transactions}
      categories={categories}
      defaultDate={defaultDate}
    />
  );
}

function TransactionTableSkeleton() {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="grid grid-cols-5 gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-5 gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
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

function normalizeSource(value: string | undefined): DataSource | "all" {
  if (value === "chat" || value === "dashboard" || value === "system") {
    return value;
  }
  return "all";
}
