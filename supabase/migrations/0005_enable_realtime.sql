-- =====================================================================
-- 0005_enable_realtime.sql
--
-- Enable Supabase Realtime untuk tabel transactions dan receivables.
-- Tabel harus ada di publication `supabase_realtime` supaya event
-- INSERT/UPDATE/DELETE di-broadcast ke client yang subscribe.
--
-- IDEMPOTENT: cek dulu apakah tabel sudah di publication.
-- Aman dijalankan berulang.
--
-- RLS NOTE: Realtime broadcast respect RLS. User hanya menerima event
-- untuk row yang dia bisa SELECT (filtered by current_business_id()).
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
    raise notice '[0005] transactions added to supabase_realtime publication';
  else
    raise notice '[0005] transactions already in supabase_realtime, skip';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'receivables'
  ) then
    alter publication supabase_realtime add table public.receivables;
    raise notice '[0005] receivables added to supabase_realtime publication';
  else
    raise notice '[0005] receivables already in supabase_realtime, skip';
  end if;
end $$;
