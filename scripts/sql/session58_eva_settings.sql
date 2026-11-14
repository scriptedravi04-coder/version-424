-- Session 58 (Ravi: "ok h" — approved the eva_settings table): Ybex Eva settings follow the user to every phone /
-- computer. Applied on the live project as migration "session58_eva_settings". Additive only, safe to run again.
-- Server-only: RLS on, NO policies → only the server's service-role key reads / writes (same as assist_*).
-- One row per login (user_id), so a brand's team members each keep their own switches.
create table if not exists public.eva_settings (
  user_id     text primary key,
  deals       boolean not null default true,              -- "Deals & offers" Eva may read
  money       boolean not null default true,              -- "Earnings & payouts" / "Payments & reports"
  lang        text not null default 'en' check (lang in ('en','hinglish','hi')),
  updated_at  timestamptz not null default now()
);
alter table public.eva_settings enable row level security;
