-- Session 38, part 2 (Ravi: "YE SAB BANAO") — run once in Supabase → SQL Editor, after session38.sql.
-- Only NEW tables. RLS on, no policies, anon/authenticated revoked: only the server
-- (service-role key) reads and writes them. Safe to run twice.

-- Chat moderation: every chat message the server blocked (phone / email / abuse) or only
-- logged (profanity). Admin → Chat and Reports read this; it used to live in one server's file.
create table if not exists public.chat_moderation_events (
  id           text primary key,
  thread_id    text,
  sender_id    text,
  sender_role  text,
  code         text not null,
  reason       text,
  matched      text,
  content      text not null default '',
  blocked      boolean not null default true,
  status       text not null default 'OPEN',
  resolved_by  text,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists chat_moderation_events_created_idx on public.chat_moderation_events (created_at desc);
create index if not exists chat_moderation_events_sender_idx on public.chat_moderation_events (sender_id);
alter table public.chat_moderation_events enable row level security;
revoke all on public.chat_moderation_events from anon, authenticated;

-- Admin's own pipeline status + notes for a pitch (brand → creator invite). Kept apart from
-- brief_requests.status, which the invite flow itself uses.
create table if not exists public.pitch_lead_admin (
  pitch_id      text primary key,
  admin_status  text,
  admin_notes   text,
  updated_by    text,
  updated_at    timestamptz not null default now()
);
alter table public.pitch_lead_admin enable row level security;
revoke all on public.pitch_lead_admin from anon, authenticated;

notify pgrst, 'reload schema';
