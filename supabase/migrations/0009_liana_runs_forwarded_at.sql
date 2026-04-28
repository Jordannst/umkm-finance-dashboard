-- =====================================================================
-- 0009_liana_runs_forwarded_at.sql
--
-- Add forwarded_at column ke liana_runs. Di-set saat /api/liana/ask
-- berhasil forward request ke OpenClaw (sebelum LLM mulai proses).
--
-- Computed metrics (di chat panel + Supabase SQL):
--   forward_latency = forwarded_at - created_at
--   llm_latency     = delivered_at - forwarded_at
--   total_latency   = delivered_at - created_at
--
-- Nullable: row baru created (status=pending) belum punya forwarded_at;
-- runs yang sudah selesai sebelum migration ini juga akan punya nilai null.
--
-- IDEMPOTENT: pakai `if not exists`. Aman dijalankan berulang.
-- =====================================================================

alter table public.liana_runs
  add column if not exists forwarded_at timestamptz;

comment on column public.liana_runs.forwarded_at is
  'Saat OpenClaw return success di /hooks/agent (sebelum Liana proses LLM). Dipakai untuk hitung network vs LLM latency.';

do $$
begin
  raise notice '[0009] forwarded_at column added to liana_runs';
end $$;
