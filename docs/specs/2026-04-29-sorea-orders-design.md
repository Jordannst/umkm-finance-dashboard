# SOREA Phase 2 — Order Management Core

**Date**: 2026-04-29
**Status**: Approved, ready for implementation
**Scope**: Phase 2 of 4 (Catalog ✓ → **Order** → Payment → Liana MCP)

## Context

Phase 1 selesai: catalog + admin CRUD + RLS. Phase 2 fokus **order management
core** — menerima order via API (primary path: Liana `/pesan` di Phase 4), list +
detail + update status di dashboard. Payment gateway (Pakasir) ditunda ke Phase 3.

## Goals (Phase 2)

1. Database tables `orders` + `order_items` dengan RLS scoped business
2. `order_code` auto-generated `ORD-YYYYMMDD-NNN` dengan retry-on-conflict
3. API:
   - `POST /api/orders` — create dengan items array (server resolve harga dari catalog)
   - `GET /api/orders` — list dengan filter
   - `GET /api/orders/[id]` — detail + items
   - `PATCH /api/orders/[id]` — update status & info
4. Page `/orders` (list) + `/orders/[id]` (detail) dengan update status
5. Sidebar nav: tambah "Pesanan"

## Non-goals (Phase 2)

- Payment integration (Phase 3)
- Manual order create form di dashboard (Liana-first; admin pakai API/postman untuk testing)
- Inventory deduction (stock tracking)
- Customer-facing pages (storefront)
- Print invoice (Phase 3 setelah ada payment data)

## Schema

### `orders`

| Column | Type | Constraint | Note |
|---|---|---|---|
| `id` | uuid | PK | |
| `business_id` | uuid | NOT NULL FK | RLS scope |
| `order_code` | text | NOT NULL UNIQUE | `ORD-YYYYMMDD-NNN` format |
| `customer_name` | text | NOT NULL | |
| `fulfillment_method` | text | NOT NULL | freeform; UI default options "Ambil di tempat" / "Antar" |
| `address` | text | nullable | required jika "Antar" (UI validates) |
| `notes` | text | nullable | catatan customer (e.g. "less sugar") |
| `order_status` | text | default `menunggu_pembayaran` CHECK enum | |
| `payment_status` | text | default `pending` CHECK enum | |
| `order_total_amount` | integer | NOT NULL CHECK >= 0 | dihitung server dari items |
| `payment_amount` | integer | NOT NULL DEFAULT 1 | Phase 3 demo (Rp1) |
| `payment_provider` | text | nullable | Phase 3: 'pakasir' |
| `payment_reference` | text | nullable | Phase 3: Pakasir transaction ID |
| `created_from_source` | text | NOT NULL DEFAULT 'dashboard' CHECK enum | dashboard/chat/system |
| `created_by` | text | nullable | audit (user/Liana name) |
| `created_at`/`updated_at`/`deleted_at` | timestamptz | | standard |

**order_status enum**: `menunggu_pembayaran`, `pembayaran_berhasil`, `diproses`, `siap_diambil`, `selesai`, `dibatalkan`

**payment_status enum**: `pending`, `paid`, `failed`, `refunded`

### `order_items`

| Column | Type | Constraint | Note |
|---|---|---|---|
| `id` | uuid | PK | |
| `order_id` | uuid | NOT NULL FK ON DELETE CASCADE | parent |
| `business_id` | uuid | NOT NULL FK | denormalized for RLS efficiency |
| `product_id` | uuid | nullable FK ON DELETE SET NULL | snapshot pattern |
| `sku` | text | NOT NULL | snapshot |
| `product_name` | text | NOT NULL | snapshot |
| `qty` | integer | NOT NULL CHECK > 0 | |
| `unit_price` | integer | NOT NULL CHECK >= 0 | snapshot dari products.price |
| `subtotal` | integer | NOT NULL CHECK >= 0 | qty * unit_price |
| `created_at` | timestamptz | DEFAULT now() | |

**Snapshot rationale**: kolom `sku`, `product_name`, `unit_price` dicopy dari catalog
saat create. Kalau produk di-edit/delete nanti, order historis tetap bisa dibaca.

## API contract

### `POST /api/orders`

Request body:
```ts
{
  customer_name: string;          // required, 1-120 chars
  fulfillment_method: string;     // required, 1-60 chars
  address?: string;               // optional, max 500
  notes?: string;                 // optional, max 500
  items: Array<{
    sku: string;                  // resolve product di server
    qty: number;                  // integer > 0
  }>;                             // required, min 1 item
  created_by?: string;            // audit (e.g. "Liana", "Admin")
  created_from_source?: "dashboard" | "chat" | "system";  // default 'dashboard'
}
```

Server validation:
1. Auth: dashboard session OR shared-secret bearer (untuk Liana MCP)
2. Validate body schema
3. Dedup items by SKU (sum qty kalau duplicate)
4. Resolve setiap product by SKU + business_id:
   - Reject kalau product tidak ada → 422 `product_not_found`
   - Reject kalau `is_active=false` → 422 `product_inactive`
   - Reject kalau `stock_status='habis'` → 422 `product_out_of_stock`
5. Hitung subtotal per item + total
6. Generate `order_code` retry-on-conflict (max 5 attempts)
7. INSERT orders + order_items dalam transaction
8. Return order detail dengan items

Response sukses: `{ ok: true, data: { order: Order, items: OrderItem[] } }` status 201

### `GET /api/orders`

Query params:
- `?status=menunggu_pembayaran` — filter order_status
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — date range
- `?search=patricia` — search customer_name OR order_code
- `?limit=N` — default 50

Response: `{ ok: true, data: { orders: Order[] } }` (tanpa items, untuk list view)

### `GET /api/orders/[id]`

Response: `{ ok: true, data: { order: Order, items: OrderItem[] } }`

### `PATCH /api/orders/[id]`

Body partial:
```ts
{
  order_status?: OrderStatus;
  payment_status?: PaymentStatus;
  customer_name?: string;
  fulfillment_method?: string;
  address?: string;
  notes?: string;
  // payment_provider, payment_reference reserved untuk Phase 3
}
```

**Tidak boleh**: ubah items, total, order_code, business_id, created_*.

## Page UI

### `/orders` (list)

- **Header**: "Pesanan SOREA" title (no add button — order via API only di Phase 2)
- **Filter bar**: status dropdown, date range, search
- **Table**: Order code | Tanggal | Customer | Items | Total | Status | Pembayaran | →
  - klik row → navigate ke `/orders/[id]`

### `/orders/[id]` (detail)

- **Breadcrumb**: ← Pesanan / `<order_code>`
- **Card customer info**: nama, fulfillment, address, notes
- **Card items**: table SKU | Nama | Qty | Unit | Subtotal + footer total
- **Card status & actions**:
  - Current order_status + payment_status
  - **Quick action button** untuk next-state common case:
    - `menunggu_pembayaran` → "Tandai bayar" (set both order_status='pembayaran_berhasil' + payment_status='paid')
    - `pembayaran_berhasil` → "Mulai proses" (→ 'diproses')
    - `diproses` → "Siap diambil" (→ 'siap_diambil')
    - `siap_diambil` → "Selesai" (→ 'selesai')
  - **Free dropdown** untuk override / batal (set 'dibatalkan')
- **Metadata**: created_at, created_by, source

## Module structure

```
supabase/migrations/0012_orders.sql
types/sorea.ts                                  (extend)
lib/sorea/orders/
  ├── queries.ts                                (listOrders, getOrderWithItems)
  └── actions.ts                                (updateOrderStatusAction)
app/api/orders/
  ├── route.ts                                  (GET list, POST create)
  └── [id]/route.ts                             (GET, PATCH)
components/orders/
  ├── order-table.tsx                           (list table, click row → detail)
  ├── orders-filters.tsx                        (status/date/search)
  ├── order-status-badge.tsx                    (visual badge per status)
  └── order-status-actions.tsx                  (quick action + dropdown)
app/(app)/orders/
  ├── page.tsx                                  (list)
  └── [id]/page.tsx                             (detail)
components/layout/nav-config.ts                 (modified: insert "Pesanan")
```

## `order_code` generation algorithm

```typescript
async function generateOrderCode(businessId, supabaseClient): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `ORD-${today}-`;

  for (let attempt = 0; attempt < 5; attempt++) {
    // Hitung order hari ini untuk business ini
    const { count } = await supabaseClient
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .like("order_code", `${prefix}%`);

    const next = (count ?? 0) + 1 + attempt; // +attempt buat retry kalau race
    const padded = String(next).padStart(3, "0");
    const code = `${prefix}${padded}`;

    // INSERT akan throw 23505 kalau konflik → loop retry
    return code; // caller handle insert + catch unique violation
  }
  throw new Error("Failed to generate unique order_code after 5 retries");
}
```

Pattern actual di action: pre-generate code → INSERT → catch unique violation → re-generate dengan attempt+1 → retry. Loop max 5x.

## Risk + mitigation

| Risk | Mitigation |
|---|---|
| Race condition pada order_code | Retry-on-conflict, +attempt offset, max 5 retries |
| Client kirim harga palsu | Server resolve harga dari `products.price`, abaikan harga di body |
| Order item dari produk hilang | Snapshot kolom (sku/name/price) di order_items |
| Update status invalid | Validation di PATCH (enum CHECK + Zod) |
| Order tanpa items | Validation: `items.length >= 1` |
| Order untuk produk lain business | RLS + business_id check di product lookup |

## Testing strategy

- **Manual**: jalankan migrate, POST /api/orders via curl, cek detail di /orders/[id], update status
- **Type check**: `npx tsc --noEmit`
- **Lint**: `npm run lint`
- **Build**: `npm run build`
- **Smoke flow**: create order → list show row → detail show items → quick action update status

## Phase 3 dependencies (preview)

Field yang sudah disiapkan untuk Phase 3 (payment):
- `orders.payment_amount` (default 1) — Pakasir QRIS demo amount
- `orders.payment_provider` — set 'pakasir' saat generate QRIS
- `orders.payment_reference` — Pakasir transaction ID
- `payment_status` enum sudah include 'paid', 'failed', 'refunded'
- Status transition `menunggu_pembayaran` → `pembayaran_berhasil` siap untuk callback Pakasir

Phase 3 add: `/api/payments/pakasir-callback`, generate QRIS endpoint, update order from payment event.
