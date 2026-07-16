-- Run this in your Supabase project → SQL Editor → New query
-- Adds all missing columns to the businesses table

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS phone              text,
  ADD COLUMN IF NOT EXISTS bank_name          text,
  ADD COLUMN IF NOT EXISTS bank_sort_code     text,
  ADD COLUMN IF NOT EXISTS bank_account       text,
  ADD COLUMN IF NOT EXISTS payment_link       text,
  ADD COLUMN IF NOT EXISTS google_review_link text,
  ADD COLUMN IF NOT EXISTS default_valid_days int     default 14,
  ADD COLUMN IF NOT EXISTS deposit_by_default boolean default false,
  ADD COLUMN IF NOT EXISTS deposit_percent    int     default 25,
  ADD COLUMN IF NOT EXISTS vat_number         text,
  ADD COLUMN IF NOT EXISTS quote_prefix       text,
  ADD COLUMN IF NOT EXISTS quote_next_num     int     default 1,
  ADD COLUMN IF NOT EXISTS payment_terms      text,
  ADD COLUMN IF NOT EXISTS exclusions         text;

-- Fix price_book_items column naming (app uses 'description', schema had 'label')
ALTER TABLE price_book_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS unit_price  numeric(10,2) default 0;

-- Quotes table: signature name column
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS signature_name text;
