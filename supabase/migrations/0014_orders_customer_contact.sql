-- =====================================================================
-- 0014_orders_customer_contact.sql
-- SOREA Phase 4B: tambah info kontak customer untuk auto-notify saat
-- pembayaran lunas (Pakasir webhook → Telegram message).
--
-- Kolom:
--   customer_contact_channel  text  Channel kontak: 'telegram' | 'whatsapp' | null.
--                                   Null untuk order yang dibuat dari web /
--                                   POS yang belum punya channel kontak.
--   customer_contact_id       text  Identifier customer di channel itu:
--                                   - telegram → chat_id (mis. "123456789"
--                                     atau "-100123456789" untuk group)
--                                   - whatsapp → MSISDN (E.164, mis. "+628...")
--                                   Disimpan as text karena Telegram chat_id
--                                   bisa negatif & WhatsApp punya leading zero.
--
-- Pakai-case Phase 4B:
--   1) Liana terima /pesan dari customer di Telegram.
--   2) Liana panggil umkm_create_order dengan telegram_chat_id dari context.
--   3) Saat customer bayar via QRIS, Pakasir webhook update payment_status='paid'.
--   4) Webhook handler check kalau order ini punya customer_contact_*, kirim
--      Telegram message "Pesanan ORD-XXX sudah dibayar ✅" via Bot API.
--
-- Tidak ada index karena query selalu by id/order_code, kolom ini cuma
-- payload utk notify (read-write rasio rendah).
--
-- Idempotent: pakai add column if not exists.
-- =====================================================================

alter table public.orders
  add column if not exists customer_contact_channel text,
  add column if not exists customer_contact_id text;

comment on column public.orders.customer_contact_channel is
  'Channel kontak customer: telegram | whatsapp | null. Phase 4B: '
  'auto-notify saat payment_status berubah jadi paid.';

comment on column public.orders.customer_contact_id is
  'Identifier customer di channel: chat_id (telegram), MSISDN (whatsapp). '
  'Disimpan as text karena Telegram chat_id bisa negatif (group/channel) '
  'dan WhatsApp punya leading zero / +. Phase 4B: untuk auto-notify.';

-- Constraint: kalau channel di-set, id wajib di-set juga (atau dua-duanya null).
-- Idempotent via do block supaya rerun tidak error kalau constraint udah ada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_customer_contact_pair_chk'
  ) then
    alter table public.orders
      add constraint orders_customer_contact_pair_chk
      check (
        (customer_contact_channel is null and customer_contact_id is null)
        or
        (customer_contact_channel is not null and customer_contact_id is not null)
      );
  end if;
end $$;

-- Constraint: channel harus di whitelist supaya gak ada typo/string random.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_customer_contact_channel_chk'
  ) then
    alter table public.orders
      add constraint orders_customer_contact_channel_chk
      check (
        customer_contact_channel is null
        or customer_contact_channel in ('telegram', 'whatsapp')
      );
  end if;
end $$;
