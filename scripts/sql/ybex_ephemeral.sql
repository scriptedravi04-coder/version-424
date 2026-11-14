-- Session 22: short-lived OTP codes and contract sign tokens shared by all server instances.
-- Run once in Supabase → SQL Editor. Only the service-role key (the server) can read or write it.
create table if not exists public.ybex_ephemeral (
  key        text primary key,
  value      jsonb not null,
  expires_at timestamptz not null
);
create index if not exists ybex_ephemeral_expires_idx on public.ybex_ephemeral (expires_at);
alter table public.ybex_ephemeral enable row level security;
-- No policies on purpose: anon / logged-in browser clients get nothing.
revoke all on public.ybex_ephemeral from anon, authenticated;
