-- =====================================================================
-- seed.sql
-- Data awal untuk MVP single-tenant.
-- Idempotent: aman dijalankan berkali-kali.
--
-- Wajib dijalankan setelah 0001_init_schema.sql (dan boleh sebelum atau
-- sesudah 0002_init_rls.sql -- script pakai service role yang bypass RLS).
-- =====================================================================

-- Demo business. UUID-nya HARUS match dengan NEXT_PUBLIC_DEMO_BUSINESS_ID
-- di file .env.local. Default di .env.example:
--   00000000-0000-0000-0000-000000000001
insert into public.businesses (id, name, owner_name)
values (
  '00000000-0000-0000-0000-000000000001',
  'UMKM Demo Kopi Susu',
  'Owner Demo'
)
on conflict (id) do update
set name = excluded.name,
    owner_name = excluded.owner_name;

-- Default categories
do $$
declare
  v_business_id uuid := '00000000-0000-0000-0000-000000000001';
  v_pairs text[] := array[
    -- income
    'income:penjualan:Penjualan',
    'income:pembayaran_piutang:Pembayaran Piutang',
    'income:pendapatan_lain:Pendapatan Lain',
    -- expense
    'expense:bahan_baku:Bahan Baku',
    'expense:kemasan:Kemasan',
    'expense:operasional:Operasional',
    'expense:transport:Transport',
    'expense:utilitas:Utilitas',
    'expense:gaji:Gaji',
    'expense:lain_lain:Lain-lain',
    -- receivable
    'receivable:pelanggan_belum_bayar:Pelanggan Belum Bayar',
    'receivable:tempo:Pesanan Tempo',
    'receivable:titip_bayar:Titip Bayar'
  ];
  v_pair text;
  v_parts text[];
begin
  foreach v_pair in array v_pairs loop
    v_parts := string_to_array(v_pair, ':');
    insert into public.categories (business_id, type, slug, name)
    values (v_business_id, v_parts[1], v_parts[2], v_parts[3])
    on conflict (business_id, type, slug) do nothing;
  end loop;
end $$;
