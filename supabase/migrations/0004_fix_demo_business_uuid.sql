-- =====================================================================
-- 0004_fix_demo_business_uuid.sql
--
-- Fix demo business UUID dari pattern lama
-- '00000000-0000-0000-0000-000000000001' (yang tidak match RFC 4122 v1-v5
-- dan ditolak oleh validator zod.string().uuid()) ke UUID v4 valid:
-- '11111111-1111-4111-8111-111111111111'.
--
-- IDEMPOTENT: aman dijalankan berulang. Kalau business UUID lama tidak
-- ada di database, migration ini no-op (tidak melakukan apa-apa).
--
-- KAPAN MIGRATION INI PERLU DIJALANKAN:
-- - Hanya kalau kamu pernah jalankan seed.sql versi lama (sebelum
--   patch UUID) di Supabase production.
-- - Untuk install baru: langsung jalankan seed.sql terbaru, migration
--   ini tidak diperlukan.
--
-- Strategi: insert business row baru dengan UUID baru, repoint semua
-- FK reference di child tables (profiles, categories, transactions,
-- receivables, receivable_payments), lalu hapus business row lama.
-- Tidak bisa pakai UPDATE pada PK karena FK-nya ON UPDATE NO ACTION.
-- =====================================================================

do $$
declare
  v_old_id uuid := '00000000-0000-0000-0000-000000000001';
  v_new_id uuid := '11111111-1111-4111-8111-111111111111';
begin
  -- Skip kalau business UUID lama tidak ada
  if not exists (select 1 from public.businesses where id = v_old_id) then
    raise notice '[0004] Demo business lama tidak ditemukan, skip migration.';
    return;
  end if;

  -- Edge case: kalau row dengan UUID baru sudah ada juga (mungkin partial
  -- run sebelumnya), cukup hapus yang lama (cascade akan bersih-bersih
  -- child rows yang nyangkut di business lama).
  if exists (select 1 from public.businesses where id = v_new_id) then
    raise notice '[0004] UUID baru sudah ada, cleanup business lama saja.';
    delete from public.businesses where id = v_old_id;
    return;
  end if;

  -- Migrasi data:
  -- 1. Insert business baru dengan UUID baru (copy nama, owner, timestamp)
  insert into public.businesses (id, name, owner_name, created_at, updated_at)
  select v_new_id, name, owner_name, created_at, updated_at
  from public.businesses
  where id = v_old_id;

  -- 2. Repoint semua FK reference dari old → new
  update public.profiles
    set business_id = v_new_id
    where business_id = v_old_id;

  update public.categories
    set business_id = v_new_id
    where business_id = v_old_id;

  update public.transactions
    set business_id = v_new_id
    where business_id = v_old_id;

  update public.receivables
    set business_id = v_new_id
    where business_id = v_old_id;

  update public.receivable_payments
    set business_id = v_new_id
    where business_id = v_old_id;

  -- 3. Hapus row business lama (sekarang tidak punya child apa-apa)
  delete from public.businesses where id = v_old_id;

  raise notice '[0004] Demo business UUID berhasil dimigrasi dari % ke %.',
    v_old_id, v_new_id;
end $$;
