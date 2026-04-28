# Liana Response Speed — Phase 1 Design

**Date:** 2026-04-29
**Status:** Approved (sections 1–3) — pending implementation plan
**Scope:** Phase 1 of multi-phase Liana speed work. Phase 2 (actual
speed reduction) deferred until latency data tersedia.

---

## 1. Problem statement

User experience saat ini: setelah klik **Tanya Liana**, pill di
bottom-center stuck di label **"Liana sedang menyusun jawaban"** untuk
durasi yang gak terukur — mungkin 5 detik, mungkin 30 detik. Selama
periode itu zero progress signal, jadi user gak tahu:

- Apakah Liana lagi proses normal atau stuck
- Berapa lama estimasi tunggu
- Stage mana yang lagi running (think / fetch data / format reply)

Selain itu, **tidak ada data terukur** soal di mana waktu actual
spent — apakah bottleneck di network ke OpenClaw, di LLM call, atau
di MCP tool calls. Tanpa data, optimisasi blind.

## 2. Goals (Phase 1)

1. **Measure** — capture timestamp per stage di server-side, simpan
   persistent supaya bisa di-query kapan aja.
2. **Improve perceived speed** — pill kasih progressive feedback
   selama "thinking" state, gak diem mati-matian.
3. **Display latency** ke user di chat panel drawer per row, biar
   awareness build naturally.

## 3. Non-goals (Phase 1)

- **Approach C** (actual speed reduction) — pre-fetch context, MCP
  caching, parallel tool calls, faster LLM model. Defer sampai data
  tersedia.
- **Streaming progress dari Liana** — butuh changes di OpenClaw side,
  out of scope.
- **Persistent analytics page** — SQL Editor di Supabase cukup untuk
  personal usage. Build proper analytics page nanti kalau perlu.

## 4. Architecture overview

```
┌──────────┐   POST /ask    ┌──────────┐   forward   ┌──────────┐
│ Browser  │ ─────────────> │ Vercel   │ ──────────> │ OpenClaw │
│ (Pill)   │                │ /api/    │             │ (Liana)  │
└──────────┘                │ liana/   │             └──────────┘
     ▲                      │ ask      │                  │
     │ Realtime              └──────────┘                  │ POST /run-callback
     │                            │                        ▼
     │                            │                  ┌──────────┐
     │                            └─────────────────>│ Vercel   │
     │                                               │ /api/    │
     │                                               │ liana/   │
     │                                               │ run-     │
     │                                               │ callback │
     │                                               └──────────┘
     │ UPDATE event                                        │
     └─────────────────────────────────────────────────────┘
                                  │
                                  ▼
                          ┌──────────────┐
                          │ Supabase DB  │
                          │  liana_runs  │
                          └──────────────┘
```

Stages yang kita ukur (kolom di `liana_runs`):

| Stage | Column | Set by |
|---|---|---|
| Request received | `created_at` (existing) | `insertPendingRun` |
| Forwarded to OpenClaw | `forwarded_at` (NEW) | `/api/liana/ask` after `askLiana()` success |
| Reply delivered | `delivered_at` (existing) | `/api/liana/run-callback` |

Computed metrics:

- `forward_latency` = `forwarded_at` − `created_at` (network ke OpenClaw)
- `llm_latency` = `delivered_at` − `forwarded_at` (Liana process — LLM + tools)
- `total_latency` = `delivered_at` − `created_at` (end-to-end)

## 5. Section 1: Server-side instrumentation

### 5.1 Schema change

Migration `0009_liana_runs_forwarded_at.sql`:

```sql
alter table public.liana_runs
  add column if not exists forwarded_at timestamptz;
```

Idempotent (uses `if not exists`). Manual apply ke prod via SQL Editor
seperti migration 0008.

### 5.2 Helper update

`lib/finance/liana/runs.ts`:

- **Replace** `attachRunIdToRun({ id, runId })` dengan
  `markRunForwarded({ id, runId, forwardedAt })` yang set both
  `run_id` and `forwarded_at` dalam single UPDATE.

```ts
export async function markRunForwarded(params: {
  id: string;
  runId: string;
  forwardedAt: string;  // ISO string
}): Promise<void> { ... }
```

Tetep best-effort (log error, jangan throw) — gak ngeganggu happy path.

### 5.3 API call site

`app/api/liana/ask/route.ts`:

```ts
// Sebelum
await attachRunIdToRun({ id: run.id, runId: result.runId });

// Sesudah
await markRunForwarded({
  id: run.id,
  runId: result.runId,
  forwardedAt: new Date().toISOString(),
});
```

### 5.4 Display

`components/liana/chat-panel.tsx` per-row footer:

```
[Selesai] 6 menit lalu  •  total 8.3s (LLM 7.1s, network 1.2s)
```

Format helper di `lib/finance/liana/format.ts`:

```ts
export function formatLatencyBreakdown(run: LianaRun): string | null {
  if (!run.forwarded_at || !run.delivered_at) return null;
  const total = (Date.parse(run.delivered_at) - Date.parse(run.created_at)) / 1000;
  const llm = (Date.parse(run.delivered_at) - Date.parse(run.forwarded_at)) / 1000;
  const net = (Date.parse(run.forwarded_at) - Date.parse(run.created_at)) / 1000;
  return `total ${total.toFixed(1)}s (LLM ${llm.toFixed(1)}s, network ${net.toFixed(1)}s)`;
}
```

Hanya display kalau `status === "done"` dan ke-2 kolom timestamp ada.
Kalau `status === "error"` atau salah satu null, hide.

## 6. Section 2: Pill progressive UI

### 6.1 Cycling labels

Phase berdasarkan elapsed time (computed dari `pill.createdAt`):

| Elapsed | Label | Icon |
|---|---|---|
| 0–3s | "Liana memikirkan..." | `Brain` |
| 3–8s | "Mengakses data keuangan..." | `Database` |
| 8–15s | "Menyusun struktur jawaban..." | `ListOrdered` |
| 15s+ | "Hampir selesai..." | `Sparkles` |

**Caveat:** ini speculative — gak punya signal real-time dari Liana.
Tapi labels generic enough buat match typical agent flow tanpa
misleading. Kalau Liana super cepat (<3s), user cuma liat label pertama
sebelum pill resolve ke "done".

### 6.2 Animated dots

Text label suffix dengan dots cycling: `"Liana memikirkan."` →
`"Liana memikirkan.."` → `"Liana memikirkan..."` → loop.

Cycle every 500ms. Dots count mod 3 + 1.

### 6.3 Implementation

`components/liana/liana-status-pill.tsx`:

```ts
const [tick, setTick] = React.useState(0);

React.useEffect(() => {
  if (pill.status !== "thinking") return;
  const interval = setInterval(() => setTick((t) => t + 1), 500);
  return () => clearInterval(interval);
}, [pill.status]);

const elapsed = pill.status === "thinking"
  ? Date.now() - pill.createdAt
  : 0;
const phase = elapsedToPhase(elapsed);
const dots = ".".repeat((tick % 3) + 1);
```

Helper `elapsedToPhase(ms)` di `lib/finance/liana/format.ts`:

```ts
export function elapsedToPhase(ms: number): {
  label: string;
  icon: LucideIcon;
} {
  const s = ms / 1000;
  if (s < 3) return { label: "Liana memikirkan", icon: Brain };
  if (s < 8) return { label: "Mengakses data keuangan", icon: Database };
  if (s < 15) return { label: "Menyusun struktur jawaban", icon: ListOrdered };
  return { label: "Hampir selesai", icon: Sparkles };
}
```

Re-renders saat `tick` change → fresh elapsed → fresh phase. Stops
when `pill.status` transitions away dari `"thinking"`.

**Required state addition:** `PillInternal` saat ini gak punya
`createdAt` field (verified — cuma `resolvedAt` yang ada). Perlu add:

```ts
interface PillInternal {
  // ...existing fields...
  createdAt: number;  // Date.now() di addPill callback
}

interface PillView {
  // ...existing fields...
  createdAt: number;  // expose ke pill component
}
```

`addPill` callback set `createdAt: Date.now()` saat insert. `pillsView`
useMemo mapping pass-through `createdAt` ke PillView. `PillStack`
component renders pill dengan `pill.createdAt` accessible.

### 6.4 Chat panel typing dots (bonus)

`components/liana/chat-panel.tsx`:

Untuk row yang `status === "pending"` (belum ada reply), render reply
section dengan animated typing dots, bukan empty placeholder:

```tsx
{run.status === "pending" ? (
  <div className="flex items-center gap-1 text-muted-foreground">
    <span className="text-sm italic">Liana sedang mengetik</span>
    <TypingDots />
  </div>
) : (
  <ReplyText text={run.reply_text} />
)}
```

`TypingDots` component baru di `components/liana/typing-dots.tsx` —
3 dot animasi sequential (similar ke Telegram / WhatsApp typing
indicator). CSS-only animation (gak butuh state).

## 7. Section 3: Implementation order & verification

### 7.1 Implementation order

1. **Migration 0009** — `forwarded_at` column. Apply manual ke prod via SQL Editor.
2. **Backend instrumentation** — `markRunForwarded` helper + `/api/liana/ask` integration.
3. **Display latency** — `formatLatencyBreakdown` + chat panel footer.
4. **Pill cycling labels + dots** — `elapsedToPhase` + `LianaStatusPill` updates.
5. **Chat panel typing dots** — `TypingDots` component + chat panel integration.

Each step ships independently as separate commit.

### 7.2 Manual verification

After deploy step 5:

- **Simple prompt** ("hai") → pill resolve <3s, cuma liat label pertama, latency tampil di chat panel.
- **Medium prompt** ("rekap minggu ini") → pill cycle ke label 2-3, latency ~5-10s.
- **Complex prompt** (multi-step analysis) → pill cycle full ke "Hampir selesai", latency >15s.
- **Error path** — kill OpenClaw VPS sementara, send prompt → pill ke error state, cycling stop, error message tampil. Latency display hidden (status != done).
- **Drawer open** — buka chat panel sambil kirim prompt → row pending dengan typing dots, transition smooth ke reply text saat done.

### 7.3 Phase 2 hand-off (data analysis)

Setelah Phase 1 deployed, user lanjut pakai dashboard normal. Anytime,
run di Supabase SQL Editor:

```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (delivered_at - forwarded_at))) AS avg_llm_s,
  AVG(EXTRACT(EPOCH FROM (forwarded_at - created_at))) AS avg_network_s,
  AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) AS avg_total_s,
  STDDEV(EXTRACT(EPOCH FROM (delivered_at - created_at))) AS stddev_total_s,
  COUNT(*) AS runs
FROM liana_runs
WHERE status = 'done'
  AND created_at > now() - interval '7 days'
  AND forwarded_at IS NOT NULL;
```

Share output → decide Phase 2 priorities:

| Pattern | Phase 2 priority |
|---|---|
| LLM > 10s avg | Prompt size reduction, tool parallelization, model swap |
| Network > 3s avg | Region check (OpenClaw VPS vs Vercel edge) |
| Wide stddev (variance) | MCP tool caching for repeat queries |
| Total < 5s consistently | Phase 2 not needed; ship as-is |

## 8. Files touched

| File | Change |
|---|---|
| `supabase/migrations/0009_liana_runs_forwarded_at.sql` | NEW migration |
| `lib/finance/liana/runs.ts` | Replace `attachRunIdToRun` → `markRunForwarded` |
| `app/api/liana/ask/route.ts` | Use new helper, pass `forwardedAt` |
| `lib/finance/liana/format.ts` | NEW `formatLatencyBreakdown`, `elapsedToPhase` |
| `components/liana/liana-ui-context.tsx` | Add `createdAt` to `PillInternal` + `PillView`, set in `addPill`, pass through in `pillsView` |
| `components/liana/liana-status-pill.tsx` | Cycling labels + animated dots (uses `pill.createdAt`) |
| `components/liana/chat-panel.tsx` | Latency footer + typing dots for pending |
| `components/liana/typing-dots.tsx` | NEW component |

## 9. Risk & mitigation

| Risk | Mitigation |
|---|---|
| Migration 0009 not applied to prod | Same drill as 0008 — user runs ALTER manually di SQL Editor. Idempotent. |
| `forwarded_at` update fails silently | Helper logs error but doesn't throw. Latency display hides if column null. Run still completes normally. |
| Cycling labels misleading user | Caveat documented. Labels generic. Future: real progress events from Liana (Phase 3+). |
| Pill `createdAt` stale across sessions | Pill state local to React; reset on page reload. No persistence concern. |
| Test coverage gaps | Manual test plan in §7.2 covers happy + edge paths. |

## 10. Open questions

None — all clarified during brainstorming. Sections 1–3 approved by user.

---

**Next step:** Invoke `writing-plans` skill untuk generate detailed
implementation plan dari design ini.
