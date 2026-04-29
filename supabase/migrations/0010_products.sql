-- =====================================================================
-- 0010_products.sql
-- SOREA Phase 1: Product Catalog
-- Idempotent: aman dijalankan berulang.
--
-- Tujuan: tabel produk untuk operational dashboard (catalog, order,
-- payment, chat). Phase 1 ini hanya membuat schema + RLS. Seed terpisah
-- di 0011_sorea_products_seed.sql.
-- =====================================================================

-- =====================================================================
-- products
-- =====================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sku text not null,
  name text not null,
  category text not null,
  -- price disimpan sebagai integer (rupiah utuh, tanpa desimal). Indonesia
  -- jarang pakai harga desimal di retail UMKM. Kalau suatu saat butuh
  -- desimal, ganti ke numeric(14,2) — semua client sudah pakai number.
  price integer not null check (price >= 0),
  stock_status text not null default 'ready'
    check (stock_status in ('ready', 'habis', 'terbatas', 'preorder')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- SKU unique PER BUSINESS, bukan global. Dua bisnis berbeda boleh
  -- punya SKU "P001" sendiri-sendiri.
  unique (business_id, sku)
);

-- Index untuk listing aktif (excludes soft-deleted dengan partial index)
create index if not exists products_business_active_idx
  on public.products(business_id, is_active)
  where deleted_at is null;

-- Index untuk filter by category (catalog page filter)
create index if not exists products_business_category_idx
  on public.products(business_id, category)
  where deleted_at is null;

-- =====================================================================
-- Trigger set_updated_at (reuse function dari migration 0001)
-- =====================================================================
drop trigger if exists set_updated_at on public.products;
create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS — pattern mengikuti categories/transactions:
-- semua policy scoped ke current_business_id() helper.
-- =====================================================================
alter table public.products enable row level security;

drop policy if exists "products_select_business" on public.products;
create policy "products_select_business" on public.products
  for select to authenticated
  using (business_id = public.current_business_id());

drop policy if exists "products_insert_business" on public.products;
create policy "products_insert_business" on public.products
  for insert to authenticated
  with check (business_id = public.current_business_id());

drop policy if exists "products_update_business" on public.products;
create policy "products_update_business" on public.products
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

drop policy if exists "products_delete_business" on public.products;
create policy "products_delete_business" on public.products
  for delete to authenticated
  using (business_id = public.current_business_id());
