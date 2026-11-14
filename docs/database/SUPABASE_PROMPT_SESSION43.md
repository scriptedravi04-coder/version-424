# Ready-to-go prompt for Claude (Supabase connected) — Ybex session 43

Copy everything between the lines and send it to Claude in the chat where Supabase is connected.

---

You are connected to the Supabase project of my app **Ybex**. Please apply these database changes
for me, carefully, and tell me in simple Hinglish what you did.

**Rules**
1. First, read-only: check which of these already exist — table `public.promo_popups`, function
   `public.promo_popups_bump`, tables `public.referral_config` and `public.referral_withdrawals`
   (and their columns). Tell me what you found.
2. Do NOT drop, truncate or delete any table or any row. Only the statements below. If anything below
   would delete data, stop and ask me.
3. Run the SQL below exactly (it is safe to run more than once). If one statement fails, stop, show me
   the exact error, and do not continue.
4. If `public.referral_config` or `public.referral_withdrawals` does not exist at all, stop and tell me
   (do not create them — they come from an older script).
5. After running, verify and show me:
   - the columns of `promo_popups` and its 3 check constraints (layout incl. 'banner'),
   - that RLS is ON for `promo_popups` and it has NO policies,
   - the new columns in `referral_config` with their values (friend_reward 21, friend_reward_cap 1000,
     brand_invite_reward 500, brand_invite_max_brands 10, brand_invite_min_deal 5000,
     brand_invite_unlock_deals 2, brand_invite_featured_days 7, min_withdraw 11),
   - that `referral_withdrawals` now has `upi_id`,
   - that `promo_popups_bump` exists and is NOT executable by anon / authenticated.
6. Finish with: "✅ Session 43 database changes done" or the exact problem.

```sql
-- 1) Promo popups + profile banner
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
alter table public.promo_popups enable row level security;

create or replace function public.promo_popups_bump(p_id uuid, p_field text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_field = 'views' then update public.promo_popups set views = views + 1 where id = p_id;
  elsif p_field = 'clicks' then update public.promo_popups set clicks = clicks + 1 where id = p_id;
  end if;
end $$;
revoke all on function public.promo_popups_bump(uuid, text) from public, anon, authenticated;

-- 2) Invite rewards settings
alter table public.referral_config add column if not exists friend_reward              numeric not null default 21;
alter table public.referral_config add column if not exists friend_reward_cap          numeric not null default 1000;
alter table public.referral_config add column if not exists brand_invite_reward        numeric not null default 500;
alter table public.referral_config add column if not exists brand_invite_max_brands    integer not null default 10;
alter table public.referral_config add column if not exists brand_invite_min_deal      numeric not null default 5000;
alter table public.referral_config add column if not exists brand_invite_unlock_deals  integer not null default 2;
alter table public.referral_config add column if not exists brand_invite_featured_days integer not null default 7;
update public.referral_config set min_withdraw = 11;

-- 3) Withdrawals remember the UPI id
alter table public.referral_withdrawals add column if not exists upi_id text;
```

---

Same SQL is in the code at `scripts/sql/session43_all.sql`.
