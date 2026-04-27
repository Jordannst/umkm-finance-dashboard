# Real-time Updates & Navigation Performance — Design Spec

**Date**: 2026-04-28
**Status**: Approved
**Author**: Cascade (pair-programming with Jordan)
**Project**: umkm-finance-dashboard
**Sprint**: Post-deployment polish

---

## Goals

1. **Real-time data updates** — list transaksi di `/transactions`, summary cards & chart di `/dashboard`, dan list piutang di `/receivables` auto-refresh saat ada data baru dari Liana (OpenClaw via MCP) atau form dashboard, **tanpa manual reload**.
2. **Visual notification** — toast notification muncul saat Liana berhasil mencatat data baru, supaya owner sadar tanpa harus stare ke screen.
3. **Faster perceived navigation** — perpindahan antar page (Dashboard ↔ Transactions ↔ Receivables ↔ Reports ↔ Settings) terasa instant via prefetch agresif + Suspense streaming.

## Non-Goals

- ❌ Optimistic UI updates (data baru muncul sebelum server confirm)
- ❌ Collaborative editing (multi-user simultaneous edit)
- ❌ Offline-first / queue when no internet
- ❌ View Transitions API animations (defer ke polish phase)
- ❌ Push notifications ke OS / browser tab background

---

## Architecture

### Data Flow

```
┌─────────────┐      ┌──────────┐      ┌─────────────────┐
│ Liana (MCP) │─────▶│  Vercel  │─────▶│ Supabase Postgres│
│ atau form   │ POST │ API      │ INSERT│  - transactions  │
│ dashboard   │      │/api/...  │      │  - receivables   │
└─────────────┘      └──────────┘      └─────────┬───────┘
                                                  │ NOTIFY
                                                  ▼
                                        ┌──────────────────┐
                                        │ Supabase Realtime│
                                        │ (WebSocket)      │
                                        └─────────┬────────┘
                                                  │ broadcast
                                                  ▼
┌──────────────────────────────────────────────────────┐
│  Browser tab owner                                   │
│  ┌────────────────────────────────────────────────┐  │
│  │ <RealtimeWatcher tables={...} businessId>      │  │
│  │   useRealtimeRefresh()                         │  │
│  │     ├─ on INSERT (source='chat')               │  │
│  │     │     → toast.success(...)                 │  │
│  │     ├─ on any change                           │  │
│  │     │     → router.refresh() (debounced 500ms) │  │
│  └────────────────────────────────────────────────┘  │
│       │ Server re-renders RSC                        │
│       ▼ Streaming partial render                     │
│  Dashboard / Transactions / Receivables refreshed    │
└──────────────────────────────────────────────────────┘
```

### Approach Decision: `router.refresh()` triggered by Realtime

**Why:**
- Page query logic sudah ada di server (`listTransactions`, `getReceivables`, dll). Tidak perlu duplikasi di client.
- Filter, sort, aggregation tetap di server query (RLS-aware via cookies).
- 1× hook reusable untuk 3 pages.
- Next.js 16 streaming partial-render bikin update terasa cepat (~300-500ms).
- Tidak perlu manage local state untuk merge events.

**Alternative ditolak:**
- Direct state merge (Approach B di proposal): butuh refactor 3 pages jadi `"use client"` + duplikasi filter/aggregation logic. YAGNI untuk MVP.
- SWR + Realtime trigger: butuh migrasi ke SWR pattern, overengineered untuk single-tenant scope.

---

## Components

### `hooks/use-realtime-refresh.ts`

Client hook yang subscribe Supabase Realtime channel.

**Signature:**
```ts
type RealtimeTable = "transactions" | "receivables";

interface UseRealtimeRefreshOptions {
  businessId: string;
  tables: RealtimeTable[];
  showLianaToast?: boolean;
  debounceMs?: number; // default 500
}

export function useRealtimeRefresh(opts: UseRealtimeRefreshOptions): void;
```

**Behavior:**
1. Saat mount: `supabase.channel(\`realtime:\${businessId}\`)`.
2. Subscribe ke `postgres_changes` untuk setiap table di `tables[]`, filter `business_id=eq.${businessId}`.
3. Saat event INSERT diterima:
   - Kalau `payload.new.source === 'chat'` dan `showLianaToast`, panggil toast helper (lihat di bawah).
   - Selalu trigger `debouncedRefresh()`.
4. Saat event UPDATE/DELETE: hanya `debouncedRefresh()` (no toast).
5. `debouncedRefresh()`: clear pending timer, set baru 500ms → `router.refresh()`.
6. Saat unmount: `channel.unsubscribe()` + clear timer.

**Toast helpers:**

```ts
function toastForTransaction(payload: { type, amount, category_name, note }) {
  const verb = payload.type === 'income' ? 'pemasukan' : 'pengeluaran';
  toast.success(
    `Liana mencatat ${verb}: ${formatRupiah(payload.amount)}`,
    { description: payload.note ?? payload.category_name ?? undefined }
  );
}

function toastForReceivable(payload: { customer_name, amount }) {
  toast.info(
    `Liana mencatat piutang: ${payload.customer_name}`,
    { description: formatRupiah(payload.amount) }
  );
}
```

### `components/realtime/realtime-watcher.tsx`

Client component thin wrapper. Render `null`. Inserted di server component pages.

```tsx
"use client";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

interface Props {
  businessId: string;
  tables: Array<"transactions" | "receivables">;
  showLianaToast?: boolean;
}

export function RealtimeWatcher(props: Props) {
  useRealtimeRefresh({
    ...props,
    showLianaToast: props.showLianaToast ?? true,
  });
  return null;
}
```

### `lib/supabase/client.ts` *(verify, mungkin sudah ada)*

Browser client untuk Realtime subscription. Pakai anon key + cookies-based session via `createBrowserClient` dari `@supabase/ssr`.

---

## Database Migration

### `supabase/migrations/0005_enable_realtime.sql`

```sql
-- Add tables to supabase_realtime publication
-- Idempotent: cek dulu apakah table sudah di publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'receivables'
  ) then
    alter publication supabase_realtime add table public.receivables;
  end if;
end $$;
```

**RLS Implication:** Realtime broadcast respect RLS policy `*_select_business` yang sudah ada. Owner hanya menerima event untuk row di mana `business_id = current_business_id()`. Defense-in-depth: hook juga filter explicit by `businessId` parameter.

---

## Page Modifications

### `app/(app)/transactions/page.tsx`

```tsx
// At top of return JSX, BEFORE PageHeader:
<RealtimeWatcher
  businessId={businessId}
  tables={["transactions"]}
  showLianaToast={true}
/>
```

### `app/(app)/dashboard/page.tsx`

```tsx
<RealtimeWatcher
  businessId={businessId}
  tables={["transactions", "receivables"]}
  showLianaToast={true}
/>
```

### `app/(app)/receivables/page.tsx`

```tsx
<RealtimeWatcher
  businessId={businessId}
  tables={["receivables", "transactions"]}
  showLianaToast={true}
/>
```

> Receivables page subscribe juga ke `transactions` karena pembayaran piutang insert row di `transactions` (type='receivable_payment') yang men-trigger update status piutang.

---

## Navigation Enhancements

### Prefetch Tuning di Sidebar

`components/layout/app-shell.tsx`:

```tsx
<Link
  href={item.href}
  prefetch={true}  // sudah default, eksplisit untuk clarity
  ...
>
```

> Next.js 16 default prefetch behavior: pre-load route on viewport visibility. Kita biarkan default — sudah optimal untuk sidebar yang selalu visible.

### Suspense Streaming di Pages dengan Heavy Data

**Pattern transformasi `/transactions`:**

Before (current):
```tsx
export default async function TransactionsPage({ searchParams }) {
  const businessId = await getCurrentBusinessId();
  const sp = await searchParams;
  const [transactions, categories] = await Promise.all([...]);
  return (
    <>
      <PageHeader />
      <Filters />
      <TransactionTable data={transactions} />
    </>
  );
}
```

After (with Suspense):
```tsx
export default async function TransactionsPage({ searchParams }) {
  const businessId = await getCurrentBusinessId();
  const sp = await searchParams;
  const filters = parseFilters(sp);

  // Categories cepat dan dipakai filter UI → fetch langsung
  const categories = await getCategoriesForBusiness(businessId);

  return (
    <>
      <RealtimeWatcher businessId={businessId} tables={["transactions"]} />
      <PageHeader actions={<TransactionAddButton categories={categories} />} />
      <TransactionFilters categories={categories} />

      {/* Stream tabel data */}
      <Suspense key={JSON.stringify(filters)} fallback={<TransactionTableSkeleton />}>
        <TransactionTableSection
          businessId={businessId}
          filters={filters}
          categories={categories}
        />
      </Suspense>
    </>
  );
}

// New separate async component
async function TransactionTableSection({ businessId, filters, categories }) {
  const transactions = await listTransactions(businessId, filters);
  return <TransactionTable data={transactions} categories={categories} />;
}
```

**Dampak:**
- Header + filter UI muncul instant
- Table loading skeleton 200-500ms
- Saat user ganti filter → Suspense `key` berubah → re-stream

**Same pattern untuk `/dashboard` dan `/receivables`** dengan adaptasi.

### Loading Skeletons

5 loading.tsx files sudah ada (verified). Kita re-use sebagai Suspense fallback components — extract jadi `*-skeleton.tsx` reusable kalau perlu.

---

## Error Handling

### Realtime Connection Failures

- WebSocket disconnect (network drop): Supabase client auto-reconnect dengan exponential backoff. Tidak perlu handle manual.
- Subscription error: log ke `console.error` (akan masuk ke browser DevTools). Tidak crash page.
- Auth token expired (long session): cookies-refreshed via proxy.ts. Realtime channel re-authenticate otomatis.

### `router.refresh()` Failure

- Network error saat refresh: Next.js will retry. Realtime queue tetap aktif → next event akan trigger refresh lagi.
- Auth-related 401: User redirected ke `/login` via proxy.ts middleware (existing behavior).

### Race Condition: User Edit Form sambil Realtime Refresh

- Filter form, modal, dialog: `router.refresh()` tidak di-block, tapi React preserve state untuk client component. Form values tetap.
- Edge case: user submit form persis bersamaan dengan refresh → server action proceed normal, refresh mengikuti.

---

## Testing Strategy

### Manual Testing Checklist

1. **Realtime + Toast (positive path)**
   - [ ] Buka `/transactions` di browser
   - [ ] Dari terminal: `curl POST /api/liana/finance-input` dengan `source: 'chat'`
   - [ ] Toast muncul `"Liana mencatat pemasukan: Rp..."`
   - [ ] Row baru muncul di table dalam 1 detik tanpa reload manual
   - [ ] Repeat untuk receivable-input + receivable-payment
2. **Refresh tanpa Toast (form dashboard)**
   - [ ] Tambah transaksi via form di `/transactions`
   - [ ] Tidak ada toast (karena `source='dashboard'`)
   - [ ] Row tetap muncul di table

3. **Multi-page sync**
   - [ ] Buka 2 tab: `/dashboard` dan `/transactions`
   - [ ] Trigger event dari Liana
   - [ ] Kedua tab refresh dalam <1 detik

4. **Suspense streaming**
   - [ ] Network throttle ke "Slow 3G"
   - [ ] Klik link Transactions di sidebar
   - [ ] Header & filter muncul instant
   - [ ] Table skeleton 1-2 detik, lalu table muncul

5. **Connection resilience**
   - [ ] Buka `/transactions`, disconnect WiFi 30 detik
   - [ ] Reconnect WiFi
   - [ ] Trigger event dari Liana
   - [ ] Page tetap update setelah reconnect (Supabase auto-retry)

### Automated (kalau ada budget)

- E2E Playwright: simulate Liana POST + check DOM update
- Tidak ada budget di sprint ini → manual cukup

---

## Trade-offs & Risks

| Risiko | Likelihood | Mitigation |
|---|---|---|
| Realtime quota habis | Low (free tier 200 concurrent, kita 1-2 owner) | Monitor di Supabase dashboard. Upgrade plan kalau >50 |
| Toast spam saat Liana batch import | Medium | Debounce 500ms group event jadi 1 refresh, tapi toast tetap per-event. **Acceptable**: Liana jarang batch >10 event/menit |
| WebSocket diblokir di network owner | Low | Supabase Realtime fallback ke long polling otomatis |
| `router.refresh()` race dengan form submit | Low | React preserve client state, tidak interfere |
| Performance hit di /dashboard (chart re-render) | Low | Chart memo by data hash, hanya re-render kalau values benar berubah |

---

## Open Questions

Tidak ada — semua decision sudah final.

## Out of Scope (deferred)

- View Transitions API untuk page transitions (React 19 `<ViewTransition>` masih experimental di Next 16)
- Receivable status update toast (mis. "Piutang Budi LUNAS")
- Browser push notification saat tab background
- Multi-user collaborative editing

---

## Files to Add / Modify

### New (4)

1. `hooks/use-realtime-refresh.ts`
2. `components/realtime/realtime-watcher.tsx`
3. `supabase/migrations/0005_enable_realtime.sql`
4. `docs/specs/2026-04-28-realtime-navigation-design.md` *(this file)*

### Modified (5-6)

1. `app/(app)/transactions/page.tsx` — add RealtimeWatcher + Suspense streaming
2. `app/(app)/dashboard/page.tsx` — same
3. `app/(app)/receivables/page.tsx` — same
4. `lib/supabase/client.ts` — verify Realtime support enabled
5. `components/layout/app-shell.tsx` — explicit `prefetch={true}` (no-op but documenting intent)
6. (Conditional) Extract page-level skeleton components for Suspense reuse

---

## Implementation Plan

Will be created in separate document via `writing-plans` skill. Reference: `docs/specs/2026-04-28-realtime-navigation-plan.md` (TBD).
