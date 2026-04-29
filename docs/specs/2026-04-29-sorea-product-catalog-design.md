# SOREA Phase 1 — Product Catalog

**Date**: 2026-04-29  
**Status**: Approved, ready for implementation  
**Scope**: Phase 1 of 4 (Catalog → Order → Payment → Liana MCP)

## Context

Repo `umkm-finance-dashboard` saat ini fokus dashboard keuangan. SOREA UMKM butuh
operational dashboard yang lebih luas: catalog produk, order management, payment
QRIS Pakasir demo, dan integrasi chat Liana untuk `/pesan`.

Phase 1 ini hanya **Product Catalog** — fondasi untuk Phase 2 (Order) yang butuh
catalog sebagai source of truth produk + harga.

## Goals (Phase 1)

1. **Database table** `products` dengan RLS scoped per business
2. **Seed** 12 produk awal SOREA (idempotent)
3. **API** `GET/POST /api/products` + `PATCH /api/products/[id]`
4. **Page** `/products` admin table view (read + edit harga/stok/active)
5. **Sidebar nav** tambah "Produk" sebagai entry baru

## Non-goals (Phase 1)

- Order management (Phase 2)
- Payment integration (Phase 3)
- MCP tools `umkm_catalog_*` untuk Liana (Phase 4)
- Inventory tracking (stok level numeric, multi-warehouse)
- Product images / rich content (cukup teks dulu)

## Architecture

```
Supabase
└── products table (new, 0010_products.sql)
    ├── RLS scoped business_id (mirror pattern dari categories/transactions)
    ├── Soft-delete via deleted_at (consistent dengan codebase)
    ├── Active flag is_active (toggle "menu off sementara")
    └── Seed 12 produk demo (0011_sorea_products_seed.sql)

Next.js App Router
├── types/sorea.ts                       (new module file, terpisah dari finance.ts)
├── lib/sorea/products/
│   ├── queries.ts                       (server-only, RLS-aware list/getById)
│   └── actions.ts                       (server actions create/update/delete)
├── app/api/products/
│   ├── route.ts                         (GET list, POST create)
│   └── [id]/route.ts                    (GET single, PATCH update)
├── app/(app)/products/page.tsx          (page server component)
├── components/products/
│   ├── product-table.tsx                (admin table)
│   ├── product-form.tsx                 (Dialog + server action, create/edit)
│   ├── product-row-actions.tsx          (DropdownMenu per row)
│   └── product-add-button.tsx           (header CTA opens form)
└── components/layout/nav-config.ts      (modified: insert "Produk" link)
```

## Data model

### Table `products`

| Column | Type | Constraint | Note |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `business_id` | uuid | NOT NULL, FK businesses ON DELETE CASCADE | scope |
| `sku` | text | NOT NULL | display ID, e.g. "P001" |
| `name` | text | NOT NULL | "SOREA Kopi Susu" |
| `category` | text | NOT NULL | freeform, e.g. "Coffee", "Snack" |
| `price` | integer | NOT NULL, CHECK >= 0 | rupiah, no decimal |
| `stock_status` | text | NOT NULL DEFAULT 'ready', CHECK IN (ready/habis/terbatas/preorder) | |
| `is_active` | boolean | NOT NULL DEFAULT true | toggle visibility tanpa delete |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | trigger set_updated_at |
| `deleted_at` | timestamptz | nullable | soft-delete |

**Constraints**:
- `UNIQUE (business_id, sku)` — SKU unique per business, bukan global
- `CHECK price >= 0` — boleh 0 (item gratis / paket promo)
- Partial index: `(business_id, is_active) WHERE deleted_at IS NULL`

### Stock status vs is_active vs deleted_at

3 layers untuk control visibility:
1. **`stock_status`**: produk masih ada di menu, tapi sedang `habis`/`terbatas`/`preorder`. Ditampilkan ke customer dengan badge.
2. **`is_active = false`**: produk sementara off menu (mis. seasonal). Tidak muncul di list customer-facing, tapi masih ada di admin.
3. **`deleted_at IS NOT NULL`**: produk discontinued / typo. Hilang dari semua view kecuali audit.

## API contract

### `GET /api/products`

Query params (optional):
- `?active=true` — filter `is_active = true`
- `?category=Coffee` — filter exact match
- `?search=kopi` — case-insensitive name OR sku contains

Response: `{ ok: true, data: { products: Product[] } }`

Auth: dashboard session (RLS scoped business_id).

### `POST /api/products`

Body:
```ts
{
  sku: string;        // required, 1-32 chars, unique per business
  name: string;       // required, 1-120 chars
  category: string;   // required, 1-60 chars
  price: number;      // required, integer >= 0
  stock_status?: "ready" | "habis" | "terbatas" | "preorder";  // default "ready"
  is_active?: boolean; // default true
}
```

Response: `{ ok: true, data: { product: Product } }` atau `{ ok: false, message }` dengan 400/409.

### `PATCH /api/products/[id]`

Body partial — semua field optional, hanya yang dikirim yang di-update:
```ts
{
  name?: string;
  category?: string;
  price?: number;
  stock_status?: "ready" | "habis" | "terbatas" | "preorder";
  is_active?: boolean;
}
```

Tidak boleh update `sku` (immutable identifier).

### `GET /api/products/[id]`

Response single product. 404 kalau tidak ada / soft-deleted.

## Page UI

### `/products` route (admin)

Layout:
- **Header**: "Produk SOREA" title + "Tambah Produk" button (di kanan)
- **Filter bar**: search (name/sku), category dropdown, active toggle
- **Table** kolom: SKU | Nama | Kategori | Harga | Stok | Status | Aksi
- **Row actions** (Dropdown): Edit | Toggle Active | Hapus

### Forms (Dialog)

Reuse pattern existing `TransactionForm`/`ReceivableForm`:
- `<Dialog>` controlled by parent state
- `useFormState` dengan server action
- Validate inline + show field errors
- Toast feedback success/error
- Auto-close on success

## Module separation rationale

**`types/sorea.ts`** terpisah dari `types/finance.ts` karena:
- Domain berbeda: SOREA operasional (produk, order, payment) vs finance (transaksi, piutang)
- Phase 2-4 akan tambah Order, Payment, dll yang semua SOREA-specific
- Memudahkan future split (kalau SOREA jadi separate package/repo)

**`lib/sorea/`** alasannya sama — clean module boundary supaya tidak campur dengan
finance helpers existing.

## Migration plan

1. **`0010_products.sql`**: CREATE TABLE products + indexes + RLS policies + trigger set_updated_at
2. **`0011_sorea_products_seed.sql`**: INSERT 12 produk SOREA dengan `ON CONFLICT (business_id, sku) DO NOTHING` (target: demo business `11111111-1111-4111-8111-111111111111`)

Kedua migration **idempotent** (aman dijalankan ulang).

## Risk + mitigation

| Risk | Mitigation |
|---|---|
| Seed pakai hardcoded business UUID | Comment jelas bahwa ini demo-only. Production: admin add manual via UI. |
| RLS bypass jika lupa filter | Mirror exact RLS pattern dari `categories` (sama semantik per-business) |
| Existing finance flow rusak | Tidak modify file existing kecuali `nav-config.ts` (insert 1 entry). Tidak ubah schema lama. |
| Realtime subscription belum di-enable | OK untuk Phase 1 — admin tool low-frequency. Bisa ditambah later kalau perlu. |

## Testing strategy

- **Manual**: jalankan migrate + verify 12 row di Supabase, buka /products, test add/edit/toggle/delete
- **Type check**: `npx tsc --noEmit` harus bersih
- **Integration**: smoke test API via browser (GET/POST/PATCH)
- **No automated tests dibuat di Phase 1** — codebase belum ada test suite. Kalau Phase 2+ kompleks, baru tambah Vitest.

## Phase 2 dependencies (preview)

Untuk Order module nanti, Phase 1 deliverables yang dipakai:
- Table `products` sebagai source of truth harga
- API `GET /api/products` untuk list/search dari Liana MCP atau order form
- Field `is_active` + `stock_status` untuk filter saat customer order
