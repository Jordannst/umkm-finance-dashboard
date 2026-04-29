# Liana LLM Speed — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument MCP server + API routes with timing logs to diagnose where the 40s LLM time goes, then execute model swap (GPT-5.5 → GPT-5.4 mini at OpenClaw side) and validate via 5-prompt suite.

**Architecture:** Add lightweight `console.error`/`console.log` timing per tool call (MCP) and per handler (API). Shared helper `withTiming<T>()` keeps wrap pattern DRY. Validation phase = 5 standardized prompts run pre/post swap, captured in markdown table.

**Tech Stack:** Next.js 16 (App Router) + React 19, Supabase (Postgres), Node.js MCP server (stdio transport), OpenAI hosted models (configured at OpenClaw side). No unit test framework — verification via `npm run lint`, `npx tsc --noEmit`, `npm run build`, and manual smoke tests reading Vercel + OpenClaw logs.

**Spec:** `docs/specs/2026-04-29-liana-llm-speed-design.md`

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `lib/api/instrument.ts` | NEW | `withTiming<T>()` + `withTimingSync<T>()` helpers — pure timing wrappers, no logging side-effects |
| `app/api/liana/recap/route.ts` | MODIFY | Wrap auth + DB call with timing, log start + summary lines |
| `app/api/liana/finance-input/route.ts` | MODIFY | Wrap auth + business check + category lookup + insert with timing, log summary |
| `app/api/liana/receivable-input/route.ts` | MODIFY | Wrap auth + business check + category lookup + insert with timing, log summary |
| `app/api/liana/receivable-payment/route.ts` | MODIFY | Wrap auth + business check + receivable lookup + RPC call with timing, log summary |
| `liana-mcp/server.mjs` | MODIFY | Wrap `callApi` + each of 4 tool handlers with timing context (`tool`, `rid`), log start + api_call + total |

**Out of scope:**
- `app/api/liana/health/route.ts` — constant fast, no value
- `app/api/liana/ask/route.ts` — already instrumented via Phase 1 `forwarded_at`
- `app/api/liana/run-callback/route.ts` — different concern (called by OpenClaw, not Liana tools)
- OpenClaw Liana model config — handled by user separately (Section 3 of spec)

---

## Task 1: Create `lib/api/instrument.ts` helper

**Files:**
- Create: `lib/api/instrument.ts`

**Goal:** Pure timing wrappers shared across all instrumented routes. No logging side-effects so call sites stay in control of formatting.

- [ ] **Step 1: Create the helper file**

```ts
/**
 * Helper untuk timing async operations dalam API handler.
 * Pure: hanya measure + return. Logging dilakukan di call site supaya
 * format string konsisten (route name, status code) tetap di handler.
 *
 * Usage:
 *   const { result, durationMs } = await withTiming(() => getLianaRecap(...));
 *   console.log(`[api] route=/api/liana/recap db_ms=${durationMs}`);
 */
export async function withTiming<T>(
  handler: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await handler();
  return { result, durationMs: Date.now() - start };
}

/**
 * Sync variant. Berguna untuk wrap sync operations seperti
 * `verifyLianaAuth` yang return Response | null tanpa Promise.
 */
export function withTimingSync<T>(handler: () => T): {
  result: T;
  durationMs: number;
} {
  const start = Date.now();
  const result = handler();
  return { result, durationMs: Date.now() - start };
}
```

- [ ] **Step 2: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0. No call sites yet — file is standalone.

- [ ] **Step 3: Commit**

```bash
git add lib/api/instrument.ts
git commit -m "feat(api): withTiming + withTimingSync helpers for instrumentation

Pure timing wrappers \u2014 measure async/sync operations and return
{result, durationMs}. Callers handle the logging format so route
identifiers stay where they belong."
```

---

## Task 2: Instrument `/api/liana/recap` route

**Files:**
- Modify: `app/api/liana/recap/route.ts`

**Goal:** Single DB call, simplest route — establish the logging pattern that subsequent tasks copy.

**Target log output:**

```
[api] route=/api/liana/recap start
[api] route=/api/liana/recap auth_ms=1 db_ms=189 total_ms=234 status=200
```

- [ ] **Step 1: Add import**

At the top of `app/api/liana/recap/route.ts`, add the import (alphabetical between `liana-auth` and `responses`):

```ts
import { verifyLianaAuth } from "@/lib/api/liana-auth";
import { apiError, apiOk } from "@/lib/api/responses";
import { withTiming, withTimingSync } from "@/lib/api/instrument";
import {
  ensureBusinessExists,
  getLianaRecap,
  resolveLianaRecapPeriod,
} from "@/lib/finance/liana/queries";
```

(Order: keep existing imports; insert `instrument` import after `responses` since `@/lib/api/*` are grouped together.)

- [ ] **Step 2: Replace handler body with instrumented version**

Replace the entire `export async function GET(request: Request) { ... }` body. The new handler:

```ts
export async function GET(request: Request) {
  const startTotal = Date.now();
  console.log(`[api] route=/api/liana/recap start`);

  const { result: authError, durationMs: authMs } = withTimingSync(() =>
    verifyLianaAuth(request),
  );
  if (authError) {
    console.log(
      `[api] route=/api/liana/recap auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=401`,
    );
    return authError;
  }

  const url = new URL(request.url);
  const businessId = url.searchParams.get("business_id");
  const periodParam = url.searchParams.get("period");

  if (!businessId) {
    console.log(
      `[api] route=/api/liana/recap auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=missing_business_id`,
    );
    return apiError(
      "missing_business_id",
      "Query string `business_id` wajib diisi.",
      400,
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
    console.log(
      `[api] route=/api/liana/recap auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=invalid_business_id`,
    );
    return apiError(
      "invalid_business_id",
      "business_id bukan UUID valid.",
      400,
    );
  }

  const { result: exists, durationMs: existsMs } = await withTiming(() =>
    ensureBusinessExists(businessId),
  );
  if (!exists) {
    console.log(
      `[api] route=/api/liana/recap auth_ms=${authMs} db_ms=${existsMs} total_ms=${Date.now() - startTotal} status=404`,
    );
    return apiError(
      "business_not_found",
      "business_id tidak ditemukan.",
      404,
    );
  }

  const period = resolveLianaRecapPeriod(periodParam);
  const { result: recap, durationMs: recapMs } = await withTiming(() =>
    getLianaRecap(businessId, period),
  );

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/recap auth_ms=${authMs} db_ms=${existsMs + recapMs} total_ms=${totalMs} status=200`,
  );
  return apiOk(recap);
}
```

Key points:
- `db_ms` aggregates `existsMs + recapMs` (both DB ops)
- All early-return paths log a final summary line so we never have orphan "start" entries
- `start` line + summary line per request — easy to grep/aggregate

- [ ] **Step 3: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/api/liana/recap/route.ts
git commit -m "feat(api): instrument /api/liana/recap with timing logs

Logs '[api] route=/api/liana/recap auth_ms=X db_ms=Y total_ms=Z status=N'
per request. Helps narrow down whether 40s Liana latency is in our
DB hop, MCP roundtrip, or LLM processing.

db_ms aggregates ensureBusinessExists + getLianaRecap (2 selects).
Early-return paths still emit a summary line."
```

---

## Task 3: Instrument `/api/liana/finance-input` route

**Files:**
- Modify: `app/api/liana/finance-input/route.ts`

**Goal:** Same pattern as Task 2 but for write path. Aggregate DB time across business check + category lookup + insert.

- [ ] **Step 1: Add import**

At the top of `app/api/liana/finance-input/route.ts`, add `withTiming` + `withTimingSync` import. Insert after the `@/lib/api/responses` import:

```ts
import { verifyLianaAuth } from "@/lib/api/liana-auth";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
import { withTiming, withTimingSync } from "@/lib/api/instrument";
import { todayJakarta } from "@/lib/finance/format";
import {
  ensureBusinessExists,
  lookupCategoryByNameOrSlug,
} from "@/lib/finance/liana/queries";
import { createAdminClient } from "@/lib/supabase/admin";
```

- [ ] **Step 2: Replace handler body**

Replace the entire `export async function POST(request: Request) { ... }` with the instrumented version below. The pattern: track `dbMs` as a running total, accumulating each DB-touching operation.

```ts
export async function POST(request: Request) {
  const startTotal = Date.now();
  console.log(`[api] route=/api/liana/finance-input start`);

  const { result: authError, durationMs: authMs } = withTimingSync(() =>
    verifyLianaAuth(request),
  );
  if (authError) {
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=401`,
    );
    return authError;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=invalid_json`,
    );
    return apiError("invalid_json", "Body request bukan JSON valid.", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=validation_failed`,
    );
    return apiError(
      "validation_failed",
      "Validasi body gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  let dbMs = 0;
  const { result: exists, durationMs: existsMs } = await withTiming(() =>
    ensureBusinessExists(parsed.data.business_id),
  );
  dbMs += existsMs;
  if (!exists) {
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404`,
    );
    return apiError("business_not_found", "business_id tidak ditemukan.", 404);
  }

  let categoryId: string | null = null;
  let categoryName: string | null = parsed.data.category_name ?? null;
  if (parsed.data.category_name) {
    const { result: cat, durationMs: catMs } = await withTiming(() =>
      lookupCategoryByNameOrSlug(
        parsed.data.business_id,
        parsed.data.type,
        parsed.data.category_name as string,
      ),
    );
    dbMs += catMs;
    if (cat) {
      categoryId = cat.id;
      categoryName = cat.name;
    }
  }

  const supabase = createAdminClient();
  const { result: insertResult, durationMs: insertMs } = await withTiming(() =>
    supabase
      .from("transactions")
      .insert({
        business_id: parsed.data.business_id,
        type: parsed.data.type,
        amount: parsed.data.amount,
        category_id: categoryId,
        category_name: categoryName,
        note: parsed.data.note ?? null,
        transaction_date: parsed.data.transaction_date ?? todayJakarta(),
        source: parsed.data.source ?? "chat",
        created_by: parsed.data.created_by ?? "Liana",
      })
      .select(
        "id, business_id, type, amount, category_id, category_name, note, transaction_date, source, created_by, created_at",
      )
      .single(),
  );
  dbMs += insertMs;

  if (insertResult.error) {
    console.error("[liana/finance-input]:", insertResult.error.message);
    console.log(
      `[api] route=/api/liana/finance-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=500 reason=insert_failed`,
    );
    return apiError("insert_failed", insertResult.error.message, 500);
  }

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/finance-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${totalMs} status=201`,
  );
  return apiOk(
    {
      transaction: insertResult.data,
      category_resolved: categoryId !== null,
    },
    201,
  );
}
```

Note: the supabase insert returns `{ data, error }` directly so we destructure from `insertResult` rather than awaiting + checking inline like the original.

- [ ] **Step 3: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/api/liana/finance-input/route.ts
git commit -m "feat(api): instrument /api/liana/finance-input with timing logs

db_ms aggregates ensureBusinessExists + lookupCategory (optional) +
insert. Same shape as /api/liana/recap logs for consistency.

Helps confirm whether write-path latency contributes to the 40s
total Liana time \u2014 expected to be sub-second but worth measuring."
```

---

## Task 4: Instrument `/api/liana/receivable-input` route

**Files:**
- Modify: `app/api/liana/receivable-input/route.ts`

**Goal:** Same pattern. Receivable insert vs transaction insert — different table, similar structure.

- [ ] **Step 1: Add import**

In `app/api/liana/receivable-input/route.ts` add `withTiming` + `withTimingSync`:

```ts
import { verifyLianaAuth } from "@/lib/api/liana-auth";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
import { withTiming, withTimingSync } from "@/lib/api/instrument";
import {
  ensureBusinessExists,
  lookupCategoryByNameOrSlug,
} from "@/lib/finance/liana/queries";
import { createAdminClient } from "@/lib/supabase/admin";
```

- [ ] **Step 2: Replace handler body**

```ts
export async function POST(request: Request) {
  const startTotal = Date.now();
  console.log(`[api] route=/api/liana/receivable-input start`);

  const { result: authError, durationMs: authMs } = withTimingSync(() =>
    verifyLianaAuth(request),
  );
  if (authError) {
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=401`,
    );
    return authError;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=invalid_json`,
    );
    return apiError("invalid_json", "Body request bukan JSON valid.", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=validation_failed`,
    );
    return apiError(
      "validation_failed",
      "Validasi body gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  let dbMs = 0;
  const { result: exists, durationMs: existsMs } = await withTiming(() =>
    ensureBusinessExists(parsed.data.business_id),
  );
  dbMs += existsMs;
  if (!exists) {
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404`,
    );
    return apiError("business_not_found", "business_id tidak ditemukan.", 404);
  }

  let categoryId: string | null = null;
  let categoryName: string | null = parsed.data.category_name ?? null;
  if (parsed.data.category_name) {
    const { result: cat, durationMs: catMs } = await withTiming(() =>
      lookupCategoryByNameOrSlug(
        parsed.data.business_id,
        "receivable",
        parsed.data.category_name as string,
      ),
    );
    dbMs += catMs;
    if (cat) {
      categoryId = cat.id;
      categoryName = cat.name;
    }
  }

  const supabase = createAdminClient();
  const { result: insertResult, durationMs: insertMs } = await withTiming(() =>
    supabase
      .from("receivables")
      .insert({
        business_id: parsed.data.business_id,
        customer_name: parsed.data.customer_name,
        amount: parsed.data.amount,
        paid_amount: 0,
        status: "unpaid",
        category_id: categoryId,
        category_name: categoryName,
        note: parsed.data.note ?? null,
        due_date: parsed.data.due_date ?? null,
        created_from_source: parsed.data.source ?? "chat",
      })
      .select(
        "id, business_id, customer_name, amount, paid_amount, status, category_id, category_name, note, due_date, created_from_source, created_at",
      )
      .single(),
  );
  dbMs += insertMs;

  if (insertResult.error) {
    console.error("[liana/receivable-input]:", insertResult.error.message);
    console.log(
      `[api] route=/api/liana/receivable-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=500 reason=insert_failed`,
    );
    return apiError("insert_failed", insertResult.error.message, 500);
  }

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/receivable-input auth_ms=${authMs} db_ms=${dbMs} total_ms=${totalMs} status=201`,
  );
  return apiOk(
    {
      receivable: insertResult.data,
      category_resolved: categoryId !== null,
    },
    201,
  );
}
```

- [ ] **Step 3: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/api/liana/receivable-input/route.ts
git commit -m "feat(api): instrument /api/liana/receivable-input with timing logs

Mirror of finance-input instrumentation \u2014 timing log per handler
includes auth + business check + optional category lookup +
receivable insert."
```

---

## Task 5: Instrument `/api/liana/receivable-payment` route

**Files:**
- Modify: `app/api/liana/receivable-payment/route.ts`

**Goal:** Multi-step write. Aggregate DB time across business check + receivable lookup-by-name + receivable validation read + RPC call.

- [ ] **Step 1: Add import**

In `app/api/liana/receivable-payment/route.ts`:

```ts
import { verifyLianaAuth } from "@/lib/api/liana-auth";
import {
  apiError,
  apiOk,
  zodIssuesToFieldErrors,
} from "@/lib/api/responses";
import { withTiming, withTimingSync } from "@/lib/api/instrument";
import { todayJakarta } from "@/lib/finance/format";
import {
  ensureBusinessExists,
  findActiveReceivableByCustomerName,
} from "@/lib/finance/liana/queries";
import { createAdminClient } from "@/lib/supabase/admin";
```

- [ ] **Step 2: Replace handler body**

```ts
export async function POST(request: Request) {
  const startTotal = Date.now();
  console.log(`[api] route=/api/liana/receivable-payment start`);

  const { result: authError, durationMs: authMs } = withTimingSync(() =>
    verifyLianaAuth(request),
  );
  if (authError) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=401`,
    );
    return authError;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=invalid_json`,
    );
    return apiError("invalid_json", "Body request bukan JSON valid.", 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} total_ms=${Date.now() - startTotal} status=400 reason=validation_failed`,
    );
    return apiError(
      "validation_failed",
      "Validasi body gagal.",
      400,
      zodIssuesToFieldErrors(parsed.error.issues),
    );
  }

  let dbMs = 0;
  const { result: exists, durationMs: existsMs } = await withTiming(() =>
    ensureBusinessExists(parsed.data.business_id),
  );
  dbMs += existsMs;
  if (!exists) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404`,
    );
    return apiError("business_not_found", "business_id tidak ditemukan.", 404);
  }

  // Resolve receivable_id
  let receivableId = parsed.data.receivable_id ?? null;
  if (!receivableId && parsed.data.customer_name) {
    const { result: found, durationMs: findMs } = await withTiming(() =>
      findActiveReceivableByCustomerName(
        parsed.data.business_id,
        parsed.data.customer_name as string,
      ),
    );
    dbMs += findMs;
    if (!found) {
      console.log(
        `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404 reason=receivable_not_found`,
      );
      return apiError(
        "receivable_not_found",
        `Tidak ada piutang aktif dengan nama "${parsed.data.customer_name}".`,
        404,
      );
    }
    receivableId = found.id;
  }

  if (!receivableId) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404 reason=no_receivable_id`,
    );
    return apiError(
      "receivable_not_found",
      "Tidak bisa menentukan piutang yang dibayar.",
      404,
    );
  }

  const supabase = createAdminClient();
  const { result: validateResult, durationMs: validateMs } = await withTiming(
    () =>
      supabase
        .from("receivables")
        .select(
          "id, business_id, status, amount, paid_amount, customer_name",
        )
        .eq("id", receivableId)
        .is("deleted_at", null)
        .maybeSingle(),
  );
  dbMs += validateMs;
  const rc = validateResult.data;

  if (!rc) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=404 reason=receivable_deleted`,
    );
    return apiError(
      "receivable_not_found",
      "Piutang tidak ditemukan atau sudah dihapus.",
      404,
    );
  }
  if (rc.business_id !== parsed.data.business_id) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=403 reason=business_mismatch`,
    );
    return apiError(
      "receivable_business_mismatch",
      "Piutang tidak terdaftar di business_id yang dikirim.",
      403,
    );
  }
  if (rc.status === "paid") {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=409 reason=already_paid`,
    );
    return apiError(
      "receivable_already_paid",
      `Piutang ${rc.customer_name} sudah lunas.`,
      409,
    );
  }
  const remaining = Number(rc.amount) - Number(rc.paid_amount);
  if (parsed.data.amount > remaining) {
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=400 reason=amount_exceeds`,
    );
    return apiError(
      "amount_exceeds_remaining",
      `Jumlah pembayaran (${parsed.data.amount}) melebihi sisa piutang (${remaining}).`,
      400,
      { amount: `Sisa piutang ${rc.customer_name} hanya ${remaining}.` },
    );
  }

  const { result: rpcResult, durationMs: rpcMs } = await withTiming(() =>
    supabase.rpc("pay_receivable", {
      p_receivable_id: receivableId,
      p_amount: parsed.data.amount,
      p_payment_date: parsed.data.payment_date ?? todayJakarta(),
      p_note: parsed.data.note ?? null,
      p_source: parsed.data.source ?? "chat",
      p_created_by: parsed.data.created_by ?? "Liana",
    }),
  );
  dbMs += rpcMs;

  if (rpcResult.error) {
    console.error("[liana/receivable-payment] rpc:", rpcResult.error.message);
    console.log(
      `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${Date.now() - startTotal} status=500 reason=payment_failed`,
    );
    return apiError("payment_failed", rpcResult.error.message, 500);
  }

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/receivable-payment auth_ms=${authMs} db_ms=${dbMs} total_ms=${totalMs} status=201`,
  );
  return apiOk(
    {
      receivable: rpcResult.data,
      paid: parsed.data.amount,
      message:
        (rpcResult.data as { status?: string } | null)?.status === "paid"
          ? `Piutang ${rc.customer_name} sudah lunas.`
          : `Pembayaran tercatat. Sisa piutang ${rc.customer_name}.`,
    },
    201,
  );
}
```

- [ ] **Step 3: Verify lint + tsc**

Run: `npm run lint; npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/api/liana/receivable-payment/route.ts
git commit -m "feat(api): instrument /api/liana/receivable-payment with timing logs

Multi-step write \u2014 db_ms aggregates business check + receivable
lookup (optional) + receivable validation read + pay_receivable RPC.

If a single Liana 'lunas' command takes long, this log differentiates
between RPC time (atomic SQL function) and lookup time (sequential
selects)."
```

---

## Task 6: Instrument `liana-mcp/server.mjs` MCP server

**Files:**
- Modify: `liana-mcp/server.mjs`

**Goal:** Per-tool timing context shared via `ctx` arg passed into `callApi`. Logs go to `console.error` (stderr) which OpenClaw picks up — `console.log` would corrupt stdio MCP protocol on stdout.

**Target log lines per tool invocation:**

```
[mcp] tool=umkm_ambil_rekap rid=ab12cd start
[mcp] tool=umkm_ambil_rekap rid=ab12cd api_call=GET /api/liana/recap?business_id=...&period=today start
[mcp] tool=umkm_ambil_rekap rid=ab12cd api_call=GET /api/liana/recap?business_id=...&period=today duration_ms=234 status=ok
[mcp] tool=umkm_ambil_rekap rid=ab12cd total_ms=237 result=ok
```

- [ ] **Step 1: Add `mkRid()` helper near other helpers**

In `liana-mcp/server.mjs`, locate the helpers section (right after `formatRupiah` definition around line 60). Add:

```js
/**
 * Random 6-char base36 ID untuk correlate multiple log lines yang
 * belong ke single tool invocation. Cukup untuk personal usage \u2014 collision
 * probability hampir nol di throughput rendah.
 */
function mkRid() {
  return Math.random().toString(36).slice(2, 8);
}
```

- [ ] **Step 2: Update `callApi` signature to accept `ctx` and emit timing logs**

Replace the existing `async function callApi(method, path, body) { ... }` with:

```js
async function callApi(method, path, body, ctx) {
  const url = `${DASHBOARD_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
  };
  // Healthcheck tidak butuh auth
  if (path !== "/api/liana/health") {
    headers["Authorization"] = `Bearer ${LIANA_SHARED_SECRET}`;
  }

  const apiStart = Date.now();
  if (ctx) {
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} start`,
    );
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (ctx) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} duration_ms=${Date.now() - apiStart} status=network_error`,
      );
    }
    return {
      ok: false,
      error: {
        code: "network_error",
        message: `Tidak bisa connect ke dashboard di ${DASHBOARD_URL}: ${err?.message ?? err}`,
      },
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    if (ctx) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} duration_ms=${Date.now() - apiStart} status=invalid_response http=${response.status}`,
      );
    }
    return {
      ok: false,
      error: {
        code: "invalid_response",
        message: `Server balas non-JSON (HTTP ${response.status}).`,
      },
    };
  }

  if (ctx) {
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} duration_ms=${Date.now() - apiStart} status=${payload.ok ? "ok" : "error"} http=${response.status}`,
    );
  }
  return payload;
}
```

The `ctx` parameter is **optional** so existing call sites without ctx still work — no breakage during incremental rollout. After Step 3 every call site provides ctx.

- [ ] **Step 3: Wrap `umkm_catat_pemasukan_pengeluaran` handler**

Find the `server.tool("umkm_catat_pemasukan_pengeluaran", ...)` handler (around line 127). Replace the `async (args) => { ... }` body:

```js
  async (args) => {
    const ctx = { tool: "umkm_catat_pemasukan_pengeluaran", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    const result = await callApi(
      "POST",
      "/api/liana/finance-input",
      {
        business_id: BUSINESS_ID,
        type: args.type,
        amount: args.amount,
        category_name: args.category_name ?? null,
        note: args.note ?? null,
        transaction_date: args.transaction_date,
        source: "chat",
        created_by: "Liana",
      },
      ctx,
    );

    if (!result.ok) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${result.error?.code ?? "unknown"}`,
      );
      return asError(
        `${result.error?.code ?? "unknown"}: ${result.error?.message ?? "tidak diketahui"}`,
      );
    }

    const tx = result.data?.transaction;
    const verb = args.type === "income" ? "Pemasukan" : "Pengeluaran";
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(
      `${verb} ${formatRupiah(args.amount)} berhasil dicatat (id: ${tx?.id}). ` +
        `Tanggal: ${tx?.transaction_date}. ` +
        `Kategori: ${tx?.category_name ?? "tanpa kategori"}.`,
    );
  },
```

- [ ] **Step 4: Wrap `umkm_catat_piutang_baru` handler**

Find the `server.tool("umkm_catat_piutang_baru", ...)` handler. Replace the `async (args) => { ... }` body:

```js
  async (args) => {
    const ctx = { tool: "umkm_catat_piutang_baru", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    const result = await callApi(
      "POST",
      "/api/liana/receivable-input",
      {
        business_id: BUSINESS_ID,
        customer_name: args.customer_name,
        amount: args.amount,
        category_name: args.category_name ?? null,
        note: args.note ?? null,
        due_date: args.due_date ?? null,
        source: "chat",
      },
      ctx,
    );

    if (!result.ok) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${result.error?.code ?? "unknown"}`,
      );
      return asError(
        `${result.error?.code ?? "unknown"}: ${result.error?.message ?? "tidak diketahui"}`,
      );
    }

    const rc = result.data?.receivable;
    const dueText = rc?.due_date
      ? `Jatuh tempo: ${rc.due_date}.`
      : "Tanpa tanggal jatuh tempo.";
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(
      `Piutang ${args.customer_name} sebesar ${formatRupiah(args.amount)} dicatat (id: ${rc?.id}). ` +
        `${dueText} Status: belum bayar (unpaid).`,
    );
  },
```

- [ ] **Step 5: Wrap `umkm_catat_pembayaran_piutang` handler**

Find the `server.tool("umkm_catat_pembayaran_piutang", ...)` handler. Replace the `async (args) => { ... }` body:

```js
  async (args) => {
    const ctx = { tool: "umkm_catat_pembayaran_piutang", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    if (!args.customer_name && !args.receivable_id) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=missing_target`,
      );
      return asError(
        "Harus mengisi salah satu: customer_name atau receivable_id.",
      );
    }

    const result = await callApi(
      "POST",
      "/api/liana/receivable-payment",
      {
        business_id: BUSINESS_ID,
        customer_name: args.customer_name ?? null,
        receivable_id: args.receivable_id ?? null,
        amount: args.amount,
        payment_date: args.payment_date,
        note: args.note ?? null,
        source: "chat",
        created_by: "Liana",
      },
      ctx,
    );

    if (!result.ok) {
      const code = result.error?.code;
      const msg = result.error?.message ?? "";
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${code ?? "unknown"}`,
      );
      if (code === "amount_exceeds_remaining") {
        return asError(
          `Jumlah pembayaran ${formatRupiah(args.amount)} melebihi sisa piutang. ${msg}`,
        );
      }
      if (code === "receivable_not_found") {
        return asError(
          `Piutang tidak ditemukan untuk ${args.customer_name ?? args.receivable_id}. ${msg}`,
        );
      }
      if (code === "receivable_already_paid") {
        return asError(`Piutang sudah lunas. ${msg}`);
      }
      return asError(`${code ?? "unknown"}: ${msg}`);
    }

    const rc = result.data?.receivable;
    const sisa = rc ? Number(rc.amount) - Number(rc.paid_amount) : null;
    const isPaid = rc?.status === "paid";
    const tail = isPaid
      ? "LUNAS sepenuhnya."
      : sisa !== null
        ? `Sisa: ${formatRupiah(sisa)}.`
        : "";
    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(
      `Pembayaran ${formatRupiah(args.amount)} dari ${rc?.customer_name ?? "pelanggan"} berhasil dicatat. ${tail}`,
    );
  },
```

- [ ] **Step 6: Wrap `umkm_ambil_rekap` handler**

Find the `server.tool("umkm_ambil_rekap", ...)` handler. Replace the `async (args) => { ... }` body:

```js
  async (args) => {
    const ctx = { tool: "umkm_ambil_rekap", rid: mkRid() };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    const period = args.period ?? "today";
    const qs = new URLSearchParams({
      business_id: BUSINESS_ID,
      period,
    });
    const result = await callApi(
      "GET",
      `/api/liana/recap?${qs.toString()}`,
      null,
      ctx,
    );

    if (!result.ok) {
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=error code=${result.error?.code ?? "unknown"}`,
      );
      return asError(
        `${result.error?.code ?? "unknown"}: ${result.error?.message ?? "tidak diketahui"}`,
      );
    }

    const d = result.data;
    const s = d.summary;
    const lines = [];
    lines.push(`Rekap ${d.period.label} (${d.period.from} – ${d.period.to}):`);
    lines.push(`- Pemasukan: ${formatRupiah(s.total_income)}`);
    lines.push(`- Pengeluaran: ${formatRupiah(s.total_expense)}`);
    lines.push(
      `- Laba: ${formatRupiah(s.profit)} (${s.transactions_count} transaksi)`,
    );
    lines.push(
      `- Piutang aktif total: ${formatRupiah(s.active_receivables)}`,
    );

    if (d.recent_transactions?.length > 0) {
      lines.push("");
      lines.push(`${d.recent_transactions.length} transaksi terakhir:`);
      for (const tx of d.recent_transactions.slice(0, 5)) {
        const sign = tx.type === "expense" ? "-" : "+";
        const cat = tx.category_name ? ` [${tx.category_name}]` : "";
        const note = tx.note ? ` "${tx.note}"` : "";
        lines.push(
          `  ${tx.transaction_date} ${sign}${formatRupiah(Number(tx.amount))}${cat}${note}`,
        );
      }
    }

    if (d.active_receivables?.length > 0) {
      lines.push("");
      lines.push(`${d.active_receivables.length} piutang aktif:`);
      for (const rc of d.active_receivables.slice(0, 5)) {
        const sisa = Number(rc.amount) - Number(rc.paid_amount);
        const due = rc.due_date ? ` (jatuh tempo ${rc.due_date})` : "";
        lines.push(
          `  ${rc.customer_name}: ${formatRupiah(sisa)} [${rc.status}]${due}`,
        );
      }
    }

    console.error(
      `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${Date.now() - start} result=ok`,
    );
    return asText(lines.join("\n"));
  },
```

- [ ] **Step 7: Skip `umkm_health_check`**

Per spec §6.4 and the design's `health/route.ts` exclusion, health check stays uninstrumented. It's `console.error`-only at server-ready time. Don't add ctx to its callApi.

- [ ] **Step 8: Verify file is still syntactically valid**

Run: `node --check liana-mcp/server.mjs`
Expected: exit 0, no output.

- [ ] **Step 9: Commit**

```bash
git add liana-mcp/server.mjs
git commit -m "feat(mcp): instrument server.mjs with per-tool timing logs

Each tool invocation gets a random 6-char rid for correlating log
lines. callApi helper auto-logs api_call start + duration + status
when ctx is provided.

Logs go to stderr (console.error) so they don't corrupt the MCP
stdio protocol on stdout. OpenClaw picks them up in container logs.

Coverage: 4 of 5 tools (skip health_check, low value).

Format example:
  [mcp] tool=umkm_ambil_rekap rid=ab12cd start
  [mcp] tool=umkm_ambil_rekap rid=ab12cd api_call=GET /api/liana/recap... start
  [mcp] tool=umkm_ambil_rekap rid=ab12cd api_call=GET /api/liana/recap... duration_ms=234 status=ok http=200
  [mcp] tool=umkm_ambil_rekap rid=ab12cd total_ms=237 result=ok"
```

---

## Task 7: Push, baseline measurement, model swap, post-swap measurement

**Files:**
- None (verification + handoff)

- [ ] **Step 1: Push commits to main**

```bash
git push
```

Wait ~1-2 minutes for Vercel to build + deploy.

- [ ] **Step 2: Restart MCP server at OpenClaw side**

User action — gw kasih instruction. The MCP server (`liana-mcp/server.mjs`) needs to be **redeployed/restarted** on the host that OpenClaw runs from. This usually means:
- Pull latest from git on that host (`git pull`)
- Restart the OpenClaw process or just the MCP child process

Without this step, MCP timing logs won't show because OpenClaw is running the **old** server.mjs without instrumentation.

- [ ] **Step 3: Run pre-swap baseline (5 prompts)**

For each of the 5 standardized prompts below, send via dashboard "Tanya Liana" button and capture data into a markdown table.

| ID | Prompt |
|---|---|
| T1 | `rekap hari ini` |
| T2 | `jual kopi 4 cup 60rb` |
| T3 | `Budi ngutang 200rb pesanan kantor, bayar minggu depan` |
| T4 | `Pak Andi udah lunas` (precondition: ada piutang aktif untuk "Pak Andi"; kalau gak ada, kirim T3 dengan customer_name="Pak Andi" dulu) |
| T5 | `berapa laba bulan ini` |

Per prompt, capture:

```
## Pre-swap baseline (model: gpt-5.5)

| ID | Total | LLM | Network | Tool calls | API total_ms | Quality | Notes |
|---|---|---|---|---|---|---|---|
| T1 | 40.9s | 40.1s | 0.9s | 1 (recap) | recap=234ms | 5/5 | - |
| T2 | ?     | ?     | ?    | ? | ? | ? | ? |
| T3 | ?     | ?     | ?    | ? | ? | ? | ? |
| T4 | ?     | ?     | ?    | ? | ? | ? | ? |
| T5 | ?     | ?     | ?    | ? | ? | ? | ? |
```

- **Total / LLM / Network**: from chat panel pill `total X.Xs (LLM Y.Ys, network Z.Zs)`
- **Tool calls**: count `[mcp] tool=... start` lines per prompt window in OpenClaw stderr
- **API total_ms**: sum `total_ms=` from `[api] route=... total_ms=N status=200` lines for each tool's API call (from Vercel logs)
- **Quality**: 1–5 subjective × {Indonesian fluency, Rupiah formatting, accuracy}, take min

Save the table to a file `docs/specs/2026-04-29-liana-llm-speed-validation.md` for later comparison.

- [ ] **Step 4: Execute model swap at OpenClaw**

User action. Generic steps:
1. Edit Liana config: `gpt-5.5` → `gpt-5.4-mini`
2. Save config + restart Liana container
3. Sanity ping: 1 simple prompt ("halo") via dashboard, verify reply arrives

If reply never arrives or hangs >60s, **revert immediately** and investigate before continuing.

- [ ] **Step 5: Run post-swap measurement (same 5 prompts)**

Same protocol as Step 3. Append to validation markdown file:

```
## Post-swap (model: gpt-5.4-mini)

| ID | Total | LLM | Network | Tool calls | API total_ms | Quality | Notes |
|---|---|---|---|---|---|---|---|
...
```

- [ ] **Step 6: Decide based on decision matrix**

Compare averages between pre/post tables:

| Outcome | Latency (avg) | Quality (avg) | Action |
|---|---|---|---|
| ✅ Success | <12s | ≥4/5 | DONE. Mark Phase 2 complete. Commit validation file. |
| ⚠️ Quality regression | <12s | <4/5 | Revert to gpt-5.4 full (slower, better). Re-run Step 5 with new model name. |
| ⚠️ Marginal speedup | 15-25s | ≥4/5 | Bottleneck not pure LLM. Trigger Phase 2.5 brainstorm with logs as evidence. |
| ❌ No speedup | >25s | any | Investigate logs to find non-LLM bottleneck. Trigger Phase 2.5. |

- [ ] **Step 7: Commit validation file**

If outcome is ✅ Success, commit and close out:

```bash
git add docs/specs/2026-04-29-liana-llm-speed-validation.md
git commit -m "docs(specs): liana llm speed phase 2 validation results

Model swap gpt-5.5 \u2192 gpt-5.4-mini.

Pre-swap avg: <fill>s
Post-swap avg: <fill>s
Speedup: <fill>x
Quality: <fill>/5 (no regression)

Phase 2 complete. Phase 2.5 not triggered."
git push
```

If outcome is anything else, leave the validation file uncommitted and open Phase 2.5 brainstorm with the data.

---

## Self-review checklist (filled by author)

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| §5 MCP server instrumentation | Task 6 |
| §5.1 Log format | Task 6 (steps 2–6) |
| §5.2 Implementation strategy | Task 6 (mkRid + ctx pattern) |
| §6 API routes instrumentation | Tasks 1–5 |
| §6.1 Log format | Tasks 2–5 |
| §6.2 Shared helper | Task 1 |
| §6.3 Per-route integration | Tasks 2–5 |
| §6.4 Routes scope | Tasks 2 (recap), 3 (finance-input), 4 (receivable-input), 5 (receivable-payment); health + ask + run-callback excluded per spec |
| §7 Model swap + validation | Task 7 |
| §7.1 Pre-swap baseline | Task 7 step 3 |
| §7.2 Model swap | Task 7 step 4 |
| §7.3 Post-swap measurement | Task 7 step 5 |
| §7.4 Decision matrix | Task 7 step 6 |
| §7.5 Phase 2.5 trigger | Task 7 step 6 (the "not Success" branches) |

No spec gaps.

**Placeholder scan:** Searched for "TBD", "TODO", "implement later", vague helper requests. None found. All code blocks are complete and runnable.

**Type consistency:**
- `withTiming<T>()` signature in Task 1 matches usage in Tasks 2–5 (`{ result, durationMs }` destructure). ✓
- `withTimingSync<T>()` signature in Task 1 matches usage in Tasks 2–5. ✓
- `ctx` arg in `callApi` (Task 6 Step 2) matches `ctx` passed in Tasks 6.3–6.6. ✓
- `mkRid()` defined in Task 6 Step 1 used in Tasks 6.3–6.6. ✓
- Log format `[api] route=X auth_ms=N db_ms=M total_ms=K status=S` consistent across Tasks 2–5. ✓
- Log format `[mcp] tool=X rid=Y total_ms=N result=R` consistent across Task 6 sub-steps. ✓
