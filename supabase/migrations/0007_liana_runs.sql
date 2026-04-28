-- =====================================================================
-- 0007_liana_runs.sql
--
-- Tabel persistence untuk request "Tanya Liana" dari dashboard.
-- Setiap klik tombol Tanya Liana → satu row di sini.
-- Lifecycle:
--   1. Dashboard insert row dengan status='pending', simpan prompt user
--   2. Backend forward ke OpenClaw /hooks/agent → dapat runId
--   3. Backend update row dengan run_id (link ke OpenClaw)
--   4. Liana proses + kirim balasan Telegram
--   5. Liana POST callback ke /api/liana/run-callback dengan reply_text
--   6. Backend update row: status='done', reply_text, delivered_at
--   7. Supabase Realtime push event → dashboard update inline chat panel
--
-- Status transitions:
--   pending → done    (success path)
--   pending → error   (forward fail / Liana error / timeout)
--
-- Privacy: user hanya lihat run-nya sendiri (RLS by user_id).
-- Owner tidak bisa snoop pertanyaan staf.
--
-- IDEMPOTENT: pakai `if not exists`. Aman dijalankan berulang.
-- =====================================================================

create table if not exists public.liana_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- runId dari OpenClaw. Nullable kalau forward ke OpenClaw gagal sebelum
  -- kita sempat dapat runId.
  run_id text unique,

  -- Prompt asli user (yang diketik / suggestion yang diklik)
  prompt text not null,

  -- Jawaban Liana (text plain atau markdown). Filled saat callback masuk.
  reply_text text,
  -- Format reply: 'plain' | 'markdown'. Default plain. Liana boleh override.
  reply_format text not null default 'plain',

  -- Status lifecycle
  status text not null default 'pending'
    check (status in ('pending', 'done', 'error')),
  error_message text,

  -- Timing
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index utama: list runs user terbaru duluan
create index if not exists liana_runs_user_id_created_idx
  on public.liana_runs (user_id, created_at desc);

-- Index untuk callback handler: lookup by runId
create index if not exists liana_runs_run_id_idx
  on public.liana_runs (run_id)
  where run_id is not null;

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.liana_runs enable row level security;

-- User hanya boleh SELECT run-nya sendiri.
drop policy if exists "liana_runs_select_own" on public.liana_runs;
create policy "liana_runs_select_own" on public.liana_runs
  for select to authenticated
  using (user_id = auth.uid());

-- INSERT/UPDATE/DELETE: tidak ada policy untuk authenticated user.
-- Hanya service-role (admin client di /api/liana/ask & /api/liana/run-callback)
-- yang boleh tulis. Service-role bypass RLS by default.

-- =====================================================================
-- Realtime: tambah ke publication supaya dashboard bisa subscribe ke
-- update row → live status update inline chat panel.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'liana_runs'
  ) then
    alter publication supabase_realtime add table public.liana_runs;
    raise notice '[0007] liana_runs added to supabase_realtime publication';
  else
    raise notice '[0007] liana_runs already in supabase_realtime, skip';
  end if;
end $$;

-- =====================================================================
-- Comments
-- =====================================================================

comment on table public.liana_runs is
  'History "Tanya Liana" dari dashboard. Setiap row = satu prompt user + jawaban Liana yang masuk via callback dari OpenClaw.';
comment on column public.liana_runs.run_id is
  'runId dari OpenClaw /hooks/agent. Dipakai callback handler untuk lookup row.';
comment on column public.liana_runs.prompt is
  'Prompt original user (suggestion yang diklik atau text yang diketik).';
comment on column public.liana_runs.reply_text is
  'Jawaban Liana yang sudah di-render. Filled saat callback masuk (status=done).';
comment on column public.liana_runs.reply_format is
  'Format reply text: plain | markdown. Default plain.';
comment on column public.liana_runs.status is
  'Lifecycle: pending (menunggu callback Liana) | done (sudah dibalas) | error (gagal di forward atau di Liana).';
