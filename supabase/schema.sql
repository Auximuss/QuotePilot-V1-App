-- Run this once in your Supabase project's SQL editor.
-- It creates the tables, and locks every row to the business that owns it
-- via Row Level Security, keyed off auth.uid().

create extension if not exists "pgcrypto";

-- one row per signed-up builder/business, 1:1 with auth.users
create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users not null unique,
  name text not null,
  trade text,
  logo_url text,
  default_terms text,
  vat_registered boolean default false,
  created_at timestamptz default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses not null,
  name text not null,
  email text,
  phone text,
  address text,
  created_at timestamptz default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses not null,
  customer_id uuid references customers,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined')),
  raw_transcript text,
  job_title text,
  customer_summary text,
  scope_of_work jsonb default '[]'::jsonb,       -- string[]
  suggested_exclusions jsonb default '[]'::jsonb, -- string[]
  clarifications_needed jsonb default '[]'::jsonb,-- string[]
  ai_confidence numeric(4,1),                     -- e.g. 92.0
  notes text,
  deposit_requested boolean default false,
  deposit_percent numeric(5,2) default 25,
  subtotal numeric(10,2) default 0,
  vat_amount numeric(10,2) default 0,
  total numeric(10,2) default 0,
  pdf_url text,
  created_at timestamptz default now(),
  sent_at timestamptz,
  accepted_at timestamptz
);

create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes on delete cascade not null,
  category text not null check (category in ('material','labour')),
  description text not null,
  meta text,
  quantity numeric(10,2) default 1,
  unit text,
  unit_price numeric(10,2) default 0,
  total_price numeric(10,2) default 0,
  sort_order int default 0
);

-- builder's own rates, so future AI drafts start closer to accurate
create table price_book_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses not null,
  label text not null,
  category text not null check (category in ('material','labour')),
  default_unit_price numeric(10,2),
  unit text,
  updated_at timestamptz default now()
);

-- ---------- Row Level Security ----------

alter table businesses enable row level security;
alter table customers enable row level security;
alter table quotes enable row level security;
alter table quote_line_items enable row level security;
alter table price_book_items enable row level security;

create policy "Owners manage their own business row"
  on businesses for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage their own customers"
  on customers for all
  using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "Owners manage their own quotes"
  on quotes for all
  using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "Owners manage their own quote line items"
  on quote_line_items for all
  using (quote_id in (
    select q.id from quotes q
    join businesses b on b.id = q.business_id
    where b.owner_id = auth.uid()
  ))
  with check (quote_id in (
    select q.id from quotes q
    join businesses b on b.id = q.business_id
    where b.owner_id = auth.uid()
  ));

create policy "Owners manage their own price book"
  on price_book_items for all
  using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

-- Note: the customer-facing quote view (accept/decline/pay) needs to read a
-- single quote WITHOUT being logged in as the business. Handle that with a
-- dedicated API route using the service-role key (server-side only, never
-- exposed to the browser) rather than relaxing these policies — see
-- app/api/quotes/[id]/public/route.ts pattern in the README.

-- ── Migration: extend businesses with all settings columns ─────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS bank_name         text,
  ADD COLUMN IF NOT EXISTS bank_sort_code    text,
  ADD COLUMN IF NOT EXISTS bank_account      text,
  ADD COLUMN IF NOT EXISTS payment_link      text,
  ADD COLUMN IF NOT EXISTS google_review_link text,
  ADD COLUMN IF NOT EXISTS default_valid_days int  default 14,
  ADD COLUMN IF NOT EXISTS deposit_by_default boolean default false,
  ADD COLUMN IF NOT EXISTS deposit_percent    int  default 25,
  ADD COLUMN IF NOT EXISTS vat_number        text,
  ADD COLUMN IF NOT EXISTS quote_prefix      text,
  ADD COLUMN IF NOT EXISTS quote_next_num    int  default 1,
  ADD COLUMN IF NOT EXISTS payment_terms     text,
  ADD COLUMN IF NOT EXISTS exclusions        text;

-- price_book_items uses 'description' in app code, schema has 'label' — align it
ALTER TABLE price_book_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS unit_price  numeric(10,2) default 0;
