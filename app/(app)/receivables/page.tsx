import { Suspense } from "react";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { AskLianaButton } from "@/components/liana/ask-liana-button";
import { ReceivableAddButton } from "@/components/receivables/receivable-add-button";
import { ReceivableFilters } from "@/components/receivables/receivable-filters";
import { ReceivableTable } from "@/components/receivables/receivable-table";
import { RealtimeWatcher } from "@/components/realtime/realtime-watcher";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { todayJakarta } from "@/lib/finance/format";
import {
  listReceivables,
  type ReceivableFilters as Filters,
} from "@/lib/finance/receivables/queries";
import { getCategoriesForBusiness } from "@/lib/finance/transactions/queries";
import type { Category, ReceivableStatus } from "@/types/finance";

export const metadata: Metadata = {
  title: "Piutang",
};

export const dynamic = "force-dynamic";

interface ReceivablesPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
  }>;
}

export default async function ReceivablesPage({
  searchParams,
}: ReceivablesPageProps) {
  const businessId = await getCurrentBusinessId();
  const today = todayJakarta();

  if (!businessId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Piutang"
          description="Pantau pelanggan yang belum bayar dan catat pelunasan."
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
    status: normalizeStatus(sp.status),
    search: sp.search ?? null,
    limit: 100,
  };

  // Categories di-fetch eager karena dipakai untuk add button + form
  // di header. Daftar piutang sendiri di-stream via Suspense.
  const receivableCategories = await getCategoriesForBusiness(
    businessId,
    "receivable",
  );

  return (
    <div className="space-y-6">
      {/* Pembayaran piutang via Liana insert row di transactions yang update
          paid_amount. Subscribe ke kedua tabel supaya UI selalu sinkron. */}
      <RealtimeWatcher
        businessId={businessId}
        tables={["receivables", "transactions"]}
      />

      <PageHeader
        title="Piutang"
        description="Pantau pelanggan yang belum bayar dan catat pelunasan. Piutang baru tidak masuk pemasukan sampai dibayar."
        actions={
          <>
            <AskLianaButton
              label="Cek piutang aktif"
              prompt="Liana, siapa saja yang masih punya piutang aktif? Ringkas nama, nominal, dan statusnya."
            />
            <AskLianaButton
              label="Buat reminder piutang"
              prompt="Liana, bantu buat pesan reminder yang sopan untuk pelanggan yang belum bayar piutangnya. Sertakan nominal dan tanggal jatuh tempo."
            />
            <ReceivableAddButton categories={receivableCategories} />
          </>
        }
      />

      <ReceivableFilters />

      <Suspense
        key={JSON.stringify(filters)}
        fallback={<ReceivableTableSkeleton />}
      >
        <ReceivableTableSection
          businessId={businessId}
          filters={filters}
          categories={receivableCategories}
          today={today}
        />
      </Suspense>
    </div>
  );
}

async function ReceivableTableSection({
  businessId,
  filters,
  categories,
  today,
}: {
  businessId: string;
  filters: Filters;
  categories: Category[];
  today: string;
}) {
  const receivables = await listReceivables(businessId, filters);
  return (
    <ReceivableTable
      receivables={receivables}
      categories={categories}
      defaultDate={today}
      todayRef={today}
    />
  );
}

function ReceivableTableSkeleton() {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, j) => (
            <Skeleton key={j} className="h-9 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

function normalizeStatus(
  value: string | undefined,
): ReceivableStatus | "active" | "all" {
  if (
    value === "unpaid" ||
    value === "partial" ||
    value === "paid" ||
    value === "all"
  ) {
    return value;
  }
  // Default: tampilkan yang masih aktif (unpaid + partial)
  return "active";
}
