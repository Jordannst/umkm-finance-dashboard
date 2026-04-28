import { Suspense } from "react";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { ActiveReceivables } from "@/components/dashboard/active-receivables";
import { DailyChart } from "@/components/dashboard/daily-chart";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { AskLianaButton } from "@/components/liana/ask-liana-button";
import { LianaSuggestionCard } from "@/components/liana/liana-suggestion-card";
import { RealtimeWatcher } from "@/components/realtime/realtime-watcher";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
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

  // Setiap section punya Suspense sendiri supaya bagian yang sudah ready
  // bisa stream ke browser tanpa nunggu yang paling lambat.
  return (
    <div className="space-y-6">
      <RealtimeWatcher
        businessId={businessId}
        tables={["transactions", "receivables"]}
      />

      <PageHeader
        title={`Halo, ${firstName}.`}
        description={`Ringkasan keuangan ${business?.name ?? "UMKM"} · ${formatDateLong(today)}`}
        actions={
          <AskLianaButton
            label="Tanya Liana rekap hari ini"
            prompt="Liana, rekap keuangan hari ini dan beri catatan singkat untuk owner UMKM."
          />
        }
      />

      <LianaSuggestionCard />

      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SummarySection businessId={businessId} today={today} />
      </Suspense>

      <Suspense fallback={<DailyChartSkeleton />}>
        <DailyChartSection businessId={businessId} today={today} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<ListSkeleton title="Transaksi terbaru" />}>
          <RecentTransactionsSection businessId={businessId} />
        </Suspense>
        <Suspense fallback={<ListSkeleton title="Piutang aktif" />}>
          <ActiveReceivablesSection businessId={businessId} today={today} />
        </Suspense>
      </div>
    </div>
  );
}

async function SummarySection({
  businessId,
  today,
}: {
  businessId: string;
  today: string;
}) {
  const summary = await getDashboardSummary(businessId, today);
  return <SummaryCards summary={summary} />;
}

async function DailyChartSection({
  businessId,
  today,
}: {
  businessId: string;
  today: string;
}) {
  const daily = await getDailySeries(businessId, 7, today);
  return <DailyChart data={daily} />;
}

async function RecentTransactionsSection({
  businessId,
}: {
  businessId: string;
}) {
  const recentTx = await getRecentTransactions(businessId, 5);
  return <RecentTransactions transactions={recentTx} />;
}

async function ActiveReceivablesSection({
  businessId,
  today,
}: {
  businessId: string;
  today: string;
}) {
  const activeRc = await getActiveReceivables(businessId, 5);
  return <ActiveReceivables receivables={activeRc} todayRef={today} />;
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-md border p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

function DailyChartSkeleton() {
  return (
    <div className="space-y-4 rounded-md border p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-[260px] w-full" />
    </div>
  );
}

function ListSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <Skeleton className="h-5 w-32" aria-label={title} />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
