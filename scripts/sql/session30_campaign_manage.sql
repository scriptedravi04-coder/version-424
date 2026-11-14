-- Session 30: columns for "Pause new applications" and "Close campaign" (backend/campaignManage.ts).
-- Safe to run twice.
alter table public.campaigns add column if not exists applications_paused boolean not null default false;
alter table public.campaigns add column if not exists applications_paused_at timestamptz;
alter table public.campaigns add column if not exists applications_paused_by text;
alter table public.campaigns add column if not exists closed_at timestamptz;
alter table public.campaigns add column if not exists closed_by text;
-- Check: does the status constraint allow 'completed'? (Close writes status = 'completed'.)
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.campaigns'::regclass and contype = 'c';
