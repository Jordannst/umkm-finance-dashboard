# Liana LLM Speed — Phase 2 Design

**Date:** 2026-04-29
**Status:** Approved (sections 1–3) — pending implementation plan
**Scope:** Phase 2 of multi-phase Liana speed work. Builds on Phase 1
data infrastructure (`forwarded_at` column, latency display, edge
runtime callback).

---

## 1. Problem statement

Phase 1 mengukur dan revealed: untuk simple prompt seperti "rekap hari
ini", Liana butuh **~40 detik** total (39s LLM + ~1s network). Itu
**5-8x lebih lambat dari acceptable** (~5-10s untuk read-only summary
queries).

Network latency (forward + callback) sudah dioptimasi di Phase 1
(edge runtime, total ~1s). Bottleneck murni di **LLM processing**:
OpenClaw → LLM call → MCP tool → LLM call → reply.

Hipotesis bottleneck (in order of likelihood):

1. **Frontier model overhead** — GPT-5.5 ~10-20s per inference. Liana
   butuh 2 inferences (decide tool, synthesize reply) → 20-40s base
2. **System prompt size** — `liana-agent-brief.md` ~12KB. Setiap
   inference re-process semua token = waste
3. **Multiple tool calls** — kalau Liana panggil tool >1x per prompt,
   compound latency
4. **MCP/API latency** — kemungkinan kecil, tapi belum di-instrument

Tanpa data, optimisasi blind. Tanpa speed reduction, dashboard kurang
useful (40s wait gak feasible untuk casual usage).

## 2. Goals (Phase 2)

1. **Diagnose** — instrument MCP server + API routes supaya jelas
   bottleneck di mana (LLM vs tool vs MCP overhead)
2. **Speed reduction** — target 40s → **8-12s** untuk simple prompts
3. **Validate quality** — pastikan optimisasi gak ngorbanin akurasi
   parsing Indonesian dan Rupiah formatting

## 3. Non-goals (Phase 2)

- **Streaming reply** — Telegram gak support native streaming.
  Defer ke Phase 3 kalau target latency belum tercapai
- **Self-hosted LLM** — keep using OpenAI hosted. Self-host bukan
  urusan dashboard repo
- **Persistent log aggregation** — `vercel logs` + OpenClaw stderr
  cukup untuk personal usage
- **Real-time dashboard untuk MCP timing** — overkill, manual review
  cukup

## 4. Approach overview

```
┌──────────────────────────────────────────────────────────────┐
│ Phase 2 = D (combined): instrument + swap + validate          │
└──────────────────────────────────────────────────────────────┘

Section 1 (this repo)   Section 2 (this repo)   Section 3 (OpenClaw)
─────────────────────  ─────────────────────  ─────────────────────
MCP server               API routes              Model swap
console.error timing     console.log timing      GPT-5.5 → GPT-5.4 mini
per tool call            per handler             + 5-prompt validation

         │                        │                       │
         └────────────┬───────────┘                       │
                      │                                   │
                      ▼                                   ▼
                ┌──────────────────────────────────────────┐
                │ Validation phase: run 5 standardized     │
                │ prompts pre + post swap, decide based on │
                │ decision matrix (latency × quality grid) │
                └──────────────────────────────────────────┘
```

**Why combined (Approach D)** vs simpler model-only swap:
- **Free diagnostic data** — instrumentation cost ~30 min
- **Future-proof** — kalau hasil validation marginal, ada data buat
  Phase 2.5 tanpa wait cycle
- **Risk symmetric** — `console.error` / `console.log` gak bisa
  break apapun
- **Full picture** — bisa konfirmasi "model swap was the right lever"
  dengan logs (e.g., LLM time turun, tool time tetap, total turun)

## 5. Section 1: MCP server instrumentation

### 5.1 Format

Per-tool-invocation, write timing ke `console.error` (stderr — gak
ganggu MCP protocol di stdout):

```
[mcp] tool=umkm_ambil_rekap rid=ab12cd start
[mcp] tool=umkm_ambil_rekap rid=ab12cd api_call=GET /api/liana/recap?... start
[mcp] tool=umkm_ambil_rekap rid=ab12cd api_call=GET /api/liana/recap?... duration_ms=234 status=ok
[mcp] tool=umkm_ambil_rekap rid=ab12cd total_ms=237 result=ok
```

`rid` = random 6-char hex untuk correlate multiple log lines yang
belong ke 1 tool invocation. Generated dengan
`Math.random().toString(36).slice(2, 8)`.

### 5.2 Implementation strategy

Wrap `callApi` helper untuk auto-log API call timing:

```js
async function callApi(method, path, body, ctx) {
  const url = `${DASHBOARD_URL}${path}`;
  const apiStart = Date.now();
  console.error(
    `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} start`,
  );

  // ... existing fetch logic ...

  const apiMs = Date.now() - apiStart;
  console.error(
    `[mcp] tool=${ctx.tool} rid=${ctx.rid} api_call=${method} ${path} duration_ms=${apiMs} status=${payload.ok ? "ok" : "error"}`,
  );
  return payload;
}
```

Wrap setiap tool handler dengan timing context:

```js
server.tool(
  "umkm_ambil_rekap",
  "...",
  { ... },
  async (args) => {
    const ctx = {
      tool: "umkm_ambil_rekap",
      rid: Math.random().toString(36).slice(2, 8),
    };
    const start = Date.now();
    console.error(`[mcp] tool=${ctx.tool} rid=${ctx.rid} start`);

    try {
      const result = await callApi("GET", "...", null, ctx);
      // ... existing handler logic ...
      const totalMs = Date.now() - start;
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${totalMs} result=ok`,
      );
      return asText(...);
    } catch (err) {
      const totalMs = Date.now() - start;
      console.error(
        `[mcp] tool=${ctx.tool} rid=${ctx.rid} total_ms=${totalMs} result=error error="${err.message}"`,
      );
      throw err;
    }
  },
);
```

### 5.3 What this answers

| Question | How log answers |
|---|---|
| Berapa kali tool dipanggil per chat? | Count `[mcp] tool=... start` lines per Liana run window |
| Mana tool yang slow? | Compare `total_ms` per tool name |
| API kita slow atau Liana lokal? | `api_call duration_ms` vs handler `total_ms` (handler − api = local processing) |
| Tool error patterns? | Filter `result=error` lines |

## 6. Section 2: API routes instrumentation

### 6.1 Format

Per-handler-invocation, write timing ke `console.log`:

```
[api] route=/api/liana/recap start
[api] route=/api/liana/recap auth_ms=2 db_ms=189 total_ms=234 status=200
```

For routes with no DB (health), omit `db_ms`. For routes with multiple
DB calls (recap = 2 selects), aggregate into single `db_ms`.

### 6.2 Shared helper

Create `lib/api/instrument.ts`:

```ts
/**
 * Helper untuk timing async operations dalam API handler.
 * Returns result + duration. Pure function — gak side-effect logging.
 */
export async function withTiming<T>(
  handler: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await handler();
  return { result, durationMs: Date.now() - start };
}

/**
 * Convenience untuk sync (e.g., auth check yang return Response | null).
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

### 6.3 Per-route integration pattern

For `/api/liana/recap/route.ts`:

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

  // ... validation logic ...

  const { result: recap, durationMs: dbMs } = await withTiming(() =>
    getLianaRecap(businessId, period),
  );

  const totalMs = Date.now() - startTotal;
  console.log(
    `[api] route=/api/liana/recap auth_ms=${authMs} db_ms=${dbMs} total_ms=${totalMs} status=200`,
  );
  return apiOk(recap);
}
```

For write routes (`finance-input`, `receivable-input`, `receivable-payment`),
wrap the database write call. Log `db_ms` yang represent insert + side effects.

### 6.4 Routes scope

| Route | Wrap | Rationale |
|---|---|---|
| `recap/route.ts` | YES | Most-frequent tool call, biggest latency unknown |
| `finance-input/route.ts` | YES | Write path, important to measure DB write speed |
| `receivable-input/route.ts` | YES | Same as above |
| `receivable-payment/route.ts` | YES | Multi-step write (lookup + insert + update) — interesting |
| `health/route.ts` | NO | Constant ~0ms, no value |
| `ask/route.ts` | NO | Already times via `forwarded_at` (Phase 1) |
| `run-callback/route.ts` | NO | Edge runtime, called by OpenClaw not Liana — different concern |

## 7. Section 3: Model swap + validation plan

### 7.1 Pre-swap baseline (with instrumentation aktif)

Run **5 standardized test prompts** sebelum swap. Capture untuk tiap
prompt:

- Total latency dari pill: `total X.Xs (LLM Y.Ys, network Z.Zs)`
- MCP log: `[mcp] ... total_ms=...` per tool call
- API log: `[api] ... total_ms=...` per route
- Reply quality (subjective): 1–5 scale × {Indonesian fluency, Rupiah formatting, accuracy}

**Test prompts:**

| ID | Prompt | Tool yang Liana harus pakai |
|---|---|---|
| T1 | "rekap hari ini" | `umkm_ambil_rekap` (period=today) |
| T2 | "jual kopi 4 cup 60rb" | `umkm_catat_pemasukan_pengeluaran` (income) |
| T3 | "Budi ngutang 200rb pesanan kantor, bayar minggu depan" | `umkm_catat_piutang_baru` (with due_date math) |
| T4 | "Pak Andi udah lunas" | `umkm_ambil_rekap` (find sisa) + `umkm_catat_pembayaran_piutang` |
| T5 | "berapa laba bulan ini" | `umkm_ambil_rekap` (period=month) |

Catat semua di tabel:

```
prompt | total | LLM | network | tool_call_count | tool_durations | quality | notes
T1     | 40.9s | 40.1s | 0.9s    | 1               | recap=234ms    | 5/5     | -
T2     | ?     | ?     | ?       | ?               | ?              | ?       | ?
...
```

### 7.2 Model swap (lo handle)

OpenClaw config Liana:

1. Backup config sekarang (catat model name)
2. Ubah model: `gpt-5.5` → `gpt-5.4-mini`
3. Restart container / reload
4. Smoke test 1 simple prompt (e.g., "halo Liana") — verify alive

### 7.3 Post-swap measurement

Run **5 prompts yang sama** dengan format yang sama. Compile tabel
identical structure.

### 7.4 Decision matrix

| Outcome | Latency (avg) | Quality (avg) | Action |
|---|---|---|---|
| ✅ Success | <12s | ≥4/5 | DONE. Phase 2 complete. |
| ⚠️ Quality regression | <12s | <4/5 | Escalate ke GPT-5.4 full (slower, better). Re-test. |
| ⚠️ Marginal speedup | 15-25s | ≥4/5 | Bottleneck bukan murni LLM. Trigger Phase 2.5 (likely caching atau prompt trim) berdasarkan logs. |
| ❌ No speedup | >25s | any | Logs harus tunjukin di mana 40s. Investigate dari logs. |

### 7.5 Phase 2.5 (conditional)

Triggered kalau outcome ≠ ✅ Success. Possible follow-ups, di-priorityize berdasarkan log evidence:

| Log evidence | Optimization |
|---|---|
| Tool dipanggil >1x untuk simple prompt | Prompt trim — instruksi lebih ketat untuk single tool |
| `recap` API `db_ms > 1000ms` | DB query optimization (index, materialized view) |
| `recap` API dipanggil dengan params identical dalam <30s | In-memory cache di MCP server |
| LLM time tetap 30s+ meski tool fast | Prompt trim atau model variant lain |
| Cold start patterns (1st call slow, subsequent fast) | OpenClaw container keep-warm cron |

Phase 2.5 di-design pakai data → bukan blind shot.

## 8. Files touched

| File | Status | Change |
|---|---|---|
| `liana-mcp/server.mjs` | MODIFY | Wrap `callApi` + each tool handler with timing logs (`[mcp] tool=... rid=... ...`) |
| `lib/api/instrument.ts` | NEW | `withTiming<T>()` + `withTimingSync<T>()` helpers |
| `app/api/liana/recap/route.ts` | MODIFY | Wrap with timing instrumentation |
| `app/api/liana/finance-input/route.ts` | MODIFY | Wrap with timing instrumentation |
| `app/api/liana/receivable-input/route.ts` | MODIFY | Wrap with timing instrumentation |
| `app/api/liana/receivable-payment/route.ts` | MODIFY | Wrap with timing instrumentation |

**No changes** di:
- `app/api/liana/health/route.ts` (out of scope, constant fast)
- `app/api/liana/ask/route.ts` (already instrumented via Phase 1)
- `app/api/liana/run-callback/route.ts` (different concern)
- OpenClaw config (lo handle separately, bukan part dari repo ini)

## 9. Risk & mitigation

| Risk | Mitigation |
|---|---|
| Log noise di Vercel function logs | Format prefix `[api]` dan `[mcp]` jelas. Bisa filter via `vercel logs --search "[api]"` |
| MCP stderr writes break stdio protocol | Confirmed: MCP SDK pakai stdout untuk protocol, stderr aman. Existing log lines (e.g., "ready" message) sudah di stderr |
| Model swap quality regress di Indonesian | Validation suite di 7.1/7.3. Quality threshold 4/5. Easy revert (config change) |
| `withTiming` adds overhead per call | <1ms (just `Date.now()` × 2). Negligible |
| GPT-5.4 mini hallucinate Rupiah formatting | Test T1 + T2 + T5 (semua return Rupiah). Quality matrix capture this |
| Cost regression (mini lebih murah, but tool calls bisa lebih banyak) | Mini ~5-10x cheaper per token. Even dengan 2x more tool calls (unlikely), masih net cheaper |

## 10. Open questions

- **Apakah Liana streaming reply ke Telegram?** Tidak relevan untuk Phase 2 (defer to Phase 3). Tapi worth noted kalau Liana belum streaming, perceived latency lebih buruk dari actual.
- **MCP server keep-warm di OpenClaw?** Kalau setiap request spawn `node server.mjs` baru, ada ~500-1500ms cold start per call. Worth check di OpenClaw config.

Both bukan blocker untuk Phase 2 — bisa di-investigate lewat logs (Section 1+2) lalu addressed di Phase 2.5 kalau perlu.

---

**Next step:** Invoke `writing-plans` skill untuk generate detailed
implementation plan dari design ini.
