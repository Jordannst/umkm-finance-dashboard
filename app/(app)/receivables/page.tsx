import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ReceivableAddButton } from "@/components/receivables/receivable-add-button";
import { ReceivableFilters } from "@/components/receivables/receivable-filters";
import { ReceivableTable } from "@/components/receivables/receivable-table";
import { getCurrentBusinessId } from "@/lib/finance/business";
import { todayJakarta } from "@/lib/finance/format";
import {
  listReceivables,
  type ReceivableFilters as Filters,
} from "@/lib/finance/receivables/queries";
import { getCategoriesForBusiness } from "@/lib/finance/transactions/queries";
import type { ReceivableStatus } from "@/types/finance";

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

  const [receivables, receivableCategories] = await Promise.all([
    listReceivables(businessId, filters),
    getCategoriesForBusiness(businessId, "receivable"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Piutang"
        description="Pantau pelanggan yang belum bayar dan catat pelunasan. Piutang baru tidak masuk pemasukan sampai dibayar."
        actions={<ReceivableAddButton categories={receivableCategories} />}
      />

      <ReceivableFilters />

      <ReceivableTable
        receivables={receivables}
        categories={receivableCategories}
        defaultDate={today}
        todayRef={today}
      />
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
