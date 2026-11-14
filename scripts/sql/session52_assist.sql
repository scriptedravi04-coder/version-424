-- Session 52 (Ravi: "supabase connect kr diya hu tum khud dekhlo or kaam krlo").
-- Ybex Assist (brand bot) — the 3 database pieces planned in Session 51 (docs/database/PENDING_DB_CHANGES.md).
-- Applied on the live project as migration "session52_assist". Additive only, safe to run more than once.
-- All three tables are server-only: RLS on, NO policies → only the server's service-role key reads / writes.
-- brand_id = the brand account (team members use the parent brand's id, same as everywhere else).

-- 1. Chat history (so the chat comes back on any phone / after closing the app).
create table if not exists public.assist_messages (
  id          uuid primary key default gen_random_uuid(),
  brand_id    text not null,
  user_id     text,                                   -- who typed (owner or team member)
  role        text not null check (role in ('user','bot')),
  text        text not null default '',
  card        jsonb,                                  -- small card summary (never secrets)
  created_at  timestamptz not null default now()
);
create index if not exists assist_messages_brand_idx on public.assist_messages (brand_id, created_at desc);
alter table public.assist_messages enable row level security;

-- 2. Daily AI message count that survives a server restart / several server copies.
create table if not exists public.assist_usage (
  brand_id    text not null,
  day         date not null,                          -- India date
  count       integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (brand_id, day)
);
alter table public.assist_usage enable row level security;

-- Take one message if the brand is under the limit (atomic, no race between two requests).
create or replace function public.assist_usage_take(p_brand text, p_day date, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.assist_usage as u (brand_id, day, count) values (p_brand, p_day, 1)
  on conflict (brand_id, day) do update set count = u.count + 1, updated_at = now()
  where u.count < p_limit
  returning u.count into n;
  if n is null then
    select u.count into n from public.assist_usage u where u.brand_id = p_brand and u.day = p_day;
    return query select false, coalesce(n, p_limit);
  else
    return query select true, n;
  end if;
end $$;
revoke all on function public.assist_usage_take(text, date, integer) from public, anon, authenticated;
grant execute on function public.assist_usage_take(text, date, integer) to service_role;

-- 3. Saved searches → push / bell notification when a new matching creator is approved.
create table if not exists public.assist_saved_searches (
  id               uuid primary key default gen_random_uuid(),
  brand_id         text not null,
  user_id          text,
  label            text not null,
  filters          jsonb not null default '{}'::jsonb,
  seen_ids         text[] not null default '{}',     -- creators already known for this search
  fresh_ids        text[] not null default '{}',     -- new ones not yet shown in the chat
  last_checked_at  timestamptz,
  last_notified_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (brand_id, label)
);
create index if not exists assist_saved_searches_brand_idx on public.assist_saved_searches (brand_id);
alter table public.assist_saved_searches enable row level security;
-- (second migration "session52_assist_fresh_ids" on the live project — same column, for databases made from the first version)
alter table public.assist_saved_searches add column if not exists fresh_ids text[] not null default '{}';

-- ── Session 52 (part 2): data that lived only in server memory now uses its existing tables ──────
-- (migration "session52_saved_creators_unique" on the live project)
create unique index if not exists saved_creators_brand_creator_uq on public.saved_creators (brand_id, creator_id);
create index if not exists creator_reviews_creator_idx on public.creator_reviews (creator_id, created_at desc);
create index if not exists team_activity_logs_brand_idx on public.team_activity_logs (brand_user_id, created_at desc);
