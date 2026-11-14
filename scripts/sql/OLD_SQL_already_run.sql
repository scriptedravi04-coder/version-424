-- Ybex — older SQL files in ONE file (v378, 1,000-file limit). Most were already run in Supabase.
-- Each part starts with  ==== <old file name> ====. Run a part only if its notes say it is still needed.


-- ==== onboarding_progress.sql ====

-- Session 34: onboarding progress (answers + current step), saved after every step so a creator or
-- brand continues exactly where they left, on any device. Read/written by the server only
-- (backend/onboardingProgress.ts, service-role key).
-- Run once in Supabase → SQL Editor.
create table if not exists public.onboarding_progress (
  user_id     text primary key,
  role        text not null check (role in ('creator', 'brand')),
  flow        text not null,
  page        text not null,
  pos         jsonb,
  answers     jsonb not null default '{}'::jsonb,
  basics_done boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.onboarding_progress enable row level security;
-- No policies on purpose: anon / logged-in browser clients get nothing.
revoke all on public.onboarding_progress from anon, authenticated;


-- ==== session62_explore_instagram.sql ====

-- v349 (Session 62, Ravi approved "Haan, kar do"): hide a creator from Explore without ban / delete,
-- and real Instagram data (username fetch via Business Discovery, verify by DM code or Instagram Login).
alter table public.creator_profiles add column if not exists hidden_from_explore boolean not null default false;
alter table public.creator_profiles add column if not exists instagram_verified_at timestamptz;
alter table public.creator_profiles add column if not exists instagram_verify_method text;
alter table public.creator_profiles add column if not exists instagram_synced_at timestamptz;
alter table public.creator_profiles add column if not exists instagram_stats jsonb;

-- Instagram Login tokens (server only — never readable from the browser).
create table if not exists public.instagram_connections (
  user_id text primary key,
  ig_user_id text,
  username text,
  method text not null default 'oauth',
  access_token_enc text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.instagram_connections enable row level security;
revoke all on public.instagram_connections from anon, authenticated;


-- ==== purge_aadhaar.sql ====

-- Session 34 (Ravi): Ybex no longer collects Aadhaar (KYC = PAN + bank/UPI). The Privacy Policy now
-- says so, so remove what older versions stored. Run in Supabase → SQL Editor AFTER checking the
-- counts in step 1. The image files themselves are in the private storage bucket "kyc-documents" —
-- delete those from Storage too (step 2 lists them).

-- 1. How many rows hold Aadhaar today (read only)
select count(*) filter (where coalesce(aadhaar_number, '') <> '') as with_number,
       count(*) filter (where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '') as with_images
from public.creator_kyc;

-- 2. List the image files first (copy this result), then delete them in Storage → kyc-documents
select aadhaar_front_url, aadhaar_back_url from public.creator_kyc
 where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

-- 3. Clear them
update public.creator_kyc
   set aadhaar_number = null, aadhaar_front_url = null, aadhaar_back_url = null
 where coalesce(aadhaar_number, '') <> '' or coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

update public.verifications
   set documents = documents - 'creator_aadhaar'
 where documents ? 'creator_aadhaar';



-- ==== v333_remove_duplicate_payout_row.sql ====

-- v333 — remove the duplicate payout row on the Dell mouse deal (left over from the v310 double-payout bug).
-- (fixed: the live table has payout_reference, not utr_number)
-- WAITS FOR RAVI'S OK. Run once in the Supabase SQL editor. Safe to run twice (the second run deletes nothing).
--   keep:   e7d720e7…  (PAID, ₹13,000 gross / ₹11,700 net, UTR 3245465787908)
--   delete: f3d6d152…  (empty copy — the receipt showed ₹0.00 and Earnings listed the deal twice because of it)
begin;

-- 1) Look first: must show exactly 2 rows for the same deal.
select id, deal_id, gross_amount, creator_net_amount, payout_status, payout_reference, created_at
from transactions
where id::text like 'f3d6d152%' or id::text like 'e7d720e7%';

-- 2) Delete only the empty copy, and only if the paid row for the same deal is really there.
delete from transactions d
where d.id::text like 'f3d6d152%'
  and coalesce(d.payout_reference, '') = ''
  and exists (
    select 1 from transactions k
    where k.id::text like 'e7d720e7%'
      and k.deal_id = d.deal_id
      and coalesce(k.payout_reference, '') <> ''
  );

commit;


-- ==== session35_schema_fixes.sql ====

-- Session 35 (7 Oct 2026): columns the app already writes but the live database never had.
-- Supabase refuses a whole insert/update when ONE key is not a column, so each gap below made a
-- real feature fail. Only ADD columns (all nullable), one trigger pair, and lock one table.
-- Nothing is dropped or renamed. Safe to run twice.

-- 1. Creator payout details (UPI / bank). The app saves by user_id; the table only had creator_id,
--    so "Save payout details" always returned an error.
alter table public.creator_payment_methods add column if not exists user_id text;
alter table public.creator_payment_methods add column if not exists upi_id text;
alter table public.creator_payment_methods add column if not exists bank_account_number text;
alter table public.creator_payment_methods add column if not exists bank_ifsc text;
alter table public.creator_payment_methods add column if not exists account_holder_name text;
alter table public.creator_payment_methods add column if not exists updated_at timestamptz;
do $$
declare c text;
begin
  foreach c in array array['creator_id', 'method_type', 'account_details'] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'creator_payment_methods'
                 and column_name = c and is_nullable = 'NO') then
      execute format('alter table public.creator_payment_methods alter column %I drop not null', c);
    end if;
  end loop;
end $$;
update public.creator_payment_methods set user_id = creator_id::text where user_id is null and creator_id is not null;
create or replace function public.ybex_payment_method_fill() returns trigger language plpgsql as $$
begin
  if new.creator_id is null and new.user_id is not null then
    begin new.creator_id := new.user_id; exception when others then null; end;
  end if;
  if new.method_type is null then
    new.method_type := case when coalesce(new.upi_id, '') <> '' then 'UPI' else 'BANK' end;
  end if;
  return new;
end $$;
drop trigger if exists ybex_payment_method_fill on public.creator_payment_methods;
create trigger ybex_payment_method_fill before insert or update on public.creator_payment_methods
  for each row execute function public.ybex_payment_method_fill();
create unique index if not exists creator_payment_methods_user_id_key on public.creator_payment_methods (user_id);
alter table public.creator_payment_methods enable row level security;
revoke all on public.creator_payment_methods from anon, authenticated;

-- 2. Creator "Request payout" + admin counters (transactions).
alter table public.transactions add column if not exists updated_at timestamptz;
alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists payout_requested boolean;
alter table public.transactions add column if not exists payout_request_count integer;
alter table public.transactions add column if not exists payout_request_notes text;
alter table public.transactions add column if not exists last_payout_requested_at timestamptz;

-- 3. Admin "mark payout paid" on UGC orders.
alter table public.ugc_orders add column if not exists payout_status text;
alter table public.ugc_orders add column if not exists utr_number text;
alter table public.ugc_orders add column if not exists deal_id text;
alter table public.payout_requests add column if not exists utr_number text;
alter table public.chat_threads add column if not exists ugc_order_id text;

-- 4. Brand: "N creators match this brief" read creator_profiles.niche.
alter table public.creator_profiles add column if not exists niche text;

-- 5. Brand profile city / state / agency type (onboarding + settings).
alter table public.brand_profiles add column if not exists city text;
alter table public.brand_profiles add column if not exists state text;
alter table public.brand_profiles add column if not exists agency_type text;

-- 6. Creator onboarding writes the date of birth on users; without the columns the whole users
--    update failed (including onboarded = true).
alter table public.users add column if not exists dob text;
alter table public.users add column if not exists date_of_birth text;

-- 7. Notifications written with id / link / data (campaign approvals, payment released, invites)
--    were refused. Keep notif_id as the key: fill it from id when a row comes without one.
alter table public.notifications add column if not exists id text;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists data jsonb;
create or replace function public.ybex_notif_fill() returns trigger language plpgsql as $$
begin
  if new.notif_id is null then
    new.notif_id := coalesce(new.id, 'notif_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  end if;
  if new.redirect_path is null and new.link is not null then new.redirect_path := new.link; end if;
  return new;
end $$;
drop trigger if exists ybex_notif_fill on public.notifications;
create trigger ybex_notif_fill before insert on public.notifications
  for each row execute function public.ybex_notif_fill();


-- ==== find_wrongly_completed_briefs.sql ====

-- Session 24. Briefs that were auto-marked COMPLETED while slots were still open
-- (bug: "Completed · Recruited 1/2"). Read-only: review the list first.
select b.id, b.title, b.brand_id, b.max_creators, b.claimed_count, b.budget,
       count(o.id) filter (where upper(coalesce(o.status,'')) in ('COMPLETED','PAID','RELEASED')
                           or upper(coalesce(o.payment_status,'')) in ('RELEASED','PAID')) as done_orders,
       (b.max_creators - count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED')) as open_slots,
       (b.max_creators - count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED')) * b.budget as escrow_on_open_slots
from public.ugc_briefs b
left join public.ugc_orders o on o.brief_id = b.id
where upper(coalesce(b.status,'')) = 'COMPLETED'
group by b.id
having count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED') < b.max_creators
order by b.created_at desc;

-- To reopen them for creators (only after reviewing the list above):
-- update public.ugc_briefs set status = 'OPEN' where id in ( ...ids from above... );


-- ==== user_consents.sql ====

-- Session 34: what each user agreed to (Terms, Privacy, marketing updates, Creator/Brand Terms),
-- which version and when. Written by the server only (backend/consents.ts, service-role key).
-- Run once in Supabase → SQL Editor.
create table if not exists public.user_consents (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  kind        text not null check (kind in ('terms', 'privacy', 'marketing', 'creator_terms', 'brand_terms')),
  granted     boolean not null,
  version     text not null default '1.0',
  source      text,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists user_consents_user_kind_idx on public.user_consents (user_id, kind, created_at desc);
alter table public.user_consents enable row level security;
revoke all on public.user_consents from anon, authenticated;

-- Public creator application: when the applicant agreed (the form works without this column too).
alter table public.waitlist add column if not exists terms_accepted_at timestamptz;


-- ==== session41.sql ====

-- Session 41 — Ravi approved building What's new + push notifications now ("now strt working").
-- Run this whole file once in Supabase → SQL editor after deploying v261. Safe to run again.
-- Session 41 — "What's new" popup. Run once in Supabase → SQL editor.
create table if not exists public.whats_new (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  points jsonb not null default '[]'::jsonb,
  audience text not null default 'all' check (audience in ('all', 'creator', 'brand')),
  cta_label text,
  cta_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whats_new_seen (
  user_id text not null,
  item_id uuid not null references public.whats_new(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Only the server (service key) reads and writes these tables.
alter table public.whats_new enable row level security;
alter table public.whats_new_seen enable row level security;

-- Push notifications ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  url text,
  audience text not null default 'all' check (audience in ('all', 'creator', 'brand', 'niche')),
  niches jsonb not null default '[]'::jsonb,
  send_at timestamptz,          -- empty = send now
  sent_at timestamptz,          -- set when it went out
  sent_count integer,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.push_log (
  user_id text not null,
  kind text not null,           -- 'promo' | 'deal'
  ref text not null,            -- push_campaigns.id or notifications.id
  sent_at timestamptz not null default now(),
  primary key (kind, ref, user_id)
);
create index if not exists push_log_promo_day_idx on public.push_log (kind, sent_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_campaigns enable row level security;
alter table public.push_log enable row level security;


-- ==== session40.sql ====

-- Session 40 (v260). Safe to run more than once.
-- Audience estimate: when a creator has not given likes / reach, "Authentic audience" and
-- "Performance score" are stored as NULL ("Not enough data") instead of a made-up number.
alter table public.creator_profiles alter column fake_follower_pct drop not null;
alter table public.creator_profiles alter column performance_score drop not null;


-- ==== session59_blocked_users.sql ====

-- v337 (Session 59): block a user (App Store 1.2). APPLIED 2026-10-16 as migration session59_blocked_users.
create table if not exists public.blocked_users (
  blocker_id text not null,
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocked_users_blocked_idx on public.blocked_users (blocked_id);
alter table public.blocked_users enable row level security;
revoke all on public.blocked_users from anon, authenticated;


-- ==== session58_signup_source.sql ====

-- Session 58 (Ravi OK: "han kro") — where a signup came from. All nullable, nothing reads them except
-- Admin → Overview → Growth ideas → "Where signups come from". Written once per user (first touch).
alter table public.users add column if not exists signup_source text;
alter table public.users add column if not exists utm_source   text;
alter table public.users add column if not exists utm_medium   text;
alter table public.users add column if not exists utm_campaign text;
comment on column public.users.signup_source is 'Session 58: channel a signup came from (instagram, google, meta_ads, direct, android_app, …). Set once.';


-- ==== session58_missing_columns.sql ====

-- Session 58 (Ravi OK: "database ka access hai … sab bna dena"). APPLIED on the live DB as migrations
-- session58_missing_columns and session58_safe_defaults_private_buckets.
alter table public.campaigns
  add column if not exists gender text, add column if not exists follower_min integer, add column if not exists follower_max integer,
  add column if not exists locations text[], add column if not exists max_creators integer, add column if not exists collab_mode text,
  add column if not exists dos text, add column if not exists donts text, add column if not exists hashtags text[];
alter table public.creator_profiles add column if not exists youtube_avg_views integer;
alter table public.users add column if not exists suspended_until timestamptz;
alter table public.transactions add column if not exists razorpay_payment_id text;
alter table public.transactions alter column payout_status set default 'PENDING';
update storage.buckets set public = false where id in ('content-submissions', 'live-proofs', 'ugc-assets');


-- ==== session39.sql ====

-- Session 39 — only ADDS. Run once in Supabase (SQL editor).
-- 1) Admin picks the 3–4 creators shown on the creator Home ("Creators like you, winning on YBEX")
--    and on the onboarding photo step. Admin → Users → creator → "Show on creator home".
alter table if exists public.creator_profiles
  add column if not exists show_on_creator_home boolean not null default false;
create index if not exists creator_profiles_home_pick_idx
  on public.creator_profiles (show_on_creator_home) where show_on_creator_home;

-- 2) Referral share (Ravi, session 39): 0.2% of what the invited friend received (after the Ybex
--    fee), still capped per friend. New admin-editable setting; the old share_pct_of_fee column
--    stays (not used any more).
alter table if exists public.referral_config
  add column if not exists share_pct_of_earnings numeric not null default 0.2;


-- ==== session36.sql ====

-- Session 36 (v249 + v250). Only NEW tables; nothing is dropped or changed. RLS on, no policies,
-- anon/authenticated revoked — only the server (service-role key) reads and writes them.

-- v249: onboarding reminder emails (max 2 per person; "Stop these reminders")
create table if not exists public.onboarding_reminders (
  user_id      text primary key,
  sent_count   integer not null default 0,
  last_sent_at timestamptz,
  stopped_at   timestamptz
);
alter table public.onboarding_reminders enable row level security;
revoke all on public.onboarding_reminders from anon, authenticated;

-- v250: admin bulk email — report, queue and unsubscribes
create table if not exists public.email_broadcasts (
  id          text primary key,
  subject     text not null,
  heading     text,
  body_text   text not null,
  cta_label   text,
  cta_url     text,
  audience    text not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  total       integer not null default 0,
  sent        integer not null default 0,
  failed      integer not null default 0,
  skipped     integer not null default 0,
  queued      integer not null default 0,
  status      text not null default 'sending'
);
create table if not exists public.email_broadcast_recipients (
  id            text primary key,
  broadcast_id  text not null references public.email_broadcasts(id) on delete cascade,
  email         text not null,
  name          text,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  error         text,
  attempts      integer not null default 0,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists email_broadcast_recipients_queue_idx on public.email_broadcast_recipients (status, created_at);
create index if not exists email_broadcast_recipients_bc_idx on public.email_broadcast_recipients (broadcast_id);
create table if not exists public.email_unsubscribes (
  email       text primary key,
  created_at  timestamptz not null default now()
);
alter table public.email_broadcasts enable row level security;
alter table public.email_broadcast_recipients enable row level security;
alter table public.email_unsubscribes enable row level security;
revoke all on public.email_broadcasts from anon, authenticated;
revoke all on public.email_broadcast_recipients from anon, authenticated;
revoke all on public.email_unsubscribes from anon, authenticated;

-- v250: fee offer toggle (₹0 platform fee + convenience fee) — set only by POST /admin/fee-offer
alter table public.platform_fee_config add column if not exists offer_mode boolean not null default false;
alter table public.platform_fee_config add column if not exists offer_fee_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists offer_label text;

-- v250: creator coupons — "apply automatically" launch offers
alter table public.coupons add column if not exists auto_apply boolean not null default false;

-- v252: creator referral programme
alter table public.referrals add column if not exists referred_email text;
alter table public.referral_config add column if not exists signups_per_reward integer;
alter table public.referral_config add column if not exists free_deals_per_reward integer;
alter table public.referral_config add column if not exists free_deals_valid_days integer;
alter table public.referral_config add column if not exists featured_days integer;
alter table public.referral_config add column if not exists share_pct_of_fee numeric;
alter table public.referral_config add column if not exists share_cap_per_creator numeric;
alter table public.referral_config add column if not exists min_withdraw numeric;
alter table public.referral_config add column if not exists attribution_days integer;
create table if not exists public.referral_reward_uses (
  id           text primary key,
  user_id      text not null,
  deal_id      text,
  ugc_order_id text,
  created_at   timestamptz not null default now()
);
create table if not exists public.referral_withdrawals (
  id         text primary key,
  user_id    text not null,
  amount     numeric not null,
  status     text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  utr        text,
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);
alter table public.referral_reward_uses enable row level security;
alter table public.referral_withdrawals enable row level security;
revoke all on public.referral_reward_uses from anon, authenticated;
revoke all on public.referral_withdrawals from anon, authenticated;

-- v252: promotional line shown with the fee offer
alter table public.platform_fee_config add column if not exists offer_promo_line text;
alter table public.platform_fee_config add column if not exists offer_line_until timestamptz;
