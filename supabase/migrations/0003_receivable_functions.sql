-- =====================================================================
-- 0003_receivable_functions.sql
--
-- Fungsi atomik untuk pembayaran piutang. Dalam satu transaction:
--   1. Insert ke `transactions` (type='receivable_payment')
--   2. Insert ke `receivable_payments` (linked ke transaction)
--   3. Update `receivables.paid_amount` dan `receivables.status`
--
-- Security INVOKER (default), RLS tetap berlaku - user hanya boleh
-- membayar piutang dari business yang dia ikuti.
--
-- Wajib dijalankan setelah 0001_init_schema.sql dan 0002_init_rls.sql.
-- =====================================================================

create or replace function public.pay_receivable(
  p_receivable_id uuid,
  p_amount numeric,
  p_payment_date date default current_date,
  p_note text default null,
  p_source text default 'dashboard',
  p_created_by text default null
)
returns public.receivables
language plpgsql
security invoker
as $$
declare
  v_receivable public.receivables%rowtype;
  v_transaction_id uuid;
  v_remaining numeric;
  v_new_paid numeric;
  v_new_status text;
  v_category_id uuid;
  v_category_name text;
begin
  -- ---- Input validation ----
  if p_amount is null or p_amount <= 0 then
    raise exception 'Jumlah pembayaran harus lebih dari 0'
      using errcode = '22023';
  end if;

  if p_source not in ('dashboard', 'chat', 'system') then
    raise exception 'Source tidak valid: %', p_source
      using errcode = '22023';
  end if;

  -- ---- Lock receivable row ----
  select * into v_receivable
  from public.receivables
  where id = p_receivable_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Piutang tidak ditemukan atau sudah dihapus'
      using errcode = 'P0002';
  end if;

  if v_receivable.status = 'paid' then
    raise exception 'Piutang sudah lunas'
      using errcode = '22023';
  end if;

  v_remaining := v_receivable.amount - v_receivable.paid_amount;

  if p_amount > v_remaining then
    raise exception 'Jumlah pembayaran (%) melebihi sisa piutang (%)',
      p_amount, v_remaining
      using errcode = '22023';
  end if;

  -- ---- Hitung status baru ----
  v_new_paid := v_receivable.paid_amount + p_amount;
  if v_new_paid >= v_receivable.amount then
    v_new_status := 'paid';
  else
    v_new_status := 'partial';
  end if;

  -- ---- Cari kategori income 'pembayaran_piutang' untuk audit ----
  select id, name into v_category_id, v_category_name
  from public.categories
  where business_id = v_receivable.business_id
    and type = 'income'
    and slug = 'pembayaran_piutang'
  limit 1;

  -- ---- Insert transaksi pemasukan (receivable_payment) ----
  insert into public.transactions (
    business_id,
    type,
    amount,
    category_id,
    category_name,
    note,
    transaction_date,
    source,
    related_receivable_id,
    created_by
  )
  values (
    v_receivable.business_id,
    'receivable_payment',
    p_amount,
    v_category_id,
    coalesce(v_category_name, 'Pembayaran Piutang'),
    coalesce(
      p_note,
      'Pembayaran piutang ' || v_receivable.customer_name
    ),
    p_payment_date,
    p_source,
    v_receivable.id,
    p_created_by
  )
  returning id into v_transaction_id;

  -- ---- Insert receivable_payment row ----
  insert into public.receivable_payments (
    business_id,
    receivable_id,
    transaction_id,
    amount,
    payment_date,
    note,
    source
  )
  values (
    v_receivable.business_id,
    v_receivable.id,
    v_transaction_id,
    p_amount,
    p_payment_date,
    p_note,
    p_source
  );

  -- ---- Update receivable ----
  update public.receivables
  set paid_amount = v_new_paid,
      status = v_new_status
  where id = v_receivable.id
  returning * into v_receivable;

  return v_receivable;
end;
$$;

grant execute on function public.pay_receivable(
  uuid, numeric, date, text, text, text
) to authenticated;
