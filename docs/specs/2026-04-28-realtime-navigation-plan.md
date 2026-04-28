# Real-time Updates & Navigation Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring real-time data freshness ke `/transactions`, `/dashboard`, `/receivables` (auto-refresh + Liana toast notifications) plus faster perceived navigation via Suspense streaming.

**Architecture:** Subscribe Supabase Realtime channel di client component (`<RealtimeWatcher>` thin wrapper), filter by `business_id`, debounce-trigger `router.refresh()` 500ms, show toast saat INSERT event source='chat'. Page refactor jadi Suspense streaming untuk render shell instant + data section fade-in.

**Tech Stack:** Next.js 16.2.4 (App Router, RSC, Server Actions), React 19.2.4, `@supabase/ssr` 0.10.2, Sonner 2.0.7, TypeScript 5, ESLint 9.

**Spec:** `docs/specs/2026-04-28-realtime-navigation-design.md`

---

## File Structure Overview

### New Files

| Path | Responsibility |
|------|----------------|
| `hooks/use-realtime-refresh.ts` | Client hook: subscribe Supabase Realtime, debounce `router.refresh()`, toast for Liana events |
| `components/realtime/realtime-watcher.tsx` | Thin client component wrapper untuk hook (returns null) |
| `supabase/migrations/0005_enable_realtime.sql` | Idempotent migration: tambah `transactions` + `receivables` ke `supabase_realtime` publication |

### Modified Files

| Path | What Changes |
|------|--------------|
| `app/(app)/transactions/page.tsx` | Add `<RealtimeWatcher>` + Suspense streaming untuk table |
| `app/(app)/dashboard/page.tsx` | Add `<RealtimeWatcher>` + Suspense untuk summary section |
| `app/(app)/receivables/page.tsx` | Add `<RealtimeWatcher>` + Suspense untuk receivables list |

### Verified, No Changes

- `lib/supabase/client.ts` — sudah pakai `createBrowserClient` yang Realtime-ready by default
- 5x `loading.tsx` files — sudah ada, di-reuse sebagai Suspense fallback inspiration

---

## Task 1: Create `useRealtimeRefresh` hook

**Files:**
- Create: `hooks/use-realtime-refresh.ts`

- [ ] **Step 1: Write the hook implementation**

Create `hooks/use-realtime-refresh.ts`:

```typescript
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { formatRupiah } from "@/lib/finance/format";
import { createClient } from "@/lib/supabase/client";

export type RealtimeTable = "transactions" | "receivables";

interface UseRealtimeRefreshOptions {
  /** UUID business yang user terhubung. Filter event di Supabase. */
  businessId: string;
  /** Tabel yang mau di-watch. */
  tables: RealtimeTable[];
  /** Tampilkan toast saat INSERT dari Liana (source='chat'). Default true. */
  showLianaToast?: boolean;
  /** Debounce window untuk router.refresh(). Default 500ms. */
  debounceMs?: number;
}

interface TransactionPayload {
  type?: "income" | "expense" | "receivable_payment";
  amount?: number;
  category_name?: string | null;
  note?: string | null;
  source?: string;
  business_id?: string;
}

interface ReceivablePayload {
  customer_name?: string;
  amount?: number;
  source?: string;
  business_id?: string;
}

/**
 * Subscribe ke Supabase Realtime untuk tabel keuangan UMKM.
 * Saat ada INSERT/UPDATE/DELETE pada baris yang `business_id` cocok,
 * trigger `router.refresh()` (debounced) supaya RSC re-fetch query
 * server-side dengan filter yang sudah ada.
 *
 * Bonus: kalau INSERT bersumber dari Liana (`source='chat'`), tampilkan
 * toast notif supaya owner aware tanpa harus stare ke screen.
 */
export function useRealtimeRefresh({
  businessId,
  tables,
  showLianaToast = true,
  debounceMs = 500,
}: UseRealtimeRefreshOptions): void {
  const router = useRouter();
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const debouncedRefresh = React.useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      router.refresh();
    }, debounceMs);
  }, [router, debounceMs]);

  React.useEffect(() => {
    if (!businessId || tables.length === 0) return;

    const supabase = createClient();
    const channelName = `realtime:${businessId}:${tables.join("-")}`;
    const channel: RealtimeChannel = supabase.channel(channelName);

    for (const table of tables) {
      channel.on(
        // @ts-expect-error - Supabase typing belum cover postgres_changes literal
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `business_id=eq.${businessId}`,
        },
        (payload: {
          eventType: "INSERT" | "UPDATE" | "DELETE";
          new: Record<string, unknown>;
          old: Record<string, unknown>;
          table: string;
        }) => {
          // Selalu trigger refresh
          debouncedRefresh();

          // Toast hanya untuk INSERT dari Liana
          if (
            !showLianaToast ||
            payload.eventType !== "INSERT" ||
            payload.new?.source !== "chat"
          ) {
            return;
          }

          if (payload.table === "transactions") {
            const tx = payload.new as TransactionPayload;
            const verb =
              tx.type === "income"
                ? "pemasukan"
                : tx.type === "expense"
                  ? "pengeluaran"
                  : "pembayaran piutang";
            toast.success(
              `Liana mencatat ${verb}: ${formatRupiah(tx.amount ?? 0)}`,
              {
                description: tx.note ?? tx.category_name ?? undefined,
              },
            );
          } else if (payload.table === "receivables") {
            const rc = payload.new as ReceivablePayload;
            toast.info(`Liana mencatat piutang: ${rc.customer_name ?? "-"}`, {
              description: formatRupiah(rc.amount ?? 0),
            });
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, tables.join("-"), showLianaToast, debounceMs]);
}
```

- [ ] **Step 2: Verify lint pass**

Run: `npm run lint`
Expected: 0 errors. Warning OK kalau ada (mis. unused import bisa dibetulin di Task akhir kalau muncul).

- [ ] **Step 3: Commit**

```bash
git add hooks/use-realtime-refresh.ts
git commit -m "feat(realtime): add useRealtimeRefresh hook with debounced router.refresh + Liana toast"
```

---

## Task 2: Create `RealtimeWatcher` Component

**Files:**
- Create: `components/realtime/realtime-watcher.tsx`

- [ ] **Step 1: Write the component**

Create `components/realtime/realtime-watcher.tsx`:

```typescript
"use client";

import {
  useRealtimeRefresh,
  type RealtimeTable,
} from "@/hooks/use-realtime-refresh";

interface RealtimeWatcherProps {
  businessId: string;
  tables: RealtimeTable[];
  /** Default true — tampilkan toast saat ada data baru dari Liana. */
  showLianaToast?: boolean;
}

/**
 * Thin wrapper untuk `useRealtimeRefresh`. Render `null`.
 * Inserted di server component pages tanpa block render.
 *
 * Contoh:
 *   <RealtimeWatcher businessId={businessId} tables={["transactions"]} />
 */
export function RealtimeWatcher({
  businessId,
  tables,
  showLianaToast = true,
}: RealtimeWatcherProps) {
  useRealtimeRefresh({ businessId, tables, showLianaToast });
  return null;
}
```

- [ ] **Step 2: Verify lint + typecheck**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/realtime/realtime-watcher.tsx
git commit -m "feat(realtime): add RealtimeWatcher thin wrapper component"
```

---

## Task 3: Database Migration — Enable Realtime Publication

**Files:**
- Create: `supabase/migrations/0005_enable_realtime.sql`

- [ ] **Step 1: Write idempotent migration**

Create `supabase/migrations/0005_enable_realtime.sql`:

```sql
-- =====================================================================
-- 0005_enable_realtime.sql
--
-- Enable Supabase Realtime untuk tabel transactions dan receivables.
-- Tabel harus ada di publication `supabase_realtime` supaya event
-- INSERT/UPDATE/DELETE di-broadcast ke client yang subscribe.
--
-- IDEMPOTENT: cek dulu apakah tabel sudah di publication.
-- Aman dijalankan berulang.
--
-- RLS NOTE: Realtime broadcast respect RLS. User hanya menerima event
-- untuk row yang dia bisa SELECT (filtered by current_business_id()).
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
    raise notice '[0005] transactions added to supabase_realtime publication';
  else
    raise notice '[0005] transactions already in supabase_realtime, skip';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'receivables'
  ) then
    alter publication supabase_realtime add table public.receivables;
    raise notice '[0005] receivables added to supabase_realtime publication';
  else
    raise notice '[0005] receivables already in supabase_realtime, skip';
  end if;
end $$;
```

- [ ] **Step 2: Run migration di Supabase production via SQL Editor**

1. Buka Supabase Dashboard → SQL Editor → New query
2. Copy-paste isi file `supabase/migrations/0005_enable_realtime.sql`
3. Click **Run**
4. Verifikasi output `NOTICE`:
   ```
   [0005] transactions added to supabase_realtime publication
   [0005] receivables added to supabase_realtime publication
   ```

- [ ] **Step 3: Verifikasi enable di Supabase Dashboard**

1. Supabase Dashboard → **Database** → **Replication**
2. Pastikan `supabase_realtime` publication mencantumkan `transactions` dan `receivables` dengan checkbox aktif.

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/0005_enable_realtime.sql
git commit -m "feat(supabase): enable Realtime publication for transactions + receivables"
```

---

## Task 4: Apply RealtimeWatcher + Suspense Streaming ke `/transactions`

**Files:**
- Modify: `app/(app)/transactions/page.tsx`

- [ ] **Step 1: Refactor page jadi Suspense-friendly**

Replace contents `app/(app)/transactions/page.tsx`:

```typescript
import { Suspense } from "react";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";

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

  // Fetch categories segera karena dipakai di filter UI dan add button
  const categories = await getCategoriesForBusiness(businessId);

  return (
    <div className="space-y-6">
      <RealtimeWatcher businessId={businessId} tables={["transactions"]} />

      <PageHeader
        title="Transaksi"
        description="Catat dan kelola pemasukan serta pengeluaran harian."
        actions={
          <TransactionAddButton categories={categories} defaultDate={today} />
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
  categories: Awaited<ReturnType<typeof getCategoriesForBusiness>>;
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
```

- [ ] **Step 2: Verify Skeleton component exists**

Run: `ls components/ui/skeleton.tsx 2>/dev/null || echo "MISSING"`

If output is `MISSING`, create the file (shadcn/ui standard skeleton):

```typescript
// components/ui/skeleton.tsx
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Local smoke test**

Run: `npm run dev`
1. Buka http://localhost:3000/transactions
2. Verifikasi: header & filter UI muncul instant, table skeleton muncul ~100ms, lalu table actual muncul ~200-500ms
3. Refresh dengan filter `?type=income` — Suspense re-stream dengan key baru

- [ ] **Step 5: Commit**

```bash
git add app/(app)/transactions/page.tsx components/ui/skeleton.tsx
git commit -m "feat(transactions): add RealtimeWatcher + Suspense streaming"
```

---

## Task 5: Apply RealtimeWatcher + Suspense ke `/dashboard`

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Read current dashboard page structure**

Run: `cat app/\(app\)/dashboard/page.tsx`

Identifikasi:
- Dimana data fetching (Promise.all atau separate awaits)
- Komponen mana yang dipakai (4 cards summary, chart 7 hari, recent transactions)
- Apakah ada conditional render untuk `!businessId`

- [ ] **Step 2: Refactor dengan pattern serupa Task 4**

Modify `app/(app)/dashboard/page.tsx`:

Add imports di top:
```typescript
import { Suspense } from "react";
import { RealtimeWatcher } from "@/components/realtime/realtime-watcher";
import { Skeleton } from "@/components/ui/skeleton";
```

Add `<RealtimeWatcher>` setelah `if (!businessId)` early return, di awal main return:
```typescript
return (
  <div className="space-y-6">
    <RealtimeWatcher
      businessId={businessId}
      tables={["transactions", "receivables"]}
    />
    <PageHeader ... />
    {/* ... rest of existing JSX */}
  </div>
);
```

Wrap section yang fetch data dengan Suspense. Misalnya summary cards:
```typescript
<Suspense fallback={<DashboardSummarySkeleton />}>
  <DashboardSummarySection businessId={businessId} />
</Suspense>
```

Extract data-fetching ke async sub-component:
```typescript
async function DashboardSummarySection({ businessId }: { businessId: string }) {
  const summary = await getDashboardSummary(businessId);
  return <SummaryCards data={summary} />;
}

function DashboardSummarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-md border p-4 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
```

> **Adapt to actual function names di codebase.** Sebelum tulis, baca page.tsx aktual untuk pakai nama function/import yang benar.

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Local smoke test**

Run: `npm run dev`
1. Buka http://localhost:3000/dashboard
2. Verifikasi: header muncul instant, summary cards skeleton lalu muncul, chart muncul terakhir
3. Buka tab DevTools → Network → verifikasi WebSocket ke Supabase Realtime active

- [ ] **Step 5: Commit**

```bash
git add app/(app)/dashboard/page.tsx
git commit -m "feat(dashboard): add RealtimeWatcher + Suspense streaming"
```

---

## Task 6: Apply RealtimeWatcher + Suspense ke `/receivables`

**Files:**
- Modify: `app/(app)/receivables/page.tsx`

- [ ] **Step 1: Read current receivables page**

Run: `cat app/\(app\)/receivables/page.tsx`

- [ ] **Step 2: Apply pattern**

Pattern sama dengan Task 4 + 5:
- Import `RealtimeWatcher`, `Suspense`, `Skeleton`
- `<RealtimeWatcher businessId={businessId} tables={["receivables", "transactions"]} />`
  > NOTE: include `transactions` karena pembayaran piutang insert row di transactions yang trigger receivable.paid_amount update
- Extract data section ke async sub-component
- Wrap dengan Suspense + skeleton

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`
1. Buka http://localhost:3000/receivables
2. Verifikasi UI streaming
3. Subscribe Realtime aktif (Network tab WebSocket)

- [ ] **Step 5: Commit**

```bash
git add app/(app)/receivables/page.tsx
git commit -m "feat(receivables): add RealtimeWatcher + Suspense streaming"
```

---

## Task 7: End-to-end Verification

**Files:** No code changes — verification only.

- [ ] **Step 1: Local build sanity check**

Run: `npm run lint`
Expected: 0 errors.

Run: `npm run build`
Expected: Build success, semua route ter-compile.

- [ ] **Step 2: Push to GitHub → Vercel auto-deploy**

```bash
git push
```

Tunggu 2-3 menit untuk Vercel selesai deploy.

- [ ] **Step 3: Production realtime smoke test**

Buka 2 browser tab:
- Tab A: https://umkm-finance-dashboard.vercel.app/transactions
- Tab B: https://umkm-finance-dashboard.vercel.app/dashboard

Dari terminal SSH ke VPS atau via curl, trigger Liana POST:

```bash
$URL = "https://umkm-finance-dashboard.vercel.app"
$SECRET = "<paste-LIANA_SHARED_SECRET>"

curl -X POST "$URL/api/liana/finance-input" `
  -H "Authorization: Bearer $SECRET" `
  -H "Content-Type: application/json" `
  -d '{
    "business_id": "11111111-1111-4111-8111-111111111111",
    "type": "income",
    "amount": 25000,
    "category_name": "penjualan",
    "note": "Test realtime",
    "source": "chat",
    "created_by": "Liana"
  }'
```

Expected behavior:
- Tab A (`/transactions`): toast `"Liana mencatat pemasukan: Rp25.000"` muncul, table refresh dengan row baru ~500ms
- Tab B (`/dashboard`): same toast (kalau dashboard juga subscribed), summary card "Pemasukan hari ini" bertambah Rp25.000

- [ ] **Step 4: Test dari Liana real (OpenClaw chat)**

Kirim ke Liana via WhatsApp/Telegram:
```
catat pemasukan 50rb tadi jualan kopi
```

Verifikasi tab dashboard di browser update otomatis.

- [ ] **Step 5: Test connection resilience**

1. Buka `/transactions`
2. DevTools → Network → throttle ke "Offline" 30 detik
3. Set kembali "Online"
4. Trigger Liana event
5. Expected: tab tetap update setelah reconnect (Supabase auto-retry)

- [ ] **Step 6: Final commit "feat: realtime + navigation enhancements complete"**

Tidak ada code change baru, tapi tag completion:

```bash
git commit --allow-empty -m "feat: realtime updates + navigation streaming complete

End-to-end verified production:
- Realtime subscription pada 3 pages (transactions, dashboard, receivables)
- Toast notification untuk INSERT events dengan source='chat'
- Suspense streaming untuk faster perceived navigation
- Idempotent migration 0005 enable Realtime publication"
git push
```

---

## Self-Review Checklist (writer)

After implementation, sebelum claim done:

- [ ] Spec coverage: setiap requirement di spec ada task yang implement-nya
- [ ] All tasks committed dengan conventional commit prefix (feat/fix/docs/refactor)
- [ ] No placeholders di kode (no TODO, FIXME tanpa rencana fix)
- [ ] Type signatures konsisten antar file (mis. `RealtimeTable` enum sama di hook + component)
- [ ] Lint + build pass tanpa warning baru

## Out-of-Scope Reminder

Tidak masuk plan ini (per spec):
- ❌ View Transitions API (`<ViewTransition>`)
- ❌ Optimistic UI updates (data muncul sebelum server confirm)
- ❌ Browser push notifications
- ❌ Multi-user collaborative features
- ❌ Offline queue saat no internet
