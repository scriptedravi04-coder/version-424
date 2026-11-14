-- Session 53 (launch audit) — applied on the live project as migration "session53_notifications_id_fill".
-- The phone-push loop (backend/push_routes.ts) only pushes notification rows that have `id`; nothing ever
-- filled it, so no notification ever reached a phone. The insert trigger now copies notif_id into id.
create or replace function public.ybex_notif_fill()
returns trigger language plpgsql set search_path = public as $function$
begin
  if new.notif_id is null then
    new.notif_id := coalesce(new.id, 'notif_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  end if;
  if new.id is null then new.id := new.notif_id; end if;
  if new.redirect_path is null and new.link is not null then new.redirect_path := new.link; end if;
  if new.link is null and new.redirect_path is not null and left(new.redirect_path, 1) = '/' then new.link := new.redirect_path; end if;
  return new;
end $function$;
update public.notifications set id = notif_id where id is null;

-- Eva (brand chat) keeps several chats: each message carries its chat id (migration "session53_assist_chat_id").
alter table public.assist_messages add column if not exists chat_id text;
create index if not exists assist_messages_chat_idx on public.assist_messages (brand_id, chat_id, created_at);

-- Three SECURITY DEFINER views were readable (and writable) with the public browser key, skipping every
-- row rule: user activity, campaign deals, UGC order checks. Only the server reads them (service role).
-- Migration "session53_close_definer_views".
revoke all on public.user_activity_timeline from anon, authenticated;
revoke all on public.campaign_deals from anon, authenticated;
revoke all on public.ugc_orders_integrity_issues from anon, authenticated;
