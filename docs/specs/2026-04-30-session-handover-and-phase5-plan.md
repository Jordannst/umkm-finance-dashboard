# Session Handover & Phase 5 Plan — 2026-04-30

> **Tujuan dokumen ini**: handover lengkap untuk Cascade session berikutnya (atau developer lain) supaya bisa langsung lanjut tanpa reload context. Berisi: state project saat ini, ringkasan Phase 4B yang baru deployed, incident customer-bot hari ini, dan rencana Phase 5 (customer bot terpisah dari Liana).

## TL;DR untuk Sesi Berikutnya

1. **Phase 4B sudah deployed & verified** (commit `e927a92`). Auto-notify customer Telegram saat Pakasir webhook fire — works end-to-end. Real pay test passed (order `ORD-20260430-006`).
2. **Customer bot @Sorea_orderbot via OpenClaw GAGAL** karena Liana keliru config + personality leak antar agent. Sudah di-rollback total. OpenClaw kembali ke admin-only state (pre-customer-bot).
3. **Plan Phase 5**: bangun customer bot **terpisah total dari Liana/OpenClaw** sebagai deterministic state-machine bot di Vercel serverless. Detail di section [Phase 5 Plan](#phase-5-customer-bot-terpisah-dari-liana).
4. **Aturan baru untuk Liana**: Liana **tidak boleh** edit OpenClaw config / repo source code untuk fitur multi-system. Semua via Dev (commit + push). Liana assist read-only.

---

## 1. Konteks Project

### Tech Stack
- **Frontend/Backend**: Next.js 15 App Router di `umkm-dashboard/`
- **Database**: Supabase (Postgres + RLS)
- **Hosting**: Vercel
- **Payment**: Pakasir (QRIS gateway) — webhook to `/api/payments/pakasir-callback`
- **AI Agent**: Liana, dijalankan via OpenClaw 2026.4.26 di VPS (`kelompok3@ip-172-31-29-33`)
- **MCP Server**: `liana-mcp/server.mjs` di repo, dijalankan di VPS oleh Liana

### Repo Structure (Penting)
```
umkm-finance-dashboard/
└── umkm-dashboard/                 ← Active project root (Next.js)
    ├── app/                        ← App Router pages + API routes
    │   ├── api/orders/             ← Order CRUD API
    │   ├── api/payments/pakasir-callback/   ← Pakasir webhook receiver
    │   └── sorea/                  ← SOREA UMKM module pages
    ├── lib/
    │   ├── sorea/orders/actions.ts ← createOrder, etc.
    │   ├── sorea/payments/actions.ts ← processPakasirCallback, simulatePakasirSuccess
    │   ├── telegram/
    │   │   ├── send-message.ts     ← Bot API helper (admin token)
    │   │   └── notify-order-paid.ts ← Phase 4B helper, sends ✅ confirmation
    │   └── finance/                ← Finance dashboard module
    ├── liana-mcp/
    │   └── server.mjs              ← MCP tools: catalog, order, qris, status, dll
    ├── supabase/migrations/        ← SQL migrations
    │   ├── 0012_orders.sql
    │   ├── 0013_orders_payment_amount_default_600.sql
    │   └── 0014_orders_customer_contact.sql  ← Phase 4B migration
    ├── types/sorea.ts              ← Order, Product, etc.
    └── docs/specs/                 ← Design docs (this file lives here)
```

### Environments
- **Production**: `https://umkm-finance-dashboard.vercel.app`
- **VPS (OpenClaw + MCP)**: `kelompok3@ip-172-31-29-33` (AWS EC2)
- **Repo**: `https://github.com/Jordannst/umkm-finance-dashboard`

---

## 2. Phase Roadmap & Status

| Phase | Scope | Status | Commit |
|---|---|---|---|
| 1 | Finance dashboard MVP (transactions, piutang, rekap) | ✅ Done (older) | — |
| 2 | Liana agent integration via Telegram + MCP | ✅ Done | — |
| 3 | SOREA product catalog + orders + Pakasir QRIS | ✅ Done | — |
| 4A | MCP order tools + dual-auth (`/api/orders` accept Liana bearer) | ✅ Done | `c72c667` |
| **4B** | **Auto-notify customer Telegram saat lunas** | ✅ **Done & verified** | **`e927a92`** |
| 5 | Customer bot publik @Sorea_orderbot (deterministic, decoupled) | 📋 **Planned, not started** | — |

---

## 3. Phase 4B Recap (Done — Commit `e927a92`)

### Goal
Saat customer bayar QRIS, dashboard otomatis kirim message `✅ Pembayaran Diterima` ke Telegram chat customer dalam 5–10 detik. Tanpa intervensi Liana.

### Architecture Decision
- **Path**: dashboard direct → Telegram Bot API (`sendMessage`)
- **Bukan via Liana** — supaya independen dari OpenClaw quota / agent state
- **Bukan via image bridge** — pakai text message, tidak perlu OpenClaw forward

### Komponen yang Deploy

| File | Deskripsi |
|---|---|
| `supabase/migrations/0014_orders_customer_contact.sql` | Tambah kolom `customer_contact_channel` (`telegram`/`whatsapp`/null) + `customer_contact_id` (chat_id sebagai string). Pair-check constraint: dua-duanya isi atau dua-duanya null. |
| `types/sorea.ts` | Field baru di interface `Order` |
| `lib/sorea/orders/actions.ts` | Zod schema accept `customer_contact_channel` + `customer_contact_id`, persist saat insert |
| `liana-mcp/server.mjs` | MCP tool `umkm_create_order` punya param baru `telegram_chat_id`. Saat di-pass, MCP convert internal jadi `customer_contact_channel: "telegram"` + `customer_contact_id: <chat_id>` di body POST ke `/api/orders`. |
| `lib/telegram/notify-order-paid.ts` | Format pesan ✅ Pembayaran Diterima + send via Bot API |
| `lib/sorea/payments/actions.ts` | Wire `notifyOrderPaid` di `processPakasirCallback` (real webhook) + `simulatePakasirSuccess` (dev-only). Best-effort, fire-and-forget. |
| `liana-mcp/README.md` | Dokumentasi flow Phase 4B |

### Flow End-to-End (Verified Working)
```
1. Customer DM @Project_OCBOT (Liana admin):
   /pesan smoketest 1 matcha cream, ambil di tempat
       ↓
2. Liana extract chat_id dari context Telegram (mis. "1304543553")
       ↓
3. Liana call MCP: umkm_create_order({
     customer_name: "smoketest",
     fulfillment_method: "Ambil di tempat",
     items: [{sku:"P004", qty:1}],
     telegram_chat_id: "1304543553"      ← key parameter
   })
       ↓
4. MCP server forward ke /api/orders dengan body:
   {
     ...
     customer_contact_channel: "telegram",
     customer_contact_id: "1304543553"
   }
       ↓
5. Dashboard insert order, return order_id
       ↓
6. Liana call MCP: umkm_generate_qris(order_id)
       ↓
7. QR PNG muncul di chat customer
       ↓
8. Customer scan + bayar Rp600 demo
       ↓
9. Pakasir webhook → POST /api/payments/pakasir-callback
       ↓
10. processPakasirCallback:
    - update order: payment_status='paid', order_status='pembayaran_berhasil'
    - fetch order_items
    - if customer_contact_channel='telegram' && customer_contact_id:
        await notifyOrderPaid(order, items)  ← fire-and-forget
       ↓
11. notifyOrderPaid → sendTelegramMessage(chat_id, "✅ Pembayaran Diterima\n...")
       ↓
12. Customer dapat notif (5-10 detik setelah bayar)
```

### Acceptance Test Hasil (30 April 2026)

```
Order: ORD-20260430-006
customer_contact_channel: telegram
customer_contact_id: 1304543553
payment_status: paid (after real pay Rp600)
order_status: pembayaran_berhasil

Telegram chat customer:
✅ Pembayaran Diterima
Order: ORD-20260430-006
Atas nama: smoketest
• 1× SOREA Matcha Cream — Rp22.000
Total: Rp22.000
Metode: Ambil di tempat
Catatan: test phase 4b
Pesanan kamu akan segera diproses oleh tim kami.
Terima kasih sudah belanja! 🙌
```

✅ Real pay end-to-end: **PASSED**

### Env Vars yang Dipakai (Vercel)
- `TELEGRAM_BOT_TOKEN` (atau `OPENCLAW_TELEGRAM_BOT_TOKEN`) — token bot admin (Liana)
- Env baru yang **akan** dipakai Phase 5: `SOREA_ORDER_TELEGRAM_BOT_TOKEN`

### Known Limitations Phase 4B
1. **Single-bot**: notif selalu kirim via admin bot. Kalau customer chat dengan bot lain (Phase 5 customer bot), notif gak akan sampai karena chat_id di scope bot berbeda.
2. **Telegram only**: schema support `whatsapp` channel tapi belum implement
3. **No retry**: kalau Bot API gagal, customer gak dapat notif (silent)

---

## 4. Incident Hari Ini (30 April 2026, ~16:00–21:30 WIB)

### Apa yang Diinginkan
Buat customer bot publik `@Sorea_orderbot` terpisah dari admin bot `@Project_OCBOT`. Tujuannya:
- Customer chat dengan bot khusus ordering
- Admin tetap pakai Liana untuk insight/finance/debug
- Branding cleaner (customer lihat "SOREA Order Bot", bukan "Liana")

### Apa yang Dilakukan Liana
1. ✅ Migrate OpenClaw config dari schema lama (single-bot inline) ke schema baru (multi-account `accounts: {admin, customer}`)
2. ✅ Tambah account `customer` dengan `botToken` dari env `SOREA_ORDER_TELEGRAM_BOT_TOKEN`
3. ✅ Buat agent baru `sorea-customer-order` di workspace `~/.openclaw/workspace-sorea-customer-order`
4. ✅ Add binding `accountId: customer → agent: sorea-customer-order`
5. ✅ Set tool whitelist agent customer: hanya `umkm_catalog_search`, `umkm_create_order`, `umkm_generate_qris`, `umkm_order_get`. Deny `exec/process/read/write/edit/etc.`

### Apa yang Gagal
1. **Personality leak**: Saat owner DM `@Project_OCBOT` (admin), Liana balas dengan persona "SOREA customer bot" + tool list customer terbatas. Liana sendiri akhirnya akui: "agent yang sedang loaded adalah sorea-customer-order workspace".
2. **Customer flow gak tanya nama**: Saat owner test DM `@Sorea_orderbot`, agent gak request nama customer dulu sebelum panggil `umkm_create_order`.
3. **QR image gak muncul** di chat `@Sorea_orderbot` — kemungkinan agent tidak forward MCP image content ke chat, atau prompt tidak instruct kirim image.
4. **Liana stuck circular**: claim "elevated permission gak ada", lalu "tool exec gak exposed", lalu "agent salah binding"... bolak-balik tanpa progress fix.
5. **Auto-notify token mismatch (Phase 4B vs customer bot)**: dashboard `notify-order-paid.ts` pakai `TELEGRAM_BOT_TOKEN` (admin). Kalau customer chat dengan customer bot, dashboard kirim notif via bot yang salah → Telegram return "chat not found".

### Recovery yang Sudah Dilakukan
1. Backup current state (Liana edit) sebagai `~/.openclaw/openclaw.json.pre-restore-20260430-132950`
2. Restore dari `~/.openclaw/openclaw.json.bak-sorea-orderbot-atomic-20260430T123502Z` (atomic backup tepat sebelum Liana write multi-account)
3. Restart `openclaw gateway`
4. Verify admin bot kembali normal — tested: Liana balas sebagai admin agent dengan tool list lengkap

### State Saat Ini (Setelah Recovery)

| Komponen | State |
|---|---|
| OpenClaw config (`~/.openclaw/openclaw.json`) | ✅ Pre-customer-bot, schema lama (single-bot inline), admin only |
| Admin bot `@Project_OCBOT` | ✅ Functional, full tool access |
| Customer bot `@Sorea_orderbot` | 💤 Token tetap di `~/.openclaw/.env` (`SOREA_ORDER_TELEGRAM_BOT_TOKEN`), tapi tidak di-route OpenClaw. DM no-op. |
| Workspace `~/.openclaw/workspace-sorea-customer-order` | 💤 Ada di disk, dorman, gak di-bind |
| Backup pre-restore (Liana edit state) | 📦 Preserved untuk reference |
| Phase 4B di umkm-dashboard | ✅ Tetap work, tidak terpengaruh |

### Lessons Learned

1. **Liana capability vs reliability gap**: Liana _bisa_ edit config (multi-step), tapi tidak _reliable_ untuk fitur yang touching multi-system. Saat error muncul, dia jadi confused dan personality-leak antar agent.

2. **Atomic backup oleh Liana sebenarnya useful** — `bak-sorea-orderbot-atomic-...` save kita. Best practice: setiap kali Liana edit config, dia harus auto-backup dengan timestamp.

3. **OpenClaw pakai user-mode process, bukan systemd** — `journalctl -u openclaw-gateway` selalu kosong. Cek via `ps -ef | grep openclaw-gateway` atau log file langsung di `~/.openclaw/logs/` (kalau ada).

4. **Schema OpenClaw 2026.4.26 backward-compatible**: schema lama (single-bot inline) dan baru (multi-account) dua-duanya valid.

5. **Workspace agent memang bisa override behavior**: kalau agent custom punya `tools.deny: [exec, ...]`, agent itu beneran gak bisa pakai shell. Liana bukan halusinasi — dia memang loaded dengan workspace yang restricted.

### Aturan Baru untuk Liana (Enforce di System Prompt-nya)

```
JANGAN edit file source code di repo umkm-finance-dashboard
secara langsung di VPS (server.mjs, app/, lib/, supabase/migrations/).

JANGAN edit OpenClaw config (~/.openclaw/openclaw.json) untuk fitur baru
yang touching multi-system (Telegram + dashboard + DB). Untuk single-line
fix yang isolated (mis. add custom command), masih boleh dengan backup.

UNTUK FITUR BARU:
- Lapor ke Dev via prompt "saran perubahan: <detail>"
- Dev yang implement, commit, push, dan apply
- Setelah Dev confirm deploy, kamu acknowledge & test from your end

KAMU READ-ONLY untuk infrastructure changes. Kamu BOLEH untuk:
- Run command (cek log, grep, ls, dll)
- Suggest config diff
- Test feature dari user perspective
```

---

## 5. Open Issues (Bukan Blocker)

### Issue A: Gemini API 403 untuk Memory Subsystem

**Symptom**:
```
memory sync failed: gemini embeddings failed (403): PERMISSION_DENIED
```

**Impact**: Liana long-term memory tidak ke-sync ke embedding. Local memory file (`~/.openclaw/workspace/MEMORY.md`) tetap di-write, tapi semantic search degraded.

**Diagnosis**: Gemini API key di `.env` Liana (`GEMINI_API_KEY` atau `GOOGLE_GENAI_API_KEY`) entah expired, billing belum aktif, atau quota habis.

**Fix candidate**:
1. Owner punya cadangan Gemini API key — tinggal swap di `~/.openclaw/.env`
2. Tanya Liana lokasi exact env name + path file (chat preparation sudah ada di session ini)
3. Restart `openclaw gateway`
4. Verify dengan test memory sync

**Reference config**:
```json
"agents.defaults.memorySearch": {
  "enabled": true,
  "provider": "gemini",
  "model": "gemini-embedding-001"
}
```

### Issue B: Workspace Customer-Order Dorman

`~/.openclaw/workspace-sorea-customer-order/` masih ada di-disk. Tidak di-bind, tidak di-load. Aman tapi clutter.

**Pilihan**:
- Delete sekarang (clean state)
- Keep untuk reference saat Phase 5 (lihat prompt + tool whitelist Liana yang dia bikin)

Recommend: keep untuk sekarang. Delete saat Phase 5 implement clean dari blank.

---

## 6. Phase 5: Customer Bot Terpisah dari Liana

### Design Principles

1. **Decoupled total dari OpenClaw/Liana** — bot punya proses sendiri, deploy sendiri
2. **Deterministic state machine** — no LLM, no hallucination risk
3. **Same repo, same deploy** — Vercel serverless function di `umkm-dashboard/`
4. **Reuse existing API** — catalog, create_order, generate_qris (sudah ada)
5. **Backward compatible Phase 4B** — extend notify-order-paid untuk pilih token sesuai bot source

### Architecture

```
Customer (@Sorea_orderbot)
        ↓ Telegram webhook
POST https://umkm-finance-dashboard.vercel.app/api/telegram/sorea-order/webhook
        ↓
app/api/telegram/sorea-order/webhook/route.ts:
        ↓
lib/telegram/sorea-order/flow.ts (state machine handler)
        ↓
Read/write Supabase telegram_sessions (per-chat_id state)
        ↓
On finalize order: call internal API (catalog, create_order, generate_qris)
        ↓
Send keyboard/text/photo to customer via SOREA_ORDER_TELEGRAM_BOT_TOKEN
        ↓ Customer scan QR + bayar
Pakasir webhook → /api/payments/pakasir-callback
        ↓
notifyOrderPaid (UPDATED): pilih bot token berdasarkan order.created_from_bot
        ↓ Send via SOREA_ORDER_TELEGRAM_BOT_TOKEN (bukan admin)
Customer terima ✅ Pembayaran Diterima
```

### Komponen yang Akan Dibangun

#### 6.1 Migration 0015 — Telegram Sessions Table
```sql
-- supabase/migrations/0015_telegram_sessions.sql
CREATE TABLE public.telegram_sessions (
  chat_id text PRIMARY KEY,
  bot_id text NOT NULL,                    -- 'sorea_order' | 'admin' (future)
  state text NOT NULL DEFAULT 'idle',      -- idle, browsing_menu, picking_qty, asking_name, asking_fulfillment, asking_address, confirming, awaiting_payment
  cart jsonb,                              -- { items: [{sku, qty}], customer_name, fulfillment_method, address, notes }
  last_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  message_id_to_edit bigint,               -- ID message inline keyboard yang aktif (untuk edit-in-place)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_sessions_updated ON telegram_sessions(updated_at DESC);

-- Auto-cleanup session > 24 jam (cron-friendly)
```

#### 6.2 Migration 0016 — Order Source Tracking (Optional, Recommended)
```sql
-- supabase/migrations/0016_orders_source_bot.sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_from_bot text;
-- Values: 'sorea_order' | 'admin' | NULL (legacy / non-bot)
-- Dipakai notify-order-paid untuk pilih token bot mana yang kirim notif
```

#### 6.3 Webhook Handler
```
app/api/telegram/sorea-order/webhook/route.ts
  - POST handler
  - Verify token in URL path (security via secret URL token)
  - Parse Telegram update (message / callback_query)
  - Dispatch to flow.ts
  - Return 200 OK immediately (Telegram timeout 60s, but best <2s)
```

#### 6.4 State Machine
```
lib/telegram/sorea-order/states.ts
  enum SoreaOrderState {
    IDLE,                    // Greet, show menu button
    BROWSING_MENU,           // Show product list with inline keyboard
    PICKING_QTY,             // After picking product, ask qty
    REVIEWING_CART,          // Show cart, allow add more or proceed
    ASKING_NAME,             // "Atas nama siapa kak?"
    ASKING_FULFILLMENT,      // Ambil di tempat / Diantar
    ASKING_ADDRESS,          // (only if Diantar)
    ASKING_NOTES,            // Optional notes (skip allowed)
    CONFIRMING,              // Summary + button [Ya pesan] [Batal]
    AWAITING_PAYMENT,        // QR sent, waiting Pakasir webhook
    DONE,                    // After paid, transition to IDLE
  }

lib/telegram/sorea-order/flow.ts
  handleUpdate(update) → load session by chat_id → call state handler
  
  Each state handler:
    - Process input (text or callback_query)
    - Update cart in session
    - Transition to next state
    - Send next message/keyboard

lib/telegram/sorea-order/keyboard.ts
  buildMenuKeyboard(products) → InlineKeyboardMarkup
  buildQtyKeyboard() → 1, 2, 3, 4, 5+
  buildFulfillmentKeyboard() → Ambil / Antar
  buildConfirmKeyboard() → Ya / Batal

lib/telegram/sorea-order/bot.ts
  sendMessage(chat_id, text, options) — pakai SOREA_ORDER_TELEGRAM_BOT_TOKEN
  sendPhoto(chat_id, photo, caption) 
  editMessageText(chat_id, message_id, text)
  answerCallbackQuery(callback_query_id, text)
```

#### 6.5 Update Phase 4B Notify untuk Multi-Bot
```typescript
// lib/telegram/notify-order-paid.ts (UPDATE)
const TOKEN_BY_BOT: Record<string, string | undefined> = {
  sorea_order: process.env.SOREA_ORDER_TELEGRAM_BOT_TOKEN,
  admin: process.env.OPENCLAW_TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN,
};

export async function notifyOrderPaid(order: Order, items: OrderItem[]) {
  if (order.customer_contact_channel !== "telegram") return;
  if (!order.customer_contact_id) return;

  // Phase 5: pilih token sesuai bot source. Default ke admin kalau null.
  const botId = order.created_from_bot ?? "admin";
  const token = TOKEN_BY_BOT[botId];
  if (!token) {
    console.warn(`[notifyOrderPaid] no token for bot=${botId}`);
    return;
  }

  await sendTelegramMessage(token, order.customer_contact_id, formatPaidMessage(order, items));
}
```

#### 6.6 One-Time Setup Endpoint
```
app/api/telegram/sorea-order/setup/route.ts
  - POST (admin auth via LIANA_SHARED_SECRET)
  - setWebhook to https://.../api/telegram/sorea-order/webhook?secret=<random>
  - setMyCommands: /start, /menu, /pesan, /cek
  - Return setup status
```

### Implementation Roadmap (Estimate ~2 hari)

| # | Task | Effort | Risk | Approval Gate |
|---|---|---|---|---|
| 1 | Commit migration 0015 + 0016 | 30 min | Low | Schema review |
| 2 | Setup Vercel env `SOREA_ORDER_TELEGRAM_BOT_TOKEN` | 5 min | None | — |
| 3 | Implement webhook handler + setup endpoint | 1 jam | Med | Webhook URL routing test |
| 4 | Implement bot.ts (send helpers) | 30 min | Low | — |
| 5 | Implement flow.ts state IDLE → BROWSING_MENU | 1 jam | Med | Manual test /start |
| 6 | Implement state PICKING_QTY → REVIEWING_CART | 2 jam | Med | — |
| 7 | Implement state ASKING_NAME → CONFIRMING | 1 jam | Med | — |
| 8 | Implement CONFIRMING → create_order + send QR | 1 jam | Med | E2E test order create |
| 9 | Update notify-order-paid.ts untuk multi-bot routing | 30 min | Low | — |
| 10 | E2E test: real pay via @Sorea_orderbot | 1 jam | Low | Acceptance |
| 11 | Public smoke test (DM dari nomor lain, bukan owner) | 30 min | Low | Final acceptance |

### Pre-Implementation Checklist

Sebelum mulai Phase 5:
- [ ] Verify Vercel sudah punya env `SOREA_ORDER_TELEGRAM_BOT_TOKEN`
- [ ] Verify @Sorea_orderbot masih live di BotFather
- [ ] Confirm token belum di-leak (kalau bocor, reset di BotFather)
- [ ] Decide secret URL token untuk webhook (mis. `WEBHOOK_SECRET_SOREA_ORDER` env)
- [ ] Backup state OpenClaw saat ini (sudah dilakukan di session ini)

### Test Cases Phase 5

1. **Happy path**: /start → pilih menu → qty → nama → ambil di tempat → confirm → bayar QR → terima notif
2. **Cancel mid-flow**: di state ASKING_NAME, kirim /batal → reset session ke IDLE
3. **Multi-item cart**: tambah 2 produk → review cart → confirm
4. **Antar dengan address**: pilih Diantar → tanya address → confirm
5. **Idempotent /start**: kirim /start saat AWAITING_PAYMENT → jangan reset cart, kasih opsi "Pesanan sebelumnya masih menunggu pembayaran. Lanjut atau batal?"
6. **Concurrent customers**: 2 chat_id berbeda parallel, session terisolasi
7. **Callback expired**: customer pencet button keyboard yang sudah lama (>5 menit) → graceful "Tombol expired, /start lagi ya"

### Out-of-Scope Phase 5 (Future)
- Voice / image input dari customer
- LLM fallback untuk free-text questions
- Multi-language
- Customer history / loyalty
- WhatsApp channel (schema sudah support)

---

## 7. Reference Data Cepat

### Critical File Paths

| Path | Purpose |
|---|---|
| `c:/projects/umkm-finance-dashboard/umkm-dashboard/` | Repo root local (Windows) |
| `/home/kelompok3/umkm-finance-dashboard/` | Repo root VPS (cloned from GitHub) |
| `/home/kelompok3/umkm-finance-dashboard/liana-mcp/server.mjs` | MCP server di VPS |
| `/home/kelompok3/.openclaw/openclaw.json` | OpenClaw active config |
| `/home/kelompok3/.openclaw/.env` | OpenClaw env vars (TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, SOREA_ORDER_TELEGRAM_BOT_TOKEN, dll) |
| `/home/kelompok3/.openclaw/workspace/` | Liana global workspace (MEMORY.md, AGENTS.md, dll) |
| `/home/kelompok3/.openclaw/workspace-sorea-customer-order/` | Workspace customer agent (dorman) |

### Important Backup Files (di VPS)

| File | Konten | Use Case |
|---|---|---|
| `~/.openclaw/openclaw.json.pre-restore-20260430-132950` | Liana edit state (admin + customer + binding) | Reference Phase 5 design |
| `~/.openclaw/openclaw.json.bak-sorea-orderbot-atomic-20260430T123502Z` | Pre-customer-bot, schema lama | Last-good fallback |
| `~/.openclaw/openclaw.json.last-good` | Same as Liana edit (12:36) | Sama dengan pre-restore |

### Bot Tokens (Reference, JANGAN paste ke chat)

| Bot | Username | Token Source |
|---|---|---|
| Liana Admin | `@Project_OCBOT` | hardcoded di `openclaw.json` (admin botToken) — production OK |
| SOREA Order | `@Sorea_orderbot` | env `SOREA_ORDER_TELEGRAM_BOT_TOKEN` |

### Allowlist Telegram (Admin Bot)
```
1304543553   ← Owner (kelompok3 / Dev / Jordan)
1210376876
6117409040
1362867602
7602798649
```

### Important Commits

| Commit | Date | What |
|---|---|---|
| `c72c667` | (earlier) | feat(phase4a): MCP order tools + dual-auth |
| `70571cf` | (earlier) | fix(middleware): bypass `/api/*` from session redirect |
| `52b2101` | (earlier) | fix(orders): accept null literal in zod |
| `c2ff4df` | (earlier) | fix(mcp): umkm_generate_qris returns QR image + EMV |
| `8d3b63e` | 30/04 (pre) | feat(mcp): umkm_catalog_search shows full catalog |
| **`e927a92`** | **30/04** | **feat(phase4b): auto-notify customer Telegram saat Pakasir webhook fire** |

### Pakasir Webhook URL
```
https://umkm-finance-dashboard.vercel.app/api/payments/pakasir-callback
```

### Dashboard URLs
```
Production: https://umkm-finance-dashboard.vercel.app
Orders:     https://umkm-finance-dashboard.vercel.app/sorea/orders
```

### Useful Curl Tests

**Simulate Pakasir paid (dev only)**:
```bash
LIANA_TOKEN="<from .env>"
ORDER_UUID="<order id>"

curl -X POST "https://umkm-finance-dashboard.vercel.app/api/orders/${ORDER_UUID}/payment/pakasir/simulate" \
  -H "Authorization: Bearer ${LIANA_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Verify bot live**:
```bash
curl -sS "https://api.telegram.org/bot${TOKEN}/getMe" | python3 -m json.tool
```

**OpenClaw gateway**:
```bash
openclaw gateway status
openclaw gateway restart
ps -ef | grep openclaw
```

---

## 8. Session-to-Session Continuity

### Untuk Cascade Session Berikutnya

Saat user buka Cascade lagi, sapa dengan:
> "Saya sudah baca `docs/specs/2026-04-30-session-handover-and-phase5-plan.md`. State saat ini: Phase 4B done (commit e927a92), customer bot Phase 5 in plan. Mau lanjut implement Phase 5, fix Gemini API, atau hal lain?"

Cek dulu state aktual sebelum klaim:
```bash
git -C umkm-dashboard log -1 --oneline      # Confirm commit e927a92 di main
```

### Untuk Liana

Setelah session berikutnya start, briefing ulang Liana dengan:

```
Liana, status update:

Phase 4B (auto-notify Telegram saat lunas) sudah deployed di commit
e927a92, sudah verified end-to-end. Kamu cuma perlu pass telegram_chat_id
saat umkm_create_order, sisanya dashboard handle.

Phase 5 customer bot @Sorea_orderbot SEDANG DIRENCANAKAN ULANG dengan
arsitektur baru: bot terpisah total dari kamu/OpenClaw, dijalankan
sebagai webhook handler di dashboard. Kamu TIDAK akan terlibat di Phase 5.
Workspace `~/.openclaw/workspace-sorea-customer-order` dorman, jangan
disentuh.

Aturan penting yang sudah kita sepakati:
- Kamu TIDAK BOLEH edit OpenClaw config untuk fitur multi-system
- Kamu TIDAK BOLEH edit source code di repo umkm-finance-dashboard
- Untuk fitur baru, lapor Dev → Dev implement → Dev apply → Kamu test
- Kamu read-only untuk infrastructure changes

Acknowledge dengan summary 1 kalimat.
```

### Buat Saya (Cascade Saat Ini)

Saat session ini di-close, hal-hal yang **sudah saya save**:
- ✅ Dokumen ini (`2026-04-30-session-handover-and-phase5-plan.md`)
- ✅ Phase 4B commit `e927a92` di main branch
- ✅ Backup pre-customer-bot OpenClaw config di VPS
- ✅ Memory di IDE Cascade tentang arsitektur project

Yang **belum saya save** (deferred ke session berikutnya):
- Phase 5 implementation (cuma plan)
- Gemini API fix (cuma diagnose)
- Migration 0015 + 0016 SQL (cuma sketch di doc ini)
- Workspace cleanup customer-order (intentional keep)

---

## 9. Sign-Off

**Session start**: 2026-04-30 ~10:00 WIB  
**Session end**: 2026-04-30 ~21:45 WIB  
**Duration**: ~12 jam (dengan break)  
**Major outcomes**:
1. ✅ Phase 4B end-to-end deployed & verified
2. ❌ Phase 5 customer bot via OpenClaw — gagal, di-rollback
3. 📋 Phase 5 customer bot via standalone — designed, ready to implement
4. 📋 Behavioral rules untuk Liana — codified

**Next session priority**: Pilih dari [Phase 5 implementation](#phase-5-customer-bot-terpisah-dari-liana), [Fix Gemini API](#issue-a-gemini-api-403-untuk-memory-subsystem), atau hal lain sesuai owner.

---

_Generated by Cascade. Document path: `docs/specs/2026-04-30-session-handover-and-phase5-plan.md`_
