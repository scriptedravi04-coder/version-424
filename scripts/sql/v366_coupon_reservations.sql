-- v366 (Ravi: "do payments ek saath aaye toh dono coupon ki aakhri use le lete hain — fix karo").
-- One row per order that uses a brand coupon. claim_coupon locks the coupon row while it counts, so the last use can
-- only be taken once. Server only: RLS on, no policies; functions run as SECURITY DEFINER and only service_role may call them.
create table if not exists public.coupon_reservations (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  brand_id text,
  order_id text not null unique,
  status text not null default 'reserved' check (status in ('reserved', 'confirmed', 'released')),
  discount numeric not null default 0,
  deal_id text,
  ugc_order_id text,
  campaign_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists coupon_reservations_coupon_idx on public.coupon_reservations (coupon_id, status, expires_at);
create index if not exists coupon_reservations_brand_idx on public.coupon_reservations (coupon_id, brand_id);
alter table public.coupon_reservations enable row level security;

create or replace function public.claim_coupon(p_coupon_id uuid, p_brand_id text, p_order_id text, p_ttl_minutes integer default 30, p_discount numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record;
  holds integer;
  brand_used integer;
  legacy_brand integer;
  existing record;
begin
  select * into c from coupons where id = p_coupon_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into existing from coupon_reservations where order_id = p_order_id;
  if found then
    return jsonb_build_object('ok', existing.status <> 'released', 'reason', case when existing.status = 'released' then 'released' else null end, 'existing', true);
  end if;
  if lower(coalesce(c.status, '')) <> 'active' then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  if c.valid_from is not null and c.valid_from > now() then return jsonb_build_object('ok', false, 'reason', 'not_started'); end if;
  if c.valid_until is not null and c.valid_until < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  select count(*) into holds from coupon_reservations where coupon_id = p_coupon_id and status = 'reserved' and expires_at > now();
  if coalesce(c.usage_limit, 0) > 0 and coalesce(c.used_count, 0) + holds >= c.usage_limit then
    return jsonb_build_object('ok', false, 'reason', 'used_up');
  end if;
  if coalesce(c.per_user_limit, 0) > 0 and p_brand_id is not null then
    select count(*) into brand_used from coupon_reservations
      where coupon_id = p_coupon_id and brand_id = p_brand_id and (status = 'confirmed' or (status = 'reserved' and expires_at > now()));
    select count(*) into legacy_brand from coupon_redemptions r
      where r.coupon_id = p_coupon_id and r.user_id = p_brand_id
        and not exists (select 1 from coupon_reservations x where x.coupon_id = p_coupon_id and x.brand_id = p_brand_id and x.status = 'confirmed');
    if brand_used + legacy_brand >= c.per_user_limit then return jsonb_build_object('ok', false, 'reason', 'brand_limit'); end if;
  end if;
  insert into coupon_reservations (coupon_id, brand_id, order_id, status, discount, expires_at)
    values (p_coupon_id, p_brand_id, p_order_id, 'reserved', greatest(coalesce(p_discount, 0), 0), now() + make_interval(mins => greatest(coalesce(p_ttl_minutes, 30), 1)));
  return jsonb_build_object('ok', true);
end $$;

-- The payment went through: the hold becomes a use (used_count + 1) exactly once per order. A payment whose hold had
-- expired is still honoured (the brand was charged the coupon price). No hold at all → ok=false, reason no_reservation
-- (the server then uses the old path for orders made before v366).
create or replace function public.confirm_coupon(p_order_id text, p_coupon_id uuid, p_brand_id text, p_deal_id text default null, p_ugc_order_id text default null, p_campaign_id text default null, p_discount numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  select * into r from coupon_reservations where order_id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_reservation'); end if;
  if r.status = 'confirmed' then return jsonb_build_object('ok', true, 'already', true); end if;
  perform 1 from coupons where id = r.coupon_id for update;
  update coupon_reservations set status = 'confirmed', confirmed_at = now(),
    deal_id = coalesce(p_deal_id, deal_id), ugc_order_id = coalesce(p_ugc_order_id, ugc_order_id), campaign_id = coalesce(p_campaign_id, campaign_id),
    discount = case when coalesce(p_discount, 0) > 0 then p_discount else discount end
    where id = r.id;
  update coupons set used_count = coalesce(used_count, 0) + 1, updated_at = now() where id = r.coupon_id;
  if r.brand_id is not null and exists (select 1 from users where user_id = r.brand_id) then
    insert into coupon_redemptions (coupon_id, user_id, deal_id, ugc_order_id, campaign_id, discount_applied, redeemed_at)
      values (r.coupon_id, r.brand_id,
        case when coalesce(p_deal_id, r.deal_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then coalesce(p_deal_id, r.deal_id)::uuid else null end,
        coalesce(p_ugc_order_id, r.ugc_order_id), coalesce(p_campaign_id, r.campaign_id),
        case when coalesce(p_discount, 0) > 0 then p_discount else r.discount end, now())
      on conflict (coupon_id, user_id) do nothing;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.release_coupon(p_order_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update coupon_reservations set status = 'released' where order_id = p_order_id and status = 'reserved';
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.claim_coupon(uuid, text, text, integer, numeric) from public, anon, authenticated;
revoke all on function public.confirm_coupon(text, uuid, text, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.release_coupon(text) from public, anon, authenticated;
grant execute on function public.claim_coupon(uuid, text, text, integer, numeric) to service_role;
grant execute on function public.confirm_coupon(text, uuid, text, text, text, text, numeric) to service_role;
grant execute on function public.release_coupon(text) to service_role;
