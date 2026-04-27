import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { CategoryBreakdown } from "@/components/reports/category-breakdown";
import { ExportCsvLink } from "@/components/reports/export-csv-link";
import { PeriodSelector } from "@/components/reports/period-selector";
import { ReportSummary } from "@/components/reports/report-summary";
import { ReportTrendChart } from "@/components/reports/report-trend-chart";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentBusinessId } from "@/lib/finance/business";
import {
  dayCountInclusive,
  resolvePeriod,
} from "@/lib/finance/reports/periods";
import {
  getCategoryBreakdown,
  getReportSeries,
  getReportSummary,
} from "@/lib/finance/reports/queries";

export const metadata: Metadata = {
  title: "Laporan",
};

export const dynamic = "force-dynamic";

interface ReportsPageProps {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function ReportsPage({
  searchParams,
}: ReportsPageProps) {
  const businessId = await getCurrentBusinessId();

  if (!businessId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Laporan"
          description="Rekap pemasukan dan pengeluaran untuk periode tertentu."
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
  const period = resolvePeriod({
    preset: sp.preset,
    from: sp.from,
    to: sp.to,
  });
  const dayCount = dayCountInclusive(period.from, period.to);

  const [summary, series, incomeBreakdown, expenseBreakdown] =
    await Promise.all([
      getReportSummary(businessId, period.from, period.to),
      getReportSeries(businessId, period.from, period.to),
      getCategoryBreakdown(businessId, period.from, period.to, "income"),
      getCategoryBreakdown(businessId, period.from, period.to, "expense"),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan"
        description={`${period.label} (${dayCount} hari). Rekap pemasukan, pengeluaran, dan laba.`}
        actions={
          <ExportCsvLink
            preset={period.preset}
            from={period.from}
            to={period.to}
          />
        }
      />

      <PeriodSelector
        activePreset={period.preset}
        activeFrom={period.from}
        activeTo={period.to}
      />

      <ReportSummary
        summary={summary}
        periodLabel={period.label}
        dayCount={dayCount}
      />

      <ReportTrendChart data={series} periodLabel={period.label} />

      <CategoryBreakdown
        income={incomeBreakdown}
        expense={expenseBreakdown}
      />
    </div>
  );
}
