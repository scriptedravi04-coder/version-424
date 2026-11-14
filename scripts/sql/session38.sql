-- Session 38 (Ravi: "PHELE YE SAB THEEK KRO") — run once in Supabase → SQL Editor.
-- Only ADDS columns. Safe to run twice.
--
-- Brand / agency markup (the % added to a creator's rate card when a brand or agency views it)
-- and the matching deduction %s used to live only in the server's local file (lost on every
-- deploy, different on every Cloud Run instance). They now sit next to the other fee settings.
-- Defaults are the values the app used until now.

alter table public.platform_fee_config add column if not exists brand_markup_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists creator_deduction_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists agency_markup_pct numeric not null default 5;
alter table public.platform_fee_config add column if not exists agency_deduction_pct numeric not null default 5;

-- Make sure the server can read the new columns right away (PostgREST schema cache).
notify pgrst, 'reload schema';
