-- Session 24. Brand-chosen first-draft deadline for UGC briefs (24 / 48 / 72 hours).
-- Old briefs stay NULL and keep the old 24h deadline.
alter table public.ugc_briefs
  add column if not exists delivery_hours integer
  check (delivery_hours is null or delivery_hours in (24, 48, 72));
