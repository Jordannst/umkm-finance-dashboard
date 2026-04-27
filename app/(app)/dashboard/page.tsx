import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { ActiveReceivables } from "@/components/dashboard/active-receivables";
import { DailyChart } from "@/components/dashboard/daily-chart";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  getCurrentBusiness,
  getCurrentProfile,
} from "@/lib/finance/business";
import { formatDateLong, todayJakarta } from "@/lib/finance/format";
import {
  getActiveReceivables,
  getDailySeries,
  getDashboardSummary,
  getRecentTransactions,
} from "@/lib/finance/queries";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Selalu render dinamis: kondisi keuangan harus selalu fresh.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [profile, business] = await Promise.all([
    getCurrentProfile(),
    getCurrentBusiness(),
  ]);

  const businessId = profile?.business_id ?? null;
  const firstName = profile?.full_name?.trim().split(" ")[0] ?? "Owner";
  const today = todayJakarta();

  if (!businessId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Halo, ${firstName}.`}
          description="Akun kamu belum terhubung ke bisnis."
        />
        <EmptyState
          icon={Building2}
          title="Belum ada bisnis terhubung"
          description="Pastikan migration dan seed Supabase sudah dijalankan, dan trigger handle_new_user aktif. Hubungi admin kalau masih kosong."
        />
      </div>
    );
  }

  const [summary, daily, recentTx, activeRc] = await Promise.all([
    getDashboardSummary(businessId, today),
    getDailySeries(businessId, 7, today),
    getRecentTransactions(businessId, 5),
    getActiveReceivables(businessId, 5),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Halo, ${firstName}.`}
        description={`Ringkasan keuangan ${business?.name ?? "UMKM"} · ${formatDateLong(today)}`}
      />

      <SummaryCards summary={summary} />
      <DailyChart data={daily} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentTransactions transactions={recentTx} />
        <ActiveReceivables receivables={activeRc} todayRef={today} />
      </div>
    </div>
  );
}
