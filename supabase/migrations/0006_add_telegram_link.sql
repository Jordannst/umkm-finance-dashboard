-- =====================================================================
-- 0006_add_telegram_link.sql
--
-- Hubungkan akun owner ke Telegram chat_id supaya integrasi Liana
-- (OpenClaw via /hooks/agent) bisa kirim balasan ke chat yang tepat.
--
-- Field:
--   - telegram_chat_id: numeric chat_id dari Telegram (string supaya
--     handle ID besar > 2^53)
--   - telegram_linked_at: timestamp saat link berhasil disimpan
--
-- IDEMPOTENT: pakai `if not exists`. Aman dijalankan berulang.
-- =====================================================================

alter table public.profiles
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_linked_at timestamptz;

comment on column public.profiles.telegram_chat_id is
  'Chat ID Telegram user (string). Dipakai integrasi Liana untuk forward prompt ke OpenClaw /hooks/agent dengan target telegram:<chat_id>.';

comment on column public.profiles.telegram_linked_at is
  'Waktu user berhasil menghubungkan akun Telegram-nya.';

-- Index opsional: lookup by chat_id (untuk webhook callback dari OpenClaw
-- yang ingin map chat_id -> profile/business). Partial index supaya tidak
-- index row yang null (mayoritas user awal belum link).
create index if not exists profiles_telegram_chat_id_idx
  on public.profiles (telegram_chat_id)
  where telegram_chat_id is not null;
