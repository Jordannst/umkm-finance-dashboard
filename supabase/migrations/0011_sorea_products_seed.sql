-- =====================================================================
-- 0011_sorea_products_seed.sql
-- Seed 12 produk demo SOREA ke demo business UUID.
-- Idempotent: ON CONFLICT DO NOTHING memastikan re-run aman.
--
-- Target business_id: 11111111-1111-4111-8111-111111111111
-- (UUID demo dari migration 0004_fix_demo_business_uuid.sql)
--
-- CATATAN: Seed ini HANYA untuk demo/development. Production environment
-- yang multi-tenant tidak perlu seed ini — admin akan menambah produk
-- mereka sendiri via UI dashboard.
-- =====================================================================

do $$
declare
  v_demo_business uuid := '11111111-1111-4111-8111-111111111111';
begin
  -- Skip kalau demo business tidak ada (e.g. fresh install non-demo)
  if not exists (select 1 from public.businesses where id = v_demo_business) then
    raise notice '[0011] Demo business % tidak ditemukan, skip seed produk.', v_demo_business;
    return;
  end if;

  -- Insert 12 produk SOREA dengan ON CONFLICT DO NOTHING.
  -- Kalau seed dijalankan ulang dan SKU sudah ada, row di-skip
  -- (tidak overwrite price/status — admin mungkin sudah edit manual).
  insert into public.products
    (business_id, sku, name, category, price, stock_status, is_active)
  values
    (v_demo_business, 'P001', 'SOREA Kopi Susu',         'Coffee',      18000, 'ready', true),
    (v_demo_business, 'P002', 'SOREA Aren Latte',        'Coffee',      20000, 'ready', true),
    (v_demo_business, 'P003', 'SOREA Vanilla Latte',     'Coffee',      21000, 'ready', true),
    (v_demo_business, 'P004', 'SOREA Matcha Cream',      'Non-Coffee',  22000, 'ready', true),
    (v_demo_business, 'P005', 'SOREA Chocolate Cloud',   'Non-Coffee',  20000, 'ready', true),
    (v_demo_business, 'P006', 'SOREA Strawberry Milk',   'Non-Coffee',  19000, 'ready', true),
    (v_demo_business, 'P007', 'SOREA Lemon Tea',         'Tea & Fresh', 15000, 'ready', true),
    (v_demo_business, 'P008', 'SOREA Lychee Tea',        'Tea & Fresh', 18000, 'ready', true),
    (v_demo_business, 'P009', 'Toast Cokelat Keju',      'Snack',       17000, 'ready', true),
    (v_demo_business, 'P010', 'French Fries',            'Snack',       16000, 'ready', true),
    (v_demo_business, 'P011', 'Paket Calm Day',          'Paket Hemat', 32000, 'ready', true),
    (v_demo_business, 'P012', 'Paket Fresh Mood',        'Paket Hemat', 30000, 'ready', true)
  on conflict (business_id, sku) do nothing;

  raise notice '[0011] SOREA products seed selesai untuk business %.', v_demo_business;
end $$;
