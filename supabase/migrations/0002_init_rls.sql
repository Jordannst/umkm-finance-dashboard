-- =====================================================================
-- 0002_init_rls.sql
-- Helper, trigger handle_new_user, dan RLS policies.
-- Wajib dijalankan setelah 0001_init_schema.sql.
-- =====================================================================

-- =====================================================================
-- Helper: current_business_id()
-- Mengembalikan business_id dari profile user yang sedang login.
-- Dipakai di semua RLS policy untuk filtering data per-business.
-- =====================================================================
create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select business_id
  from public.profiles
  where id = auth.uid()
$$;

grant execute on function public.current_business_id() to anon, authenticated;

-- =====================================================================
-- Trigger: handle_new_user
-- Saat user baru signup, otomatis buat profile dan attach ke business
-- pertama yang ada (untuk MVP single-tenant).
--
-- Sprint 7+: bisa diganti dengan flow invite/join multi-business.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business_id uuid;
  v_full_name text;
begin
  select id into v_business_id
  from public.businesses
  order by created_at asc
  limit 1;

  v_full_name := nullif(coalesce(new.raw_user_meta_data->>'full_name', ''), '');

  insert into public.profiles (id, business_id, full_name, role)
  values (new.id, v_business_id, v_full_name, 'owner')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Enable RLS
-- =====================================================================
alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.receivables enable row level security;
alter table public.receivable_payments enable row level security;

-- =====================================================================
-- profiles
-- User hanya boleh baca dan update profile-nya sendiri.
-- =====================================================================
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- =====================================================================
-- businesses
-- User hanya boleh baca dan edit business yang dia ikuti.
-- =====================================================================
drop policy if exists "businesses_select_member" on public.businesses;
create policy "businesses_select_member" on public.businesses
  for select to authenticated
  using (id = public.current_business_id());

drop policy if exists "businesses_update_member" on public.businesses;
create policy "businesses_update_member" on public.businesses
  for update to authenticated
  using (id = public.current_business_id())
  with check (id = public.current_business_id());

-- =====================================================================
-- categories
-- =====================================================================
drop policy if exists "categories_select_business" on public.categories;
create policy "categories_select_business" on public.categories
  for select to authenticated
  using (business_id = public.current_business_id());

drop policy if exists "categories_insert_business" on public.categories;
create policy "categories_insert_business" on public.categories
  for insert to authenticated
  with check (business_id = public.current_business_id());

drop policy if exists "categories_update_business" on public.categories;
create policy "categories_update_business" on public.categories
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

drop policy if exists "categories_delete_business" on public.categories;
create policy "categories_delete_business" on public.categories
  for delete to authenticated
  using (business_id = public.current_business_id());

-- =====================================================================
-- transactions
-- =====================================================================
drop policy if exists "transactions_select_business" on public.transactions;
create policy "transactions_select_business" on public.transactions
  for select to authenticated
  using (business_id = public.current_business_id());

drop policy if exists "transactions_insert_business" on public.transactions;
create policy "transactions_insert_business" on public.transactions
  for insert to authenticated
  with check (business_id = public.current_business_id());

drop policy if exists "transactions_update_business" on public.transactions;
create policy "transactions_update_business" on public.transactions
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

drop policy if exists "transactions_delete_business" on public.transactions;
create policy "transactions_delete_business" on public.transactions
  for delete to authenticated
  using (business_id = public.current_business_id());

-- =====================================================================
-- receivables
-- =====================================================================
drop policy if exists "receivables_select_business" on public.receivables;
create policy "receivables_select_business" on public.receivables
  for select to authenticated
  using (business_id = public.current_business_id());

drop policy if exists "receivables_insert_business" on public.receivables;
create policy "receivables_insert_business" on public.receivables
  for insert to authenticated
  with check (business_id = public.current_business_id());

drop policy if exists "receivables_update_business" on public.receivables;
create policy "receivables_update_business" on public.receivables
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

drop policy if exists "receivables_delete_business" on public.receivables;
create policy "receivables_delete_business" on public.receivables
  for delete to authenticated
  using (business_id = public.current_business_id());

-- =====================================================================
-- receivable_payments
-- =====================================================================
drop policy if exists "receivable_payments_select_business" on public.receivable_payments;
create policy "receivable_payments_select_business" on public.receivable_payments
  for select to authenticated
  using (business_id = public.current_business_id());

drop policy if exists "receivable_payments_insert_business" on public.receivable_payments;
create policy "receivable_payments_insert_business" on public.receivable_payments
  for insert to authenticated
  with check (business_id = public.current_business_id());

drop policy if exists "receivable_payments_delete_business" on public.receivable_payments;
create policy "receivable_payments_delete_business" on public.receivable_payments
  for delete to authenticated
  using (business_id = public.current_business_id());
