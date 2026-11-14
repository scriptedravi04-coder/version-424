-- SQL Migration for UGC Deadline Reminders, Auto-Relist & Brand Refunds
-- Run this in the Supabase SQL editor.

-- 1. ugc_orders fields for reminder tracking and expiration
ALTER TABLE ugc_orders
  ADD COLUMN IF NOT EXISTS reminders_sent int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_reason text;

-- 2. ugc_briefs fields for relisting and priority Explore sorting
ALTER TABLE ugc_briefs
  ADD COLUMN IF NOT EXISTS relisted_at timestamptz,
  ADD COLUMN IF NOT EXISTS relist_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_priority boolean DEFAULT false;

-- 3. users fields for creator reliability stats and WhatsApp opt-in
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS missed_deadlines_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean DEFAULT false;

-- 4. brand_refund_accounts for manual company bank transfer payouts
CREATE TABLE IF NOT EXISTS brand_refund_accounts (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  method_type text NOT NULL CHECK (method_type IN ('UPI', 'BANK')),
  upi_id text,
  bank_account_number text,
  bank_ifsc text,
  account_holder_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One refund account per brand (the API upserts on brand_id; without this every save fails).
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_refund_accounts_brand_id ON brand_refund_accounts(brand_id);
ALTER TABLE brand_refund_accounts ENABLE ROW LEVEL SECURITY;
-- No public policies: accessible exclusively by backend service-role

-- 5. ugc_refunds queue for brand brief cancellations (manual company payouts)
CREATE TABLE IF NOT EXISTS ugc_refunds (
  id text PRIMARY KEY,
  brief_id text NOT NULL,
  brand_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  slots int NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  refund_account_snapshot jsonb NOT NULL,
  utr text,
  failure_reason text,
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by text
);

CREATE INDEX IF NOT EXISTS idx_ugc_refunds_brand_id ON ugc_refunds(brand_id);
CREATE INDEX IF NOT EXISTS idx_ugc_refunds_brief_id ON ugc_refunds(brief_id);
CREATE INDEX IF NOT EXISTS idx_ugc_refunds_status ON ugc_refunds(status);
ALTER TABLE ugc_refunds ENABLE ROW LEVEL SECURITY;
-- No public policies: accessible exclusively by backend service-role

-- 6. If ugc_orders / ugc_briefs have a CHECK constraint on status, add the new values:
--    ugc_orders.status: 'EXPIRED'      ugc_briefs.status: 'CANCELLED', 'PARTIALLY_CANCELLED'
--    (Supabase Claude: inspect pg_constraint for these tables and extend the list if present.)

-- 7. Brief delivery hours (session 24, if not run yet)
ALTER TABLE ugc_briefs ADD COLUMN IF NOT EXISTS delivery_hours integer
  CHECK (delivery_hours IS NULL OR delivery_hours IN (24, 48, 72));
