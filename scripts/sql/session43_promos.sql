-- Session 43 (v289, Ravi approved: "database mein jagah banani ho toh prompt likh ke de dena, main kar dunga").
-- Promo popups shown when the app opens (Admin → Platform tools → Promo popups).
-- Safe to run more than once.

create table if not exists public.promo_popups (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',                 -- admin-only name, never shown to users
  layout      text not null default 'fullscreen' check (layout in ('fullscreen','card','sheet','banner')),
  image_url   text not null,                            -- the designer's poster (whole poster is the button)
  link_url    text not null default '',                 -- where a tap goes: "/refer" or "https://…"; empty = just close
  audience    text not null default 'all' check (audience in ('all','creator','brand','guest')),
  frequency   text not null default 'once' check (frequency in ('once','daily','every_open')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean not null default false,
  priority    integer not null default 0,               -- higher wins when several are live
  views       integer not null default 0,
  clicks      integer not null default 0,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists promo_popups_live_idx on public.promo_popups (is_active, priority desc);

-- Server-only table (the app reads it through /api/promos/active). No browser access.
alter table public.promo_popups enable row level security;
-- (no policies on purpose: only the service-role key used by the server can read / write)

-- Counting views / clicks without a read-modify-write race.
create or replace function public.promo_popups_bump(p_id uuid, p_field text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_field = 'views' then
    update public.promo_popups set views = views + 1 where id = p_id;
  elsif p_field = 'clicks' then
    update public.promo_popups set clicks = clicks + 1 where id = p_id;
  end if;
end $$;
revoke all on function public.promo_popups_bump(uuid, text) from public, anon, authenticated;
