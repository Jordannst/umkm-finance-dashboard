-- =====================================================================
-- 0008_realtime_replica_identity.sql
--
-- Fix: Supabase Realtime tidak nge-broadcast INSERT/UPDATE event untuk
-- tabel `liana_runs` (dan kemungkinan transactions / receivables).
--
-- Root cause:
--   Supabase Realtime menerapkan RLS check terhadap row payload sebelum
--   broadcast ke client. Untuk UPDATE/DELETE, payload OLD diambil dari
--   Postgres WAL. Default REPLICA IDENTITY hanya log primary key di WAL,
--   jadi kolom yang dipakai RLS policy (`user_id`, `business_id`) tidak
--   tersedia → RLS check fail → event di-drop diam-diam.
--
-- Fix:
--   ALTER TABLE ... REPLICA IDENTITY FULL untuk semua tabel yang ada di
--   publication `supabase_realtime` DAN punya RLS policy yang refer ke
--   non-PK column.
--
-- Trade-off:
--   REPLICA IDENTITY FULL memperbesar WAL size (semua kolom di-log untuk
--   setiap UPDATE/DELETE). Untuk tabel volume tinggi ini bisa berdampak
--   ke storage + replication lag. Tapi untuk tabel dashboard kita yang
--   volume sedang, trade-off ini acceptable demi Realtime yang reliable.
--
-- IDEMPOTENT: aman dijalankan berulang.
-- =====================================================================

alter table public.liana_runs replica identity full;
alter table public.transactions replica identity full;
alter table public.receivables replica identity full;

do $$
begin
  raise notice '[0008] replica identity FULL set for liana_runs, transactions, receivables';
end $$;
