create extension if not exists pgcrypto;

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  merchant_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_balances (
  id uuid primary key default gen_random_uuid(),
  merchant_name text not null,
  balance_date date not null,
  opening_balance numeric(12,2) not null default 0,
  cash_in numeric(12,2) not null default 0,
  cash_out numeric(12,2) not null default 0,
  closing_balance numeric(12,2) not null default 0,
  misc_expense numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.daily_balances
  add column if not exists misc_expense numeric(12,2) not null default 0;

alter table public.daily_balances
  add column if not exists entry_type text not null default 'daily';

alter table public.daily_balances
  add column if not exists bank_amount numeric(12,2) not null default 0;

alter table public.merchants
  add column if not exists initial_balance numeric(12,2) not null default 0;

insert into public.merchants (merchant_name)
select distinct merchant_name
from public.daily_balances
where merchant_name is not null and btrim(merchant_name) <> ''
on conflict (merchant_name) do nothing;

create index if not exists daily_balances_merchant_date_idx
  on public.daily_balances (merchant_name, balance_date desc);

alter table public.merchants enable row level security;
alter table public.daily_balances enable row level security;

drop policy if exists "Allow merchant insert for everyone" on public.merchants;
create policy "Allow merchant insert for everyone"
  on public.merchants
  for insert
  with check (true);

drop policy if exists "Allow merchant read for everyone" on public.merchants;
create policy "Allow merchant read for everyone"
  on public.merchants
  for select
  using (true);

drop policy if exists "Allow merchant update for everyone" on public.merchants;
create policy "Allow merchant update for everyone"
  on public.merchants
  for update
  using (true)
  with check (true);

drop policy if exists "Allow merchant delete for everyone" on public.merchants;
create policy "Allow merchant delete for everyone"
  on public.merchants
  for delete
  using (true);

drop policy if exists "Allow insert for everyone" on public.daily_balances;
create policy "Allow insert for everyone"
  on public.daily_balances
  for insert
  with check (true);

drop policy if exists "Allow read for everyone" on public.daily_balances;
create policy "Allow read for everyone"
  on public.daily_balances
  for select
  using (true);

drop policy if exists "Allow update for everyone" on public.daily_balances;
create policy "Allow update for everyone"
  on public.daily_balances
  for update
  using (true)
  with check (true);

drop policy if exists "Allow delete for everyone" on public.daily_balances;
create policy "Allow delete for everyone"
  on public.daily_balances
  for delete
  using (true);

-- ============================================================
-- LOGIN REQUIRED (Supabase Auth)
-- Run this whole file once. These policies replace the
-- "everyone" policies above so only signed-in users can
-- read or write data.
-- ============================================================

drop policy if exists "Allow merchant insert for everyone" on public.merchants;
drop policy if exists "Allow merchant read for everyone" on public.merchants;
drop policy if exists "Allow merchant update for everyone" on public.merchants;
drop policy if exists "Allow merchant delete for everyone" on public.merchants;
drop policy if exists "Allow insert for everyone" on public.daily_balances;
drop policy if exists "Allow read for everyone" on public.daily_balances;
drop policy if exists "Allow update for everyone" on public.daily_balances;
drop policy if exists "Allow delete for everyone" on public.daily_balances;

drop policy if exists "Auth read merchants" on public.merchants;
create policy "Auth read merchants"
  on public.merchants for select to authenticated using (true);

drop policy if exists "Auth insert merchants" on public.merchants;
create policy "Auth insert merchants"
  on public.merchants for insert to authenticated with check (true);

drop policy if exists "Auth update merchants" on public.merchants;
create policy "Auth update merchants"
  on public.merchants for update to authenticated using (true) with check (true);

drop policy if exists "Auth delete merchants" on public.merchants;
create policy "Auth delete merchants"
  on public.merchants for delete to authenticated using (true);

drop policy if exists "Auth read balances" on public.daily_balances;
create policy "Auth read balances"
  on public.daily_balances for select to authenticated using (true);

drop policy if exists "Auth insert balances" on public.daily_balances;
create policy "Auth insert balances"
  on public.daily_balances for insert to authenticated with check (true);

drop policy if exists "Auth update balances" on public.daily_balances;
create policy "Auth update balances"
  on public.daily_balances for update to authenticated using (true) with check (true);

drop policy if exists "Auth delete balances" on public.daily_balances;
create policy "Auth delete balances"
  on public.daily_balances for delete to authenticated using (true);
