-- Session 58 (Ravi: "ok" — approved the eva_feedback table): 👍 / 👎 under Ybex Eva's replies, for AI quality.
-- Applied on the live project as migration "session58_eva_feedback". Additive only, safe to run again.
-- Server-only: RLS on, NO policies. Keeps the user id and the first 400 characters of Eva's own reply.
create table if not exists public.eva_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  role        text not null default '',
  vote        text not null check (vote in ('up','down')),
  card        text,
  text        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists eva_feedback_created_idx on public.eva_feedback (created_at desc);
alter table public.eva_feedback enable row level security;
