-- =====================================================================
-- 0001_init_schema.sql
-- Schema awal Dashboard Keuangan UMKM.
-- Idempotent: aman dijalankan berulang.
-- =====================================================================

create extension if not exists pgcrypto with schema public;

-- =====================================================================
-- businesses
-- =====================================================================
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- profiles (1:1 dengan auth.users)
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  full_name text,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_business_id_idx on public.profiles(business_id);

-- =====================================================================
-- categories
-- =====================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'receivable')),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (business_id, type, slug)
);

create index if not exists categories_business_type_idx
  on public.categories(business_id, type);

-- =====================================================================
-- transactions
-- =====================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'receivable_payment')),
  amount numeric(14,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  category_name text,
  note text,
  transaction_date date not null default current_date,
  source text not null default 'dashboard'
    check (source in ('dashboard', 'chat', 'system')),
  related_receivable_id uuid,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists transactions_business_date_idx
  on public.transactions(business_id, transaction_date desc)
  where deleted_at is null;

create index if not exists transactions_business_type_idx
  on public.transactions(business_id, type)
  where deleted_at is null;

create index if not exists transactions_related_receivable_idx
  on public.transactions(related_receivable_id);

-- =====================================================================
-- receivables
-- =====================================================================
create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'unpaid'
    check (status in ('unpaid', 'partial', 'paid')),
  category_id uuid references public.categories(id) on delete set null,
  category_name text,
  note text,
  due_date date,
  created_from_source text not null default 'dashboard'
    check (created_from_source in ('dashboard', 'chat', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (paid_amount <= amount)
);

create index if not exists receivables_business_status_idx
  on public.receivables(business_id, status)
  where deleted_at is null;

create index if not exists receivables_business_due_idx
  on public.receivables(business_id, due_date)
  where deleted_at is null;

-- FK transactions.related_receivable_id → receivables.id
-- (didefinisikan setelah receivables ada agar tidak circular pada CREATE TABLE)
alter table public.transactions
  drop constraint if exists transactions_related_receivable_id_fkey;
alter table public.transactions
  add constraint transactions_related_receivable_id_fkey
  foreign key (related_receivable_id)
  references public.receivables(id)
  on delete set null;

-- =====================================================================
-- receivable_payments
-- =====================================================================
create table if not exists public.receivable_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  receivable_id uuid not null references public.receivables(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  source text not null default 'dashboard'
    check (source in ('dashboard', 'chat', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists receivable_payments_receivable_idx
  on public.receivable_payments(receivable_id);

create index if not exists receivable_payments_business_date_idx
  on public.receivable_payments(business_id, payment_date desc);

-- =====================================================================
-- Trigger umum: set updated_at = now() saat UPDATE
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.businesses;
create trigger set_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.transactions;
create trigger set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.receivables;
create trigger set_updated_at before update on public.receivables
  for each row execute function public.set_updated_at();
