-- =====================================================================================
-- Ybex · Session 43 · ALL database changes (v289 promo popups + v290 invite rewards)
-- Safe to run more than once. Run in the Supabase SQL editor (or by Claude with Supabase).
-- =====================================================================================

-- 1) Promo popups + profile banner -----------------------------------------------------
create table if not exists public.promo_popups (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  layout      text not null default 'fullscreen',
  image_url   text not null,
  link_url    text not null default '',
  audience    text not null default 'all',
  frequency   text not null default 'once',
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean not null default false,
  priority    integer not null default 0,
  views       integer not null default 0,
  clicks      integer not null default 0,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.promo_popups drop constraint if exists promo_popups_layout_check;
alter table public.promo_popups add constraint promo_popups_layout_check check (layout in ('fullscreen','card','sheet','banner'));
alter table public.promo_popups drop constraint if exists promo_popups_audience_check;
alter table public.promo_popups add constraint promo_popups_audience_check check (audience in ('all','creator','brand','guest'));
alter table public.promo_popups drop constraint if exists promo_popups_frequency_check;
alter table public.promo_popups add constraint promo_popups_frequency_check check (frequency in ('once','daily','every_open'));
create index if not exists promo_popups_live_idx on public.promo_popups (is_active, priority desc);
alter table public.promo_popups enable row level security;   -- server-only (no policies on purpose)

create or replace function public.promo_popups_bump(p_id uuid, p_field text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_field = 'views' then update public.promo_popups set views = views + 1 where id = p_id;
  elsif p_field = 'clicks' then update public.promo_popups set clicks = clicks + 1 where id = p_id;
  end if;
end $$;
revoke all on function public.promo_popups_bump(uuid, text) from public, anon, authenticated;

-- 2) Invite rewards settings (₹21 friend, ₹500 brand invite) ---------------------------
alter table public.referral_config add column if not exists friend_reward              numeric not null default 21;
alter table public.referral_config add column if not exists friend_reward_cap          numeric not null default 1000;
alter table public.referral_config add column if not exists brand_invite_reward        numeric not null default 500;
alter table public.referral_config add column if not exists brand_invite_max_brands    integer not null default 10;
alter table public.referral_config add column if not exists brand_invite_min_deal      numeric not null default 5000;
alter table public.referral_config add column if not exists brand_invite_unlock_deals  integer not null default 2;
alter table public.referral_config add column if not exists brand_invite_featured_days integer not null default 7;
-- Ravi: wallet pays out from ₹11
update public.referral_config set min_withdraw = 11;

-- 3) Withdrawals remember the UPI id they were paid to ---------------------------------
alter table public.referral_withdrawals add column if not exists upi_id text;
