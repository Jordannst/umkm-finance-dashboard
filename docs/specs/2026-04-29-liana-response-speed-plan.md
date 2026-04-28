# Liana Response Speed — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture per-stage latency in `liana_runs`, display breakdown to user, and replace static "menyusun jawaban" with progressive cycling labels + animated typing dots so the wait feels active.

**Architecture:** Add `forwarded_at timestamptz` column to `liana_runs` (server-side instrumentation). Display computed latency breakdown (`network`, `LLM`, `total`) in chat panel drawer per row. Extend pill state with `createdAt`, drive cycling status labels from elapsed time. Add `TypingDots` component for in-flight rows in chat panel.

**Tech Stack:** Next.js 15 (App Router) + React 19, Supabase (Postgres + Realtime + RLS), TailwindCSS, shadcn/ui, Lucide icons. No unit test framework configured — verification via `npm run lint`, `npx tsc --noEmit`, and manual UI smoke test.

**Spec:** `docs/specs/2026-04-29-liana-response-speed-design.md`

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `supabase/migrations/0009_liana_runs_forwarded_at.sql` | NEW | Add `forwarded_at` column (idempotent) |
| `lib/finance/liana/runs.ts` | MODIFY | Replace `attachRunIdToRun` → `markRunForwarded` (sets both `run_id` + `forwarded_at` in one UPDATE) |
| `app/api/liana/ask/route.ts` | MODIFY | Use `markRunForwarded` after `askLiana()` succeeds |
| `lib/finance/liana/format.ts` | MODIFY (or NEW if absent) | Add `formatLatencyBreakdown(run)` and `elapsedToPhase(ms)` helpers |
| `components/liana/liana-ui-context.tsx` | MODIFY | Add `createdAt: number` to `PillInternal` + `PillView`, set in `addPill`, pass through in `pillsView` |
| `components/liana/liana-status-pill.tsx` | MODIFY | Cycling labels via `elapsedToPhase` + animated dots |
| `components/liana/typing-dots.tsx` | NEW | Reusable 3-dot CSS-animated typing indicator |
| `components/liana/chat-panel.tsx` | MODIFY | Latency footer for done rows + typing dots for pending rows |

---

## Task 1: Migration 0009 — `forwarded_at` column

**Files:**
- Create: `supabase/migrations/0009_liana_runs_forwarded_at.sql`

**Goal:** Add `forwarded_at timestamptz` to `liana_runs` so we can timestamp when OpenClaw accepts the request.

- [ ] **Step 1: Create migration file**

```sql
-- =====================================================================
-- 0009_liana_runs_forwarded_at.sql
--
-- Add forwarded_at column ke liana_runs. Di-set saat /api/liana/ask
-- berhasil forward request ke OpenClaw (sebelum LLM mulai proses).
--
-- Computed metrics (di chat panel + Supabase SQL):
--   forward_latency = forwarded_at - created_at
--   llm_latency     = delivered_at - forwarded_at
--   total_latency   = delivered_at - created_at
--
-- Nullable: row baru created (status=pending) belum punya forwarded_at;
-- runs yang sudah selesai sebelum migration ini juga akan punya nilai null.
--
-- IDEMPOTENT: pakai `if not exists`. Aman dijalankan berulang.
-- =====================================================================

alter table public.liana_runs
  add column if not exists forwarded_at timestamptz;

comment on column public.liana_runs.forwarded_at is
  'Saat OpenClaw return success di /hooks/agent (sebelum Liana proses LLM). Dipakai untuk hitung network vs LLM latency.';

do $$
begin
  raise notice '[0009] forwarded_at column added to liana_runs';
end $$;
```

- [ ] **Step 2: Verify migration is syntactically valid**

Run: `cat supabase/migrations/0009_liana_runs_forwarded_at.sql`
Expected: file content readable, no shell syntax errors.

- [ ] **Step 3: Document manual apply step**

The migration must be applied to production manually (same drill as 0008):

```sql
-- Run di Supabase SQL Editor production:
ALTER TABLE public.liana_runs ADD COLUMN IF NOT EXISTS forwarded_at timestamptz;
```

User runs this when ready to deploy. No automated apply pipeline configured.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_liana_runs_forwarded_at.sql
git commit -m "feat(liana): migration 0009 add forwarded_at to liana_runs

Captures the moment OpenClaw accepts the forwarded prompt (before
Liana's LLM processing starts). Together with existing created_at
and delivered_at, allows breaking down end-to-end latency into:
- forward_latency = forwarded_at - created_at (network)
- llm_latency = delivered_at - forwarded_at (Liana)
- total_latency = delivered_at - created_at (E2E)

Migration is idempotent (uses 'if not exists'). Apply manually
to production via SQL Editor."
```

---

## Task 2: Replace `attachRunIdToRun` with `markRunForwarded`

**Files:**
- Modify: `lib/finance/liana/runs.ts`

**Goal:** Single helper that sets BOTH `run_id` and `forwarded_at` in one UPDATE. Eliminates a useless intermediate state and matches new column semantics.

- [ ] **Step 1: Read existing helper**

Open `lib/finance/liana/runs.ts`. Locate the `attachRunIdToRun` function (around lines 65–77). Confirm signature:

```ts
export async function attachRunIdToRun(params: {
  id: string;
  runId: string;
}): Promise<void>
```

- [ ] **Step 2: Replace with `markRunForwarded`**

Change the function body to:

```ts
/**
 * Set runId + forwarded_at setelah berhasil forward ke OpenClaw.
 * Status tetap 'pending' sampai callback masuk.
 *
 * Single UPDATE supaya kedua kolom konsisten di Realtime payload
 * (gak ada interim state dengan run_id tapi forwarded_at masih null).
 */
export async function markRunForwarded(params: {
  id: string;
  runId: string;
  forwardedAt: string;  // ISO string, biasanya new Date().toISOString()
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("liana_runs")
    .update({
      run_id: params.runId,
      forwarded_at: params.forwardedAt,
    })
    .eq("id", params.id);
  if (error) {
    console.error("[liana_runs.markRunForwarded]:", error.message);
  }
}
```

Delete the old `attachRunIdToRun` function entirely.

- [ ] **Step 3: Update `LianaRun` type to include `forwarded_at`**

In the same file, find the `LianaRun` interface (around line 18). Add `forwarded_at`:

```ts
export interface LianaRun {
  id: string;
  business_id: string;
  user_id: string;
  run_id: string | null;
  prompt: string;
  reply_text: string | null;
  reply_format: "plain" | "markdown";
  status: LianaRunStatus;
  error_message: string | null;
  delivered_at: string | null;
  forwarded_at: string | null;  // NEW
  created_at: string;
}
```

- [ ] **Step 4: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: lint passes (exit 0). tsc errors are EXPECTED at this point (call sites of `attachRunIdToRun` not updated yet) — Task 3 fixes this.

- [ ] **Step 5: Commit (defer until Task 3 completes)**

DO NOT commit yet — `attachRunIdToRun` is referenced in `app/api/liana/ask/route.ts` and removing it without updating the call site breaks the build. Continue to Task 3.

---

## Task 3: Update `/api/liana/ask` to call `markRunForwarded`

**Files:**
- Modify: `app/api/liana/ask/route.ts`

**Goal:** Update the only call site of `attachRunIdToRun` to use the new helper. Pass `forwardedAt` as ISO timestamp.

- [ ] **Step 1: Update import**

In `app/api/liana/ask/route.ts`, find the import block at the top:

```ts
import {
  attachRunIdToRun,
  insertPendingRun,
  markRunError,
} from "@/lib/finance/liana/runs";
```

Change to:

```ts
import {
  insertPendingRun,
  markRunError,
  markRunForwarded,
} from "@/lib/finance/liana/runs";
```

- [ ] **Step 2: Update the call site**

Find the line near the end of the file (around line 184):

```ts
// 8. Link runId dari OpenClaw ke row liana_runs (best effort, non-blocking).
await attachRunIdToRun({ id: run.id, runId: result.runId });
```

Replace with:

```ts
// 8. Mark run as forwarded — set both run_id (link ke OpenClaw)
//    dan forwarded_at (timestamp untuk network vs LLM latency split).
//    Best effort, non-blocking: kalau gagal, run tetep complete normally,
//    cuma latency display nya akan hide karena forwarded_at null.
await markRunForwarded({
  id: run.id,
  runId: result.runId,
  forwardedAt: new Date().toISOString(),
});
```

- [ ] **Step 3: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: lint passes (exit 0). tsc passes (exit 0).

- [ ] **Step 4: Commit Task 2 + Task 3 together**

```bash
git add lib/finance/liana/runs.ts app/api/liana/ask/route.ts
git commit -m "feat(liana): markRunForwarded sets run_id + forwarded_at atomically

Replaces attachRunIdToRun. Single UPDATE keeps the two columns
consistent in Realtime payloads (no interim state with run_id set
but forwarded_at still null).

LianaRun type now includes forwarded_at: string | null."
```

---

## Task 4: Add `formatLatencyBreakdown` helper + display in chat panel

**Files:**
- Modify (or Create if absent): `lib/finance/liana/format.ts`
- Modify: `components/liana/chat-panel.tsx`

**Goal:** Render `total 8.3s (LLM 7.1s, network 1.2s)` in the chat panel drawer for each completed run.

- [ ] **Step 1: Check if format.ts exists**

Run: `ls lib/finance/liana/format.ts 2>/dev/null && echo EXISTS || echo NEW`

If EXISTS: open the file, add new helper. If NEW: create it.

- [ ] **Step 2: Add `formatLatencyBreakdown`**

Add this exported function to `lib/finance/liana/format.ts`. If the file doesn't exist, create it with this content (plus standard imports):

```ts
import type { LianaRun } from "./runs";

/**
 * Render breakdown latency dari liana_run timestamps. Hanya return
 * string kalau run sukses + ke-3 timestamp ada (created/forwarded/delivered).
 *
 * Format: "total 8.3s (LLM 7.1s, network 1.2s)"
 *
 * Return null untuk:
 *   - status != 'done' (gak ada delivered_at)
 *   - forwarded_at null (run lama sebelum migration 0009)
 *   - parse error (timestamp invalid)
 */
export function formatLatencyBreakdown(run: LianaRun): string | null {
  if (run.status !== "done") return null;
  if (!run.forwarded_at || !run.delivered_at) return null;

  const created = Date.parse(run.created_at);
  const forwarded = Date.parse(run.forwarded_at);
  const delivered = Date.parse(run.delivered_at);

  if (Number.isNaN(created) || Number.isNaN(forwarded) || Number.isNaN(delivered)) {
    return null;
  }

  const totalSec = (delivered - created) / 1000;
  const llmSec = (delivered - forwarded) / 1000;
  const networkSec = (forwarded - created) / 1000;

  return `total ${totalSec.toFixed(1)}s (LLM ${llmSec.toFixed(1)}s, network ${networkSec.toFixed(1)}s)`;
}
```

- [ ] **Step 3: Locate chat panel row footer**

Open `components/liana/chat-panel.tsx`. Find the section that renders each run row's metadata (status badge + relative time). It typically looks like:

```tsx
<div className="...">
  <StatusBadge status={run.status} />
  <span className="text-xs text-muted-foreground">
    {formatRelativeTime(run.created_at)}
  </span>
</div>
```

- [ ] **Step 4: Add latency display next to relative time**

Update the metadata row to include latency breakdown when available:

```tsx
<div className="flex items-center gap-2 text-xs text-muted-foreground">
  <StatusBadge status={run.status} />
  <span>{formatRelativeTime(run.created_at)}</span>
  {(() => {
    const breakdown = formatLatencyBreakdown(run);
    return breakdown ? (
      <>
        <span aria-hidden>•</span>
        <span title="Network = dashboard ke OpenClaw. LLM = Liana memproses.">
          {breakdown}
        </span>
      </>
    ) : null;
  })()}
</div>
```

The `title` tooltip clarifies meaning of "LLM" vs "network" on hover.

- [ ] **Step 5: Add import**

At the top of `components/liana/chat-panel.tsx`, add:

```ts
import { formatLatencyBreakdown } from "@/lib/finance/liana/format";
```

- [ ] **Step 6: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 7: Manual smoke test**

After deploy:
1. Open chat panel drawer.
2. New runs (post-migration) should show `total X.Xs (LLM Y.Ys, network Z.Zs)` next to the relative time.
3. Old runs (pre-migration, no `forwarded_at`) should show only relative time, no latency.

- [ ] **Step 8: Commit**

```bash
git add lib/finance/liana/format.ts components/liana/chat-panel.tsx
git commit -m "feat(liana): display latency breakdown in chat panel drawer

Shows 'total 8.3s (LLM 7.1s, network 1.2s)' per completed run row,
helping the user see at a glance whether slowness is in the network
hop to OpenClaw or in Liana's LLM/tool processing.

Hidden for runs without forwarded_at (legacy or in-flight)."
```

---

## Task 5: Add `createdAt` to `PillInternal` + `PillView`

**Files:**
- Modify: `components/liana/liana-ui-context.tsx`

**Goal:** Pill state needs to know when it was created so the cycling labels can compute elapsed time. Without this, Task 6 has nothing to anchor against.

- [ ] **Step 1: Add `createdAt` to `PillInternal`**

In `components/liana/liana-ui-context.tsx`, find the `PillInternal` interface (around line 27):

```ts
interface PillInternal {
  clientId: string;
  prompt: string;
  runId: string | null;
  resolvedAt: number | null;
  errorOverride: { message: string; at: number } | null;
  hovered: boolean;
}
```

Add `createdAt`:

```ts
interface PillInternal {
  clientId: string;
  prompt: string;
  runId: string | null;
  /** Saat pill di-add (Date.now()). Dipakai untuk compute elapsed time
   *  driving cycling status labels saat status='thinking'. */
  createdAt: number;
  resolvedAt: number | null;
  errorOverride: { message: string; at: number } | null;
  hovered: boolean;
}
```

- [ ] **Step 2: Add `createdAt` to `PillView`**

Find `PillView` interface (around line 15):

```ts
export interface PillView {
  clientId: string;
  promptPreview: string;
  runId: string | null;
  status: PillStatus;
  errorMessage: string | null;
  hovered: boolean;
}
```

Add `createdAt`:

```ts
export interface PillView {
  clientId: string;
  /** Saat pill di-add (Date.now()). Dipakai pill component buat
   *  compute elapsed time → cycling status labels. */
  createdAt: number;
  promptPreview: string;
  runId: string | null;
  status: PillStatus;
  errorMessage: string | null;
  hovered: boolean;
}
```

- [ ] **Step 3: Set `createdAt` in `addPill`**

Find `addPill` callback (around line 177). The function currently looks like:

```ts
const addPill = React.useCallback((prompt: string): string => {
  const clientId = makeClientId();
  setPills((prev) => {
    const next: PillInternal = {
      clientId,
      prompt,
      runId: null,
      resolvedAt: null,
      errorOverride: null,
      hovered: false,
    };
    // ...rest of the function...
  });
  return clientId;
}, []);
```

Update the `next` object to include `createdAt: Date.now()`:

```ts
const next: PillInternal = {
  clientId,
  prompt,
  runId: null,
  createdAt: Date.now(),  // NEW
  resolvedAt: null,
  errorOverride: null,
  hovered: false,
};
```

- [ ] **Step 4: Pass-through `createdAt` in `pillsView` mapping**

Find the `pillsView` `useMemo` (around line 235):

```ts
const pillsView: PillView[] = React.useMemo(
  () =>
    pills.map((p) => {
      const status = derivePillStatus(p, runs);
      const errorMessage = deriveErrorMessage(p, runs);
      return {
        clientId: p.clientId,
        promptPreview: previewPrompt(p.prompt),
        runId: p.runId,
        status,
        errorMessage,
        hovered: p.hovered,
      };
    }),
  [pills, runs],
);
```

Add `createdAt: p.createdAt` to the returned object:

```ts
return {
  clientId: p.clientId,
  createdAt: p.createdAt,  // NEW pass-through
  promptPreview: previewPrompt(p.prompt),
  runId: p.runId,
  status,
  errorMessage,
  hovered: p.hovered,
};
```

- [ ] **Step 5: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0. Pill consumers don't yet read `createdAt`, but adding the field is non-breaking.

- [ ] **Step 6: Commit**

```bash
git add components/liana/liana-ui-context.tsx
git commit -m "feat(liana): add createdAt to PillInternal + PillView

Prerequisite for elapsed-time-driven cycling status labels in the
pill stack. Set in addPill, passed through pillsView. Existing pill
consumers unaffected (additive field)."
```

---

## Task 6: `elapsedToPhase` helper + cycling labels in `LianaStatusPill`

**Files:**
- Modify: `lib/finance/liana/format.ts`
- Modify: `components/liana/liana-status-pill.tsx`

**Goal:** Replace the static "Liana sedang menyusun jawaban" with phase-based labels that change every few seconds, plus animated trailing dots.

- [ ] **Step 1: Add `elapsedToPhase` to format.ts**

Append to `lib/finance/liana/format.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { Brain, Database, ListOrdered, Sparkles } from "lucide-react";

export interface PillPhase {
  label: string;
  icon: LucideIcon;
}

/**
 * Map elapsed time (ms sejak pill dibuat) ke phase label + icon.
 *
 * Speculative — kita gak punya signal real-time dari Liana, jadi labels
 * di-pick generic enough buat match typical agent flow tanpa mislead user.
 *
 * Rentang dipilih berdasarkan pengamatan empiris flow Liana (think →
 * fetch context → format → finalize). Akan di-tune ulang setelah Phase 2
 * data analysis.
 */
export function elapsedToPhase(elapsedMs: number): PillPhase {
  const s = elapsedMs / 1000;
  if (s < 3) return { label: "Liana memikirkan", icon: Brain };
  if (s < 8) return { label: "Mengakses data keuangan", icon: Database };
  if (s < 15) return { label: "Menyusun struktur jawaban", icon: ListOrdered };
  return { label: "Hampir selesai", icon: Sparkles };
}
```

If the imports section of `format.ts` already imports lucide-react, merge the imports — don't duplicate.

- [ ] **Step 2: Locate the thinking-state render in `LianaStatusPill`**

Open `components/liana/liana-status-pill.tsx`. Find the branch that handles `status === "thinking"`. It typically renders an icon + a static text like "Liana sedang menyusun jawaban".

- [ ] **Step 3: Add tick state for cycling**

At the top of the pill component (after existing hooks):

```tsx
const [tick, setTick] = React.useState(0);

React.useEffect(() => {
  if (pill.status !== "thinking") return;
  const interval = setInterval(() => {
    setTick((t) => t + 1);
  }, 500);
  return () => clearInterval(interval);
}, [pill.status]);
```

This triggers a re-render every 500ms WHILE status is `"thinking"`, and stops cleanly when status transitions away.

- [ ] **Step 4: Compute phase + dots in render**

Replace the static thinking-state body with phase-driven content:

```tsx
{pill.status === "thinking" && (() => {
  const elapsed = Date.now() - pill.createdAt;
  const phase = elapsedToPhase(elapsed);
  const PhaseIcon = phase.icon;
  const dots = ".".repeat((tick % 3) + 1);
  return (
    <div className="flex items-center gap-2">
      <PhaseIcon className="size-4 animate-pulse" aria-hidden />
      <span className="text-sm">
        {phase.label}
        <span className="inline-block w-6 text-left">{dots}</span>
      </span>
    </div>
  );
})()}
```

The `<span className="inline-block w-6 text-left">` reserves fixed width for dots so the label text doesn't shift left/right as dots cycle 1→2→3→1.

- [ ] **Step 5: Add import**

At the top of `liana-status-pill.tsx`, add:

```ts
import { elapsedToPhase } from "@/lib/finance/liana/format";
```

- [ ] **Step 6: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 7: Manual smoke test**

After deploy:
1. Click "Tanya Liana" with a slow-ish prompt (e.g., "rekap minggu ini detail").
2. Watch pill — should cycle through "Liana memikirkan" → "Mengakses data keuangan" → "Menyusun struktur jawaban" as time passes.
3. Dots should animate 1 → 2 → 3 → 1 every 500ms.
4. Label/icon should snap to a static "done" state when reply arrives.
5. For fast prompts (<3s), only first label is seen briefly.

- [ ] **Step 8: Commit**

```bash
git add lib/finance/liana/format.ts components/liana/liana-status-pill.tsx
git commit -m "feat(liana): cycling phase labels + animated dots in pill

Replaces static 'Liana sedang menyusun jawaban' with phase-aware
labels that progress over time:
  0-3s:  Liana memikirkan
  3-8s:  Mengakses data keuangan
  8-15s: Menyusun struktur jawaban
  15s+:  Hampir selesai

Each label has its own Lucide icon and animates trailing dots
(1 → 2 → 3 → 1) every 500ms while status is 'thinking'. Tick
interval clears immediately when status transitions to done/error.

Labels are speculative (no real-time signal from Liana) but
match typical agent flow. Will tune ranges once Phase 2 latency
data is in."
```

---

## Task 7: `TypingDots` component

**Files:**
- Create: `components/liana/typing-dots.tsx`

**Goal:** Reusable 3-dot CSS-animated typing indicator for use in pill (Task 6 already uses string-based dots; this is for chat panel pending rows in Task 8).

- [ ] **Step 1: Create the component**

Create `components/liana/typing-dots.tsx`:

```tsx
import { cn } from "@/lib/utils";

interface TypingDotsProps {
  className?: string;
  /** Tailwind size class for individual dot. Default 'size-1.5'. */
  dotClassName?: string;
}

/**
 * Animated 3-dot typing indicator (à la Telegram / WhatsApp).
 * CSS-only animation — no React state, no JS timer. Renders as
 * an inline-flex span so it sits naturally next to text.
 *
 * Usage:
 *   <span>Liana sedang mengetik <TypingDots /></span>
 */
export function TypingDots({ className, dotClassName }: TypingDotsProps) {
  return (
    <span
      className={cn("inline-flex items-end gap-0.5", className)}
      aria-label="sedang mengetik"
      role="status"
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current animate-bounce",
          "[animation-delay:-0.3s]",
          dotClassName,
        )}
      />
      <span
        className={cn(
          "size-1.5 rounded-full bg-current animate-bounce",
          "[animation-delay:-0.15s]",
          dotClassName,
        )}
      />
      <span
        className={cn(
          "size-1.5 rounded-full bg-current animate-bounce",
          dotClassName,
        )}
      />
    </span>
  );
}
```

The three dots use Tailwind's `animate-bounce` with staggered `animation-delay` values to create the classic typing-indicator effect.

- [ ] **Step 2: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/liana/typing-dots.tsx
git commit -m "feat(liana): TypingDots component (CSS-only animated 3-dot indicator)

Reusable 3-dot typing indicator using staggered animate-bounce
delays. Pure CSS, no React state. Used in chat panel for pending
liana_runs rows (next commit) — clearer signal that the row is
in-flight than a static skeleton."
```

---

## Task 8: Chat panel typing dots for pending rows

**Files:**
- Modify: `components/liana/chat-panel.tsx`

**Goal:** When the user has the chat panel drawer open and a run is `status === "pending"` (no reply yet), render a `Liana sedang mengetik <TypingDots />` placeholder instead of an empty space.

- [ ] **Step 1: Read the chat panel file end-to-end**

Run: `cat components/liana/chat-panel.tsx | head -200`

Capture the EXACT JSX for the reply rendering — note the wrapping element, its className verbatim, and any existing branches for error state. The plan below assumes this section currently looks roughly like:

```tsx
{run.reply_text && (
  <div className="rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
    <ReplyText text={run.reply_text} format={run.reply_format} />
  </div>
)}
```

If your file's className differs, **use whatever className is actually there** — do not invent a new one. The visual styling for the done branch must remain unchanged.

- [ ] **Step 2: Replace with status-aware branching**

Substitute `EXISTING_REPLY_CLASSES` below with the literal className string you captured in Step 1. This handles three cases: `pending` (typing dots), `done` (reply text), `error` (preserved if already handled separately above):

```tsx
{run.status === "pending" ? (
  <div className="flex items-center gap-2 text-muted-foreground italic">
    <span className="text-sm">Liana sedang mengetik</span>
    <TypingDots />
  </div>
) : run.status === "done" && run.reply_text ? (
  <div className="EXISTING_REPLY_CLASSES">
    <ReplyText text={run.reply_text} format={run.reply_format} />
  </div>
) : null}
```

If the existing code handles the error branch separately (e.g., showing `run.error_message` in an Alert), preserve that branch UNCHANGED — only modify the conditional that renders the reply text. The new pending branch should appear ALONGSIDE any existing error branch, not replacing it.

- [ ] **Step 3: Add import**

At the top of `components/liana/chat-panel.tsx`, add:

```ts
import { TypingDots } from "./typing-dots";
```

- [ ] **Step 4: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 5: Manual smoke test**

After deploy:
1. Open chat panel drawer.
2. From the dashboard, click "Tanya Liana" — drawer should now show a new row with the prompt and `Liana sedang mengetik` + animated dots.
3. When Liana replies, the dots should be replaced by the rendered reply text.

- [ ] **Step 6: Commit**

```bash
git add components/liana/chat-panel.tsx
git commit -m "feat(liana): typing dots for pending rows in chat panel

When the drawer is open and a run is still pending (Realtime/poll
hasn't transitioned it to done yet), render 'Liana sedang mengetik'
with the TypingDots indicator instead of an empty placeholder.

Provides feedback symmetric to the pill: pill shows global progress
at the bottom, drawer shows per-row progress when expanded."
```

---

## Task 9: Final verification

**Files:**
- None (smoke testing only)

- [ ] **Step 1: Push all commits to main**

```bash
git push
```

Wait ~1-2 minutes for Vercel to build + deploy.

- [ ] **Step 2: Apply migration 0009 to production**

Open Supabase SQL Editor for the production project. Run:

```sql
ALTER TABLE public.liana_runs
  ADD COLUMN IF NOT EXISTS forwarded_at timestamptz;
```

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify column exists**

Still in SQL Editor, run:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'liana_runs'
  AND column_name = 'forwarded_at';
```

Expected: 1 row with `forwarded_at | timestamp with time zone | YES`.

- [ ] **Step 4: End-to-end smoke test**

1. Hard refresh dashboard (Ctrl+Shift+R).
2. Open chat panel drawer (FAB bottom-right).
3. Click "Tanya Liana" with prompt: "rekap pemasukan minggu ini, kasih saran singkat."
4. Verify pill cycles through phase labels with animated dots.
5. Verify drawer shows new row with `Liana sedang mengetik <TypingDots />`.
6. Wait for Liana reply.
7. Verify pill transitions to green "Liana sudah balas" with sparkle.
8. Verify drawer row replaces typing dots with rendered reply text.
9. Verify drawer row footer shows `total X.Xs (LLM Y.Ys, network Z.Zs)`.

- [ ] **Step 5: Run latency aggregation query (Phase 2 prep)**

After 5+ runs, in SQL Editor:

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

Share output. This determines Phase 2 priorities (per spec §7.3).

---

## Self-review checklist (filled by author)

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| §5.1 Schema change | Task 1 |
| §5.2 Helper update | Task 2 |
| §5.3 API call site | Task 3 |
| §5.4 Display | Task 4 |
| §6.1 Cycling labels | Task 6 |
| §6.2 Animated dots | Task 6 (string-based in pill) + Task 7 (CSS component) |
| §6.3 Implementation (createdAt) | Task 5 |
| §6.4 Chat panel typing dots | Task 7 + Task 8 |
| §7.1 Implementation order | Tasks 1–8 in order |
| §7.2 Manual verification | Task 9 (steps 4–5) |

No spec gaps.

**Placeholder scan:** No "TBD", "TODO", or "implement later" placeholders. All steps include actual code or commands.

**Type consistency:**
- `markRunForwarded` signature in Task 2 matches call site in Task 3. ✓
- `forwarded_at: string | null` in `LianaRun` (Task 2) matches access in `formatLatencyBreakdown` (Task 4). ✓
- `createdAt: number` added to `PillInternal` (Task 5) matches `Date.now() - pill.createdAt` in pill (Task 6). ✓
- `pill.createdAt` accessed via `PillView` (which Task 5 also extends). ✓
- `elapsedToPhase` return type `PillPhase` consistent in helper (Task 6) and consumer (Task 6). ✓
- `TypingDots` props in Task 7 match usage in Task 8. ✓
