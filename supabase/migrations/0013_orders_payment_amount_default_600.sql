-- =====================================================================
-- 0013_orders_payment_amount_default_600.sql
-- SOREA Phase 3: ubah default payment_amount dari 1 → 600
--
-- Alasan: Pakasir minimum payment amount = Rp600. Demo QRIS yang Phase 2
-- pakai default Rp1 ditolak gateway. Migration ini:
--   1) Ubah column default ke 600 (untuk order baru ke depan).
--   2) Backfill order existing yang masih pakai default lama (1) DAN
--      belum dibayar — diasumsikan demo data, aman di-update.
--
-- Idempotent: aman dijalankan berulang.
-- =====================================================================

alter table public.orders alter column payment_amount set default 600;

-- Backfill: hanya update yang:
--   - payment_amount masih 1 (default Phase 2)
--   - belum dibayar (payment_status='pending')
--   - status order masih menunggu (gak ganggu yang udah selesai/dibatal)
-- Kalau ada produksi data dengan payment_amount=1 yang sengaja, gak akan
-- ke-touch karena pasti sudah lewat status menunggu_pembayaran.
update public.orders
set payment_amount = 600
where payment_amount = 1
  and payment_status = 'pending'
  and order_status = 'menunggu_pembayaran';

-- Catatan: kita TIDAK ubah orders yang sudah completed atau punya
-- payment_amount > 1, supaya history tetap auditable.
