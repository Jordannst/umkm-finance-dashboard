-- =====================================================================
-- 0012_orders.sql
-- SOREA Phase 2: Order Management Core
-- Idempotent: aman dijalankan berulang.
--
-- Schema:
--   - orders         : header order (customer, status, total, payment)
--   - order_items    : line items dengan snapshot kolom (sku/name/price)
--                      supaya order historis tetap konsisten kalau produk
--                      di-edit/hapus nanti.
--
-- Catatan: payment_amount default 1 untuk Phase 3 demo Pakasir QRIS,
-- TAPI order_total_amount tetap nominal asli dari catalog. Dua field
-- sengaja dipisah supaya invoice tampil harga normal sementara payment
-- gateway demo cuma charge Rp1.
-- =====================================================================

-- =====================================================================
-- orders
-- =====================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- order_code unique GLOBAL (bukan per-business) supaya gampang
  -- copy-paste antar staff. Format ORD-YYYYMMDD-NNN, generated server.
  order_code text not null unique,
  customer_name text not null,
  fulfillment_method text not null,
  address text,
  notes text,
  -- order_status: lifecycle order
  order_status text not null default 'menunggu_pembayaran'
    check (order_status in (
      'menunggu_pembayaran',
      'pembayaran_berhasil',
      'diproses',
      'siap_diambil',
      'selesai',
      'dibatalkan'
    )),
  -- payment_status: status pembayaran (akan di-update Phase 3 saat
  -- callback Pakasir masuk)
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  -- order_total_amount: total NORMAL produk (jumlah subtotal items),
  -- ditampilkan di invoice/dashboard.
  order_total_amount integer not null check (order_total_amount >= 0),
  -- payment_amount: nominal yang di-charge ke payment gateway. Phase 3
  -- demo Pakasir = 1. Phase production nanti ganti = order_total_amount.
  payment_amount integer not null default 1 check (payment_amount >= 0),
  -- payment_provider: nullable sampai Phase 3 generate Pakasir QRIS
  payment_provider text check (payment_provider in ('pakasir')),
  payment_reference text,
  -- created_from_source: dari mana order ini dibuat. Mirror finance pattern.
  created_from_source text not null default 'dashboard'
    check (created_from_source in ('dashboard', 'chat', 'system')),
  -- created_by: nama user/agent yang create. Untuk audit.
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists orders_business_created_idx
  on public.orders(business_id, created_at desc)
  where deleted_at is null;

create index if not exists orders_business_status_idx
  on public.orders(business_id, order_status)
  where deleted_at is null;

create index if not exists orders_business_payment_idx
  on public.orders(business_id, payment_status)
  where deleted_at is null;

-- =====================================================================
-- order_items
-- Snapshot pattern: kolom sku/product_name/unit_price di-copy dari
-- products saat create. product_id ON DELETE SET NULL supaya kalau
-- produk dihapus nanti, history tetap punya snapshot.
-- =====================================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  -- business_id denormalized: bikin RLS policy lebih efisien (no join needed)
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  -- Snapshot kolom (immutable setelah insert):
  sku text not null,
  product_name text not null,
  qty integer not null check (qty > 0),
  unit_price integer not null check (unit_price >= 0),
  subtotal integer not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx
  on public.order_items(order_id);

create index if not exists order_items_business_idx
  on public.order_items(business_id);

-- =====================================================================
-- Trigger set_updated_at (reuse function dari migration 0001)
-- =====================================================================
drop trigger if exists set_updated_at on public.orders;
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS — pattern mengikuti products/categories/transactions
-- =====================================================================
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- orders policies
drop policy if exists "orders_select_business" on public.orders;
create policy "orders_select_business" on public.orders
  for select to authenticated
  using (business_id = public.current_business_id());

drop policy if exists "orders_insert_business" on public.orders;
create policy "orders_insert_business" on public.orders
  for insert to authenticated
  with check (business_id = public.current_business_id());

drop policy if exists "orders_update_business" on public.orders;
create policy "orders_update_business" on public.orders
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

drop policy if exists "orders_delete_business" on public.orders;
create policy "orders_delete_business" on public.orders
  for delete to authenticated
  using (business_id = public.current_business_id());

-- order_items policies (mirror, scoped via denormalized business_id)
drop policy if exists "order_items_select_business" on public.order_items;
create policy "order_items_select_business" on public.order_items
  for select to authenticated
  using (business_id = public.current_business_id());

drop policy if exists "order_items_insert_business" on public.order_items;
create policy "order_items_insert_business" on public.order_items
  for insert to authenticated
  with check (business_id = public.current_business_id());

drop policy if exists "order_items_delete_business" on public.order_items;
create policy "order_items_delete_business" on public.order_items
  for delete to authenticated
  using (business_id = public.current_business_id());
