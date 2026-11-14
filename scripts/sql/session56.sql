-- Session 56 (payment audit, Ravi OK: "dusre vale ko bhi fix kro").
-- 1. A UGC brief's deposit can be saved in transactions (brief_id only, no deal / UGC order yet).
alter table public.transactions drop constraint if exists chk_transactions_one_source;
alter table public.transactions add constraint chk_transactions_one_source check (
  ((deal_id is not null) and (ugc_order_id is null))
  or ((deal_id is null) and (ugc_order_id is not null))
  or ((deal_id is null) and (ugc_order_id is null) and (brief_id is not null))
);
-- 2. One paid Razorpay order can fund only one brief.
create unique index if not exists uq_ugc_briefs_razorpay_order
  on public.ugc_briefs (razorpay_order_id) where razorpay_order_id is not null;
-- 3. One payout row per UGC order (refund rows carry refund_amount and are not counted).
create unique index if not exists uq_transactions_ugc_payout
  on public.transactions (ugc_order_id) where ugc_order_id is not null and refund_amount is null;
