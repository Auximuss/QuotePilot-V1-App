-- Run this in Supabase SQL Editor → New query

-- ── Quotes: add all missing columns ──────────────────────────────────────────
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customer_name              text,
  ADD COLUMN IF NOT EXISTS customer_address           text,
  ADD COLUMN IF NOT EXISTS customer_email             text,
  ADD COLUMN IF NOT EXISTS valid_days                 int     default 14,
  ADD COLUMN IF NOT EXISTS quote_number               text,
  ADD COLUMN IF NOT EXISTS signature_name             text,
  ADD COLUMN IF NOT EXISTS deposit_paid               boolean default false,
  ADD COLUMN IF NOT EXISTS deposit_paid_at            timestamptz,
  ADD COLUMN IF NOT EXISTS final_payment_requested    boolean default false,
  ADD COLUMN IF NOT EXISTS final_payment_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_payment_paid         boolean default false,
  ADD COLUMN IF NOT EXISTS final_payment_paid_at      timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_number             text,
  ADD COLUMN IF NOT EXISTS invoice_paid_at            timestamptz,
  ADD COLUMN IF NOT EXISTS actual_materials_cost      numeric(10,2),
  ADD COLUMN IF NOT EXISTS actual_hours               numeric(10,2),
  ADD COLUMN IF NOT EXISTS actual_hourly_rate         numeric(10,2);

-- ── Businesses: subscription columns ─────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS subscription_tier      text default 'free',
  ADD COLUMN IF NOT EXISTS subscription_status    text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- ── Variations table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variations (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid references quotes on delete cascade not null,
  description text not null,
  amount      numeric(10,2) default 0,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz default now()
);

ALTER TABLE variations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Owners manage their own variations"
    ON variations FOR ALL
    USING (quote_id IN (
      SELECT q.id FROM quotes q
      JOIN businesses b ON b.id = q.business_id
      WHERE b.owner_id = auth.uid()
    ))
    WITH CHECK (quote_id IN (
      SELECT q.id FROM quotes q
      JOIN businesses b ON b.id = q.business_id
      WHERE b.owner_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
