# Pending database (Supabase) changes

**End of session 41: everything below that has SQL is APPLIED** (13 files, run by Ravi's Supabase-connected Claude, no errors). Nothing is pending right now. New needs → add an entry here.

**Ravi, session 41:** right now we only fix the app's bugs and errors. **No new Supabase table, column,
bucket or SQL file** until one dedicated "database session". Every planned change is written here
(what, why, when, which code needs it). In that session we read this list together and do it all in
one day.

Rule for every session and every AI tool: need a new table / column / SQL? **Do not create it.** Add an
entry below, build nothing that depends on it, and tell Ravi.

---

## 1. What's new popup — `whats_new`, `whats_new_seen`
- **Status: BUILT in v261 — Ravi approved ("now start working").** Run `scripts/sql/OLD_SQL_already_run.sql (session41 part)`.
- **Why:** admin writes an update ("Express is now free"), every creator / brand sees it once.
- **Tables:** `whats_new` (id, title, points jsonb, audience all/creator/brand, cta_label, cta_url,
  published, published_at, created_at) · `whats_new_seen` (user_id, item_id, seen_at; key user_id+item_id).
- **Code waiting for it:** `backend/whats_new_routes.ts`, `src/components/whatsNew/WhatsNewPopup.jsx`,
  `src/components/admin/WhatsNewManager.jsx`.
- **Before the SQL is run:** the popup never shows; Admin → What's new says "Could not save".

## 2. Push notifications (app closed) — `push_subscriptions` (+ promo pushes)
- **Status: BUILT in v261 — Ravi approved building it now (exception to the "no new tables" rule).**
  Run `scripts/sql/OLD_SQL_already_run.sql (session41 part)` (push_subscriptions, push_campaigns, push_log) and add the VAPID keys.
  Ravi's decisions (session 41, final — do not ask again):
  - **Deal pushes:** new message, invite, application, counter offer, contract to sign, UGC submitted /
    revision, payment released, KYC approved / rejected.
  - **Promo pushes in Phase 1 too** — Zomato / Swiggy style: short, funny, a bit emotional. (Promo
    *emails* stay Phase 2.) **Admin writes every promo push** in the admin panel — any language
    (English, Hinglish, emojis); the app's "English only" rule does not apply to these. We build the
    system, not the messages.
  - **Admin push screen (to build):** title + message + optional page to open on tap; audience (all /
    creators / brands, later niche / city); send now or schedule; preview of how it looks on a phone;
    history with how many it was sent to. Deal pushes are automatic (no admin step).
  - **No on/off setting in the app.** (People can still switch notifications off from phone settings.)
  - **Ask permission at the start**, with our own screen first (like the Sticker.ly screen Ravi sent):
    a sticker, an emotional + funny line, one big "Allow" button → only then the phone's real popup.
    Our own original sticker — not Sticker.ly's cat photo.
  - **Screen text chosen by Ravi:**
    - Creator: **"Brands are waiting. So is your money. 💸"** — *Turn on notifications so no deal, no
      payment, no "we loved your reel" ever slips past you.*
    - Brand: **"Your next viral creator just applied… 👀"** — *Allow notifications so great creators
      don't slip away while you're in a meeting.*
    - Button "Yes, keep me posted"; small "Not now" under it (iPhone never asks twice after "Don't Allow").
- **Tables:** `push_subscriptions` (id, user_id, endpoint unique, p256dh, auth, user_agent, created_at,
  last_used_at) · `push_campaigns` for promo pushes (id, title, body, audience all/creator/brand,
  url, send_at, sent_at, sent_count, created_by) · optional `push_log` (who got what, for limits).
- **Also needs:** VAPID keys in env, `web-push` package, push handler + tap-to-open in the service
  worker, the "Allow" screen, admin screen to write / schedule promo pushes, a daily limit per user
  (e.g. max 2 promo pushes a day) so people don't switch everything off.
- **Limits:** Android Chrome — works; iPhone — only when added to Home Screen, iOS 16.4+, and the
  phone's popup can only open after a tap (that is why our screen has an "Allow" button). If someone
  says "Don't allow" once, the phone never asks again — our screen comes first so fewer people say no.

## 3. Older SQL files (session 22–40) — APPLIED at the end of session 41
- All schema files in `scripts/sql/` are applied. Not run on purpose: `purge_aadhaar.sql` (no Aadhaar
  columns exist in creator_kyc; one read-only check on `verifications` left) and
  `find_wrongly_completed_briefs.sql` (report only — 15 rows, Ravi decides; advice: don't reopen).

## Session 43 (v274) — brand coupon codes at payment (NOT built: rule 91, no new table / column)
Ravi asked whether brands can apply a coupon on the "Review & pay" step. Creator codes exist
(`creator_coupons`); brand codes do not. Needs: a brand coupon store (code, type, discount, valid_until,
max uses), a server check on the escrow order route (locked flow — Ravi's written OK needed) so the
Razorpay amount is computed server-side, and a line in the Review & pay sheet. Decide with Ravi first.

## v404 — 30-day purge of self-deleted accounts (QA P-1) — DONE (columns + index already live, checked 4 Nov 2026)
- **Status: DONE.** Checked live on 4 Nov 2026: `users.deletion_requested_at`, `users.deletion_reason` and
  `users_deletion_requested_at_idx` already exist — nothing to run. SQL kept for reference:
```sql
-- v404 (QA P-1): 30-day purge of self-deleted accounts. Run once in Supabase → SQL editor.
-- Adds two nullable columns; nothing existing changes. The app already writes them when a user deletes their account.
alter table public.users add column if not exists deletion_requested_at timestamptz null;
alter table public.users add column if not exists deletion_reason text null;
create index if not exists users_deletion_requested_at_idx on public.users (deletion_requested_at) where is_deleted = true;
-- Accounts deleted BEFORE this SQL have no date → they are never purged automatically (admin can still wipe them).
```
- **Code:** `setupAccountPurge` / `runAccountPurge` in `backend/admin_wipe_routes.ts` (daily on a timer + `POST /api/internal/cron/account-purge` with x-cron-secret),
  sharing the admin "complete wipe" (`wipeAccountData` in admin_wipe_routes.ts). Only `deletion_reason = self_serve`,
  older than 30 days, not admin, no money in escrow. `transactions` kept (name/email blanked).
- First purge: ~2 Dec 2026 (oldest self-deleted account is from 2 Nov 2026).

## Session 43 (v278) — self-serve account deletion
Added by the Delete account flow (Settings → Account → Delete account, and /delete-account).
The flow works today with the existing `is_deleted` soft-delete (account hidden + login blocked, like
the admin bin; records kept). To enable the **30-day auto-purge + a precise "days left" countdown +
self-serve recovery**, add:

- `users.deletion_requested_at timestamptz null`  — when the user asked to delete (self-serve).
- `users.deletion_reason text null`               — e.g. "self_serve".

`backend/account_routes.ts` already best-effort writes both on confirm (wrapped in try/catch, so it is
harmless until the columns exist). After adding the columns:
1. A scheduled job (daily) should run the existing complete-wipe on accounts where
   `deletion_requested_at < now() - 30 days` and `is_deleted = true`.
2. Login can offer "Reactivate" within the 30 days (set is_deleted=false, clear deletion_requested_at)
   instead of the generic "profile no longer available" message.
No other table changes are needed — `transactions` (payment/invoice records) are intentionally kept.

## Promo popups — `promo_popups` (session 43, v289)
- **Status: BUILT in v289 — Ravi approved ("DB ka prompt likh ke de dena, main kar dunga").**
  Run `scripts/sql/session43_all.sql` — or give `docs/database/SUPABASE_PROMPT_SESSION43.md` to the Supabase-connected Claude.
- **Why:** a full-screen / card / bottom-sheet poster when the app opens (Hopr / Swiggy style), e.g.
  "Invite friends, earn ₹21". Admin uploads the designer's poster, picks layout, link, audience, dates.
- **Code waiting for it:** `backend/promo_routes.ts`, `src/components/promo/PromoPopup.jsx`,
  `src/components/admin/AdminPromoPopups.jsx`.
- **Before the SQL is run:** no popup is shown; Admin → Promo popups says the table is missing.

## Invite rewards — `referral_config` new columns, `referral_withdrawals.upi_id` (session 43, v290)
- **Status: BUILT in v290 — Ravi approved.** Same file: `scripts/sql/session43_all.sql` /
  `docs/database/SUPABASE_PROMPT_SESSION43.md`.
- **Why:** ₹21 friend reward (both sides, on 100% profile, cap ₹1,000), ₹500 brand invite (first funded
  deal ≥ ₹5,000, max 10 brands, locked until 2 own deals, 7 days Featured), wallet payout from ₹11 to UPI.
- **Before the SQL is run:** rewards still work with the default numbers (code defaults); the admin
  can't save the new numbers; withdrawals are saved without the UPI snapshot (admin list looks it up).

---

## (Session 46) Signup source tracking — ✅ DONE in Session 58 (Ravi OK: "han kro")
- Applied as migration `session58_signup_source` (`scripts/sql/OLD_SQL_already_run.sql (session58_signup_source part)`): users.signup_source / utm_source / utm_medium / utm_campaign.
- Browser: `src/lib/signupSource.js` (first-touch capture in index.jsx, sent once after sign-in from AuthContext). Server: `backend/signupSource.ts` POST /auth/signup-source (new accounts only, set once). Growth: `buildAcquisition` splits by source.
- (Original note below.)
- **Why:** Admin → Overview → Growth ideas → "Where signups come from" can only split *Referral* from
  *Direct / not recorded*. Ravi wants to know how many came from Instagram, Google (organic), Meta ads,
  LinkedIn, etc. No column stores that today, so the screen says so instead of guessing.
- **Change:** `users.signup_source text`, `users.utm_source text`, `users.utm_medium text`,
  `users.utm_campaign text` (all nullable). Optional: `users.signup_city text` for people who skip the profile city.
- **Code to write after it exists:** the web app reads `utm_*` from the first URL and keeps it in
  localStorage until signup; `auth_routes.ts` signup saves it (a protected-flow-free file); `adminGrowth.ts`
  `buildAcquisition` groups by `signup_source` and drops the `trackingGap` note.
- **Until then:** nothing breaks; no code depends on the columns.

---

## (Session 51) Ybex Assist for brands — 3 things that need the database — ✅ DONE in Session 52
Ravi connected Supabase and asked for it ("supabase connect kr diya hu tum khud dekhlo or kaam krlo").
Applied on the live project as migrations `session52_assist`, `session52_assist_fresh_ids`,
`session52_saved_creators_unique`; same SQL in `scripts/sql/session52_assist.sql`. Server-only tables
(RLS on, no policies). Roles stored as 'user' | 'bot'; saved searches got `fresh_ids` too.
(Original note kept below.)
The assistant works today without these (rule 91). They are the next step:
1. **Chat history** — `assist_messages (id uuid, brand_id text, role text 'brand'|'assist', text text, card jsonb, created_at timestamptz)`
   + RLS (a brand reads only its own rows). Lets the bot remember earlier chats on any phone and lets the admin
   read conversations. Code: `src/components/assist/brand/brain.js` (history), `backend/assist_routes.ts`.
2. **Shared daily limit** — `assist_usage (brand_id text, day date, count int, primary key (brand_id, day))`.
   Today the 30-a-day count lives in memory per server copy + on the phone, so a restart resets it.
3. **Saved searches with push** — `assist_saved_searches (id uuid, brand_id text, label text, filters jsonb, seen_ids text[], created_at)`.
   Today "naye creators aaye to batana" is kept on the phone and shown when the brand opens the chat;
   with this table a nightly job can send a push / email the moment a matching creator is approved.

## (Session 52) Still in server memory only — no screen uses them today
- `collab_cost_requests` (POST /creators/:id/request-collab-cost, POST /cost-requests/:id/quote) — no screen calls
  these routes; needs a new table if the feature is ever switched on.
- `message_flags` (admin chat flags) — nothing writes them; real chat moderation goes to `chat_moderation_events`.
- `deleted_user_ids / deleted_user_emails` — extra filter only; the real `is_deleted` flag is on the tables.
- `admin_logs` (UGC deadline notes) — the real admin log is `admin_activity_logs`.

## (Session 53) Launch audit — done on the live database
- `session53_notifications_id_fill`: notifications now get `id` (= notif_id) on insert. The phone-push loop skips rows
  without `id`, and NO row had one — so no notification had ever been pushed to a phone. Existing rows back-filled.
- `session53_assist_chat_id`: `assist_messages.chat_id` — Eva keeps several chats (menu ☰ → earlier chats).
- `session53_close_definer_views`: 3 views (user activity timeline, campaign_deals, ugc_orders_integrity_issues) could be
  read with the public browser key; now server-only.
- SQL copy: `scripts/sql/session53.sql`.

## (Session 53) Still open — decide after launch
- **Public read of profile contact fields:** `creator_profiles` and `brand_profiles` have a "public read" policy, so the
  browser key can read `email` (and `brand_profiles.representative_mobile`) of every profile. Fix = move the ~10
  browser reads of these two tables to server routes, then limit the policy / columns. Not done tonight: those reads
  use `select('*')`, so a column limit would break screens without a real-device test.
- `content-submissions` storage bucket is public (creators' drafts are reachable by anyone who has the exact link).
- API CORS echoes any origin; login lock-out counts per server and trusts the first X-Forwarded-For value.
- `campaigns` has no columns for targeting (languages, gender, follower range, locations, dos / donts…). Brands fill them,
  creators see defaults. Needs columns + a change in the locked `campaigns_routes.ts`.


## Session 56 (payment audit) — APPLIED (Ravi OK: "dusre vale ko bhi fix kro")
- `scripts/sql/session56.sql`, run on the live DB on 2026-10-15:
  - `chk_transactions_one_source` now also allows a brief-only row → the UGC brief deposit is saved in
    `transactions` (brief_id, brand_id, stamped with the Admin platform fee at payment time).
  - `uq_ugc_briefs_razorpay_order`: one paid order → one brief.
  - `uq_transactions_ugc_payout`: one payout row per UGC order (refund rows excluded).


## (Session 58) Eva 👍 / 👎 feedback table — DONE (Ravi: "ok", migration `session58_eva_feedback`, scripts/sql/session58_eva_feedback.sql)
- **Why:** Eva handoff §8f: "send the feedback to the backend for AI quality". Today `POST /assist/feedback`
  (backend/assist_routes.ts) only writes one JSON line to the server log (`evt: "eva_feedback"`).
- **Change:** `eva_feedback (id uuid, user_id text, role text, vote text 'up'|'down', card text, text text, created_at timestamptz)`,
  RLS on, server-only.
- **Code (done):** `POST /assist/feedback` inserts the row; `GET /admin/eva-feedback` + "Eva reply ratings" box in Admin → Help desk → Chatbot.

## (Session 58) Eva settings table — DONE (Ravi: "ok h")
- `eva_settings (user_id text pk, deals bool, money bool, lang 'en'|'hinglish'|'hi', updated_at)`, RLS on, server-only.
  Applied as migration `session58_eva_settings` (scripts/sql/session58_eva_settings.sql).
- Code: `GET / PUT /assist/settings` (backend/assist_routes.ts), synced when Eva opens and on every change
  (src/components/feedback/evaSettings.js). The phone keeps a copy so Eva still works if the server is down.

## (Session 58, round 8) — Ravi: "database ka access hai … sab bna dena"
APPLIED on the live DB (scripts/sql/OLD_SQL_already_run.sql (session58_missing_columns part)):
- campaigns: gender, follower_min, follower_max, locations, max_creators, collab_mode (+ dos, donts, hashtags kept empty —
  the forms only had sample text). Code saves them now (backend/campaignTargeting.ts).
- creator_profiles.youtube_avg_views (YouTube views were folded into Instagram reach).
- users.suspended_until — Suspend now really blocks the account until that date (login + every request).
- transactions.razorpay_payment_id (+ deposits now keep brand_id). transactions.payout_status default 'PAID' → 'PENDING'
  (a row inserted without it counted as paid out to the creator).
- Storage buckets content-submissions / live-proofs / ugc-assets → private (the app opens them only via /api/media).
APPLIED 2026-10-16 as migration session58_close_public_profile_reads_v2 (the tool refuses DROP, so the same policies
were switched off with ALTER POLICY … TO service_role USING (false); checked: the public key now sees 0 rows).
Original DROP version, for reference:
- scripts/sql/session58_close_public_reads.sql — removes the public read of brand_profiles / creator_profiles /
  creator_verifications (emails, phones, DOB, KYC risk notes readable with the public key) and "authenticated may write
  anything" policies. The app no longer reads these tables from the browser (all through the server), and older app
  versions fall back to the server, so it is safe to run now.

APPLIED 2026-10-16 (v327):
- session58_risk_controls: platform_fee_config + payout_freeze_all (default false), min_campaign_budget,
  max_campaign_budget, withdrawal_fee_rate, dispute_refund_window_days. Enforced in backend/riskControls.ts.
- session58_sessions_30_days: existing user_sessions.expires_at set to now() + 30 days (logins now last 30 days, renewed).

## (Session 58, v334) — App Store 1.2: block a user — DONE in v337 (Session 59)
APPLIED 2026-10-16 as migration `session59_blocked_users` (scripts/sql/OLD_SQL_already_run.sql (session59_blocked_users part)): table `blocked_users`
(blocker_id, blocked_id, created_at, primary key both, blocker ≠ blocked, index on blocked_id), RLS on, no policies →
server only. Code: backend/blockUsers.ts. Original plan below, for reference:
- What: table `blocked_users (blocker_id text, blocked_id text, created_at timestamptz default now(), primary key
  (blocker_id, blocked_id))` + service-role-only access.
- Why: Apple guideline 1.2 (apps with chat / user profiles) asks for a way to block abusive users. v334 added
  "Report this profile" (existing POST /reports) but no block.
- Code after the table exists: `POST/DELETE /users/:id/block` (new route file, not a locked one), hide the blocked
  person's chats / invites / applications for the blocker, a "Block" button next to "Report this profile"
  (`src/components/safety/ReportUserLink.jsx`) and in the chat menu (chat screen files are locked — server calls in
  them need Ravi's OK). See docs/setup/APP_STORE_CHECKLIST.md Part D.


## Session 62 (v349) — explore hide + Instagram — APPLIED 19 Oct 2026 (Ravi: "Haan, kar do")
`scripts/sql/OLD_SQL_already_run.sql (session62_explore_instagram part)`: creator_profiles.hidden_from_explore, instagram_verified_at,
instagram_verify_method, instagram_synced_at, instagram_stats; table instagram_connections (RLS on, server only).

## v357 — creator_profiles.profile_status default (OPTIONAL, needs Ravi's OK — NOT applied)
- Now: `profile_status` column default is `'approved'`, so any new creator row without a status looks approved.
- v357 code already handles it without a DB change (backend/exploreGate.ts approvedByAdmin: a self-registered
  profile made after 10 Oct counts as approved only with `reviewed_at`; backend/creatorReviewGate.ts sets new rows to
  under_review). Extra safety if Ravi says OK:
  `alter table creator_profiles alter column profile_status set default 'under_review';`
- Unclaimed form profiles set their own status ("approved" + reviewed_at on admin approval), so they are unaffected.

## v363 (Session 64, 21 Oct 2026) — waitlist Instagram numbers — APPLIED 21 Oct 2026 (Ravi: "Hn new database bna lo abhi")
Migration `waitlist_instagram_fetch_columns` (live): `waitlist.ig_followers integer`, `instagram_stats jsonb`,
`instagram_synced_at timestamptz`, `instagram_fetch_error text` (all nullable, nothing else touched, 66 rows kept).
Why: Admin → Waitlist → "Fetch Instagram for everyone" had nowhere to keep the fetched numbers next to what the form said.
Code: backend/instagramConnect.ts (POST /admin/creators/instagram-bulk/step), backend/admin_waitlist_routes.ts (list),
backend/creatorApplication.ts (approval uses the fetched numbers), src/components/admin/WaitlistManager.jsx.

## v363 — still OPTIONAL (not applied)
- Portfolio covers need no new column: items stay JSON inside `creator_profiles.portfolio` (text[]) with `cover`
  pointing to our own copy in the `avatars` bucket (`portfolio/<user>/<id>`).
- (v366: DONE — see below) `creator_profiles` has no `dob` / `date_of_birth` / `experience` / `experience_years` columns: the locked
  `creators_routes.ts` profile save tries to write them after every save → one harmless 400 in the logs each time
  (the values live in rate_card). Either add the 4 columns or (with Ravi's OK to touch the locked file) drop that write.

## v364 (21 Oct 2026) — split fee — APPLIED (migration `v364_split_platform_fee`, Ravi: "databse mai bhi bana dena")
- platform_fee_config: `fee_model` ('legacy' | 'split'), `creator_fee_pct`, `brand_fee_pct`; live row set to split / 0 / 8.
- transactions: `brand_fee_pct`, `brand_fee_amount`, `brand_fee_gst`, `brand_paid_amount`, `coupon_code`.
- Brand-fee coupons use the existing coupons table (`applies_to = 'brand_fee'`); no new column.
- Not done (optional, needs Ravi): a brand GST invoice line for the service fee (gst_invoices has no brand-fee column);
  refunds still return the deal amount (gross) — whether the service fee is refunded too is Ravi's call.

## v364 — split fee — APPLIED 21 Oct 2026 (Ravi's fee decision)
Migration `v364_split_platform_fee`: platform_fee_config.fee_model / creator_fee_pct / brand_fee_pct (live: split, 0, 8);
transactions.brand_fee_pct / brand_fee_amount / brand_fee_gst / brand_paid_amount / coupon_code.

## v365 — APPLIED 21 Oct 2026
- `v365_waitlist_email_optional`: waitlist.email nullable (unique when present).
- `v365_coupons_applies_to_brand_fee`: coupons.applies_to CHECK allows brand, creator, brand_fee, all.

## v366 — APPLIED 21 Oct 2026
- `v366_creator_profiles_dob_experience`: creator_profiles.dob, date_of_birth, experience, experience_years (text, nullable).
  The locked creators_routes.ts profile save already writes them after every save — the harmless 400 is gone. Additive only.

## v366 — coupon reservations (atomic brand-fee coupon use) — APPLIED 2026-10-21
Ravi: "ye dono bhi fix karo, baaki jo pending hai unhe bhi work karo" + "haan, locked files mein ye fee change kar do".
Migration `v366_coupon_reservations` (same SQL in `scripts/sql/v366_coupon_reservations.sql`), additive only:
- **Table `coupon_reservations`** (id, coupon_id → coupons ON DELETE CASCADE, brand_id, order_id UNIQUE, status
  reserved/confirmed/released, discount, deal_id, ugc_order_id, campaign_id, expires_at, created_at, confirmed_at).
  RLS on, no policies (server only).
- **Functions** (SECURITY DEFINER; EXECUTE revoked from public/anon/authenticated, granted to service_role only):
  `claim_coupon(p_coupon_id, p_brand_id, p_order_id, p_ttl_minutes, p_discount)` — locks the coupon row (FOR UPDATE),
  checks status / dates / total limit incl. live holds / per-brand limit, holds one use for this order;
  `confirm_coupon(p_order_id, …)` — idempotent; marks the hold confirmed, `used_count + 1`, writes coupon_redemptions;
  `release_coupon(p_order_id)`.
- **Code:** `backend/brandFee.ts` claimBrandCoupon / confirmBrandCoupon (falls back to the old recordBrandCoupon when
  the functions are missing), `backend/payment_routes.ts` create-order + persist, `backend/ugc_routes.ts` brief deposit.
- No new columns. "No per-brand limit" on a coupon is stored as `per_user_limit = 0` (the column is NOT NULL).
- Admin service-fee refunds for UGC briefs use the existing `ugc_refunds` table (slots 0, reason starts with
  "[service-fee refund]") — nothing new.

## v367 · Diwali Creator Challenge — NO database change
- **Status: nothing to run.** Entries and winners are signed stamps inside the existing portfolio item JSON
  (`creator_profiles.portfolio`), see `backend/challenge_routes.ts`.
- **Later (optional, after Diwali):** if challenges become a regular thing, a `challenge_entries` table
  (user_id, item_id, reel_url, entered_at, rank) would make the admin list faster than reading every profile.
  Not needed for this challenge (one read per minute, cached).

## v372 · found in the live logs (22 Oct) — optional, the code already works around both
- **`creator_profiles.email` is NOT NULL live**, but v365 (handle-only waitlist rows) and the tests expect it nullable.
  Live result: approving a handle-only waitlist row / admin-editing an e-mail-less account failed with
  `null value in column "email" of relation "creator_profiles" violates not-null constraint` (14:37 UTC, twice).
  v372 code fix: falls back to the account's never-mailed placeholder (`unclaimed_<id>@ybex.io` / `noemail_<id>@ybex.io`).
  Clean fix in the DB session: `alter table creator_profiles alter column email drop not null;` (only relaxes a rule).
- **`column creator_profiles.id does not exist`** (~20× today) comes from `backend/creators_routes.ts` isMyInvite
  (LOCKED file — not changed). Harmless (falls back to user id), only log noise. Needs Ravi's OK to touch.

## v375 · Brand Instagram username — DONE (applied live 23 Oct 2026, Ravi's OK in chat)
- `alter table public.brand_profiles add column if not exists instagram_handle text;` (migration
  `v375_brand_instagram_handle`, additive — old code ignores it).
- Brand onboarding saves the username there (`backend/auth_routes.ts` brand branch). Logo / name come from Instagram
  when the fetch works, otherwise the brand adds them by hand as before (no background job for brands).


---

# History — SQL prompts already run (kept for reference)


## (was SUPABASE_PROMPT.md)

# Prompt for the Claude that is connected to Ybex's Supabase

Copy everything below the line into that chat.

---

You are connected to the Supabase database of my app **Ybex** (influencer / brand marketplace). Please bring the database up to date with the SQL files below. They were written over several sessions; some may already be applied, some not.

**How to work — please follow exactly:**

1. **Look first, change nothing yet.** For every file below, check in the live database (information_schema / pg_catalog) which of its tables, columns, indexes, triggers and functions already exist. Make a table: file → already done / partly done / not done.
2. **Then run the files in the order given**, one file at a time. Every file is written to be safe to run again (`if not exists`, `create or replace`, `drop trigger if exists`), so a file that is "partly done" can simply be run whole. Do not edit the SQL. If a statement fails, **stop**, show me the exact error and which file / line, and wait for me — do not try to fix it yourself and do not continue with the next file.
3. **Never drop, delete, rename or truncate anything** that is not in these files. Do not touch any other table. Do not change Row Level Security on other tables.
4. **Not part of this job (do NOT run):**
   - `purge_aadhaar.sql` — it deletes old Aadhaar data. Only run its first part (the read-only `select` counts) and tell me the numbers. I will decide separately.
   - `find_wrongly_completed_briefs.sql` — read-only report. Run it and show me the rows (if any). Change nothing.
5. **At the end, check and report:** for each file → "applied ✓" or the error. Also confirm these 5 new tables exist with RLS enabled: `whats_new`, `whats_new_seen`, `push_subscriptions`, `push_campaigns`, `push_log`; that `creator_profiles.fake_follower_pct` and `creator_profiles.performance_score` allow NULL; and that `platform_fee_config` has `brand_markup_pct`, `creator_deduction_pct`, `agency_markup_pct`, `agency_deduction_pct`.

Reply to me in simple Hinglish (Roman script), short.

## Files, in this order

### 1. `ybex_ephemeral.sql` — Session 22 — OTP codes / contract sign tokens shared by all servers

```sql
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
```

### 2. `ugc_delivery_hours.sql` — Session 24 — UGC brief delivery time (24/48/72 h)

```sql
-- Session 24. Brand-chosen first-draft deadline for UGC briefs (24 / 48 / 72 hours).
-- Old briefs stay NULL and keep the old 24h deadline.
alter table public.ugc_briefs
  add column if not exists delivery_hours integer
  check (delivery_hours is null or delivery_hours in (24, 48, 72));
```

### 3. `ugc_deadlines_relist_refunds.sql` — UGC deadline reminders, auto-relist, brand refunds

```sql
-- SQL Migration for UGC Deadline Reminders, Auto-Relist & Brand Refunds
-- Run this in the Supabase SQL editor.

-- 1. ugc_orders fields for reminder tracking and expiration
ALTER TABLE ugc_orders
  ADD COLUMN IF NOT EXISTS reminders_sent int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_reason text;

-- 2. ugc_briefs fields for relisting and priority Explore sorting
ALTER TABLE ugc_briefs
  ADD COLUMN IF NOT EXISTS relisted_at timestamptz,
  ADD COLUMN IF NOT EXISTS relist_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_priority boolean DEFAULT false;

-- 3. users fields for creator reliability stats and WhatsApp opt-in
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS missed_deadlines_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean DEFAULT false;

-- 4. brand_refund_accounts for manual company bank transfer payouts
CREATE TABLE IF NOT EXISTS brand_refund_accounts (
  id text PRIMARY KEY,
  brand_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  method_type text NOT NULL CHECK (method_type IN ('UPI', 'BANK')),
  upi_id text,
  bank_account_number text,
  bank_ifsc text,
  account_holder_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One refund account per brand (the API upserts on brand_id; without this every save fails).
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_refund_accounts_brand_id ON brand_refund_accounts(brand_id);
ALTER TABLE brand_refund_accounts ENABLE ROW LEVEL SECURITY;
-- No public policies: accessible exclusively by backend service-role

-- 5. ugc_refunds queue for brand brief cancellations (manual company payouts)
CREATE TABLE IF NOT EXISTS ugc_refunds (
  id text PRIMARY KEY,
  brief_id text NOT NULL,
  brand_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  slots int NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
  refund_account_snapshot jsonb NOT NULL,
  utr text,
  failure_reason text,
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by text
);

CREATE INDEX IF NOT EXISTS idx_ugc_refunds_brand_id ON ugc_refunds(brand_id);
CREATE INDEX IF NOT EXISTS idx_ugc_refunds_brief_id ON ugc_refunds(brief_id);
CREATE INDEX IF NOT EXISTS idx_ugc_refunds_status ON ugc_refunds(status);
ALTER TABLE ugc_refunds ENABLE ROW LEVEL SECURITY;
-- No public policies: accessible exclusively by backend service-role

-- 6. If ugc_orders / ugc_briefs have a CHECK constraint on status, add the new values:
--    ugc_orders.status: 'EXPIRED'      ugc_briefs.status: 'CANCELLED', 'PARTIALLY_CANCELLED'
--    (Supabase Claude: inspect pg_constraint for these tables and extend the list if present.)

-- 7. Brief delivery hours (session 24, if not run yet)
ALTER TABLE ugc_briefs ADD COLUMN IF NOT EXISTS delivery_hours integer
  CHECK (delivery_hours IS NULL OR delivery_hours IN (24, 48, 72));
```

### 4. `session30_campaign_manage.sql` — Session 30 — pause / close campaign

```sql
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
```

### 5. `user_consents.sql` — Session 34 — what each user agreed to (Terms, Privacy…)

```sql
-- Session 34: what each user agreed to (Terms, Privacy, marketing updates, Creator/Brand Terms),
-- which version and when. Written by the server only (backend/consents.ts, service-role key).
-- Run once in Supabase → SQL Editor.
create table if not exists public.user_consents (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  kind        text not null check (kind in ('terms', 'privacy', 'marketing', 'creator_terms', 'brand_terms')),
  granted     boolean not null,
  version     text not null default '1.0',
  source      text,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists user_consents_user_kind_idx on public.user_consents (user_id, kind, created_at desc);
alter table public.user_consents enable row level security;
revoke all on public.user_consents from anon, authenticated;

-- Public creator application: when the applicant agreed (the form works without this column too).
alter table public.waitlist add column if not exists terms_accepted_at timestamptz;
```

### 6. `onboarding_progress.sql` — Session 34 — onboarding continues where the user left

```sql
-- Session 34: onboarding progress (answers + current step), saved after every step so a creator or
-- brand continues exactly where they left, on any device. Read/written by the server only
-- (backend/onboardingProgress.ts, service-role key).
-- Run once in Supabase → SQL Editor.
create table if not exists public.onboarding_progress (
  user_id     text primary key,
  role        text not null check (role in ('creator', 'brand')),
  flow        text not null,
  page        text not null,
  pos         jsonb,
  answers     jsonb not null default '{}'::jsonb,
  basics_done boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.onboarding_progress enable row level security;
-- No policies on purpose: anon / logged-in browser clients get nothing.
revoke all on public.onboarding_progress from anon, authenticated;
```

### 7. `session35_schema_fixes.sql` — Session 35 — columns the app writes but the DB never had (+2 triggers)

```sql
-- Session 35 (7 Oct 2026): columns the app already writes but the live database never had.
-- Supabase refuses a whole insert/update when ONE key is not a column, so each gap below made a
-- real feature fail. Only ADD columns (all nullable), one trigger pair, and lock one table.
-- Nothing is dropped or renamed. Safe to run twice.

-- 1. Creator payout details (UPI / bank). The app saves by user_id; the table only had creator_id,
--    so "Save payout details" always returned an error.
alter table public.creator_payment_methods add column if not exists user_id text;
alter table public.creator_payment_methods add column if not exists upi_id text;
alter table public.creator_payment_methods add column if not exists bank_account_number text;
alter table public.creator_payment_methods add column if not exists bank_ifsc text;
alter table public.creator_payment_methods add column if not exists account_holder_name text;
alter table public.creator_payment_methods add column if not exists updated_at timestamptz;
do $$
declare c text;
begin
  foreach c in array array['creator_id', 'method_type', 'account_details'] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'creator_payment_methods'
                 and column_name = c and is_nullable = 'NO') then
      execute format('alter table public.creator_payment_methods alter column %I drop not null', c);
    end if;
  end loop;
end $$;
update public.creator_payment_methods set user_id = creator_id::text where user_id is null and creator_id is not null;
create or replace function public.ybex_payment_method_fill() returns trigger language plpgsql as $$
begin
  if new.creator_id is null and new.user_id is not null then
    begin new.creator_id := new.user_id; exception when others then null; end;
  end if;
  if new.method_type is null then
    new.method_type := case when coalesce(new.upi_id, '') <> '' then 'UPI' else 'BANK' end;
  end if;
  return new;
end $$;
drop trigger if exists ybex_payment_method_fill on public.creator_payment_methods;
create trigger ybex_payment_method_fill before insert or update on public.creator_payment_methods
  for each row execute function public.ybex_payment_method_fill();
create unique index if not exists creator_payment_methods_user_id_key on public.creator_payment_methods (user_id);
alter table public.creator_payment_methods enable row level security;
revoke all on public.creator_payment_methods from anon, authenticated;

-- 2. Creator "Request payout" + admin counters (transactions).
alter table public.transactions add column if not exists updated_at timestamptz;
alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists payout_requested boolean;
alter table public.transactions add column if not exists payout_request_count integer;
alter table public.transactions add column if not exists payout_request_notes text;
alter table public.transactions add column if not exists last_payout_requested_at timestamptz;

-- 3. Admin "mark payout paid" on UGC orders.
alter table public.ugc_orders add column if not exists payout_status text;
alter table public.ugc_orders add column if not exists utr_number text;
alter table public.ugc_orders add column if not exists deal_id text;
alter table public.payout_requests add column if not exists utr_number text;
alter table public.chat_threads add column if not exists ugc_order_id text;

-- 4. Brand: "N creators match this brief" read creator_profiles.niche.
alter table public.creator_profiles add column if not exists niche text;

-- 5. Brand profile city / state / agency type (onboarding + settings).
alter table public.brand_profiles add column if not exists city text;
alter table public.brand_profiles add column if not exists state text;
alter table public.brand_profiles add column if not exists agency_type text;

-- 6. Creator onboarding writes the date of birth on users; without the columns the whole users
--    update failed (including onboarded = true).
alter table public.users add column if not exists dob text;
alter table public.users add column if not exists date_of_birth text;

-- 7. Notifications written with id / link / data (campaign approvals, payment released, invites)
--    were refused. Keep notif_id as the key: fill it from id when a row comes without one.
alter table public.notifications add column if not exists id text;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists data jsonb;
create or replace function public.ybex_notif_fill() returns trigger language plpgsql as $$
begin
  if new.notif_id is null then
    new.notif_id := coalesce(new.id, 'notif_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  end if;
  if new.redirect_path is null and new.link is not null then new.redirect_path := new.link; end if;
  return new;
end $$;
drop trigger if exists ybex_notif_fill on public.notifications;
create trigger ybex_notif_fill before insert on public.notifications
  for each row execute function public.ybex_notif_fill();
```

### 8. `session36.sql` — Session 36 — onboarding reminders + admin bulk email tables

```sql
-- Session 36 (v249 + v250). Only NEW tables; nothing is dropped or changed. RLS on, no policies,
-- anon/authenticated revoked — only the server (service-role key) reads and writes them.

-- v249: onboarding reminder emails (max 2 per person; "Stop these reminders")
create table if not exists public.onboarding_reminders (
  user_id      text primary key,
  sent_count   integer not null default 0,
  last_sent_at timestamptz,
  stopped_at   timestamptz
);
alter table public.onboarding_reminders enable row level security;
revoke all on public.onboarding_reminders from anon, authenticated;

-- v250: admin bulk email — report, queue and unsubscribes
create table if not exists public.email_broadcasts (
  id          text primary key,
  subject     text not null,
  heading     text,
  body_text   text not null,
  cta_label   text,
  cta_url     text,
  audience    text not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  total       integer not null default 0,
  sent        integer not null default 0,
  failed      integer not null default 0,
  skipped     integer not null default 0,
  queued      integer not null default 0,
  status      text not null default 'sending'
);
create table if not exists public.email_broadcast_recipients (
  id            text primary key,
  broadcast_id  text not null references public.email_broadcasts(id) on delete cascade,
  email         text not null,
  name          text,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  error         text,
  attempts      integer not null default 0,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists email_broadcast_recipients_queue_idx on public.email_broadcast_recipients (status, created_at);
create index if not exists email_broadcast_recipients_bc_idx on public.email_broadcast_recipients (broadcast_id);
create table if not exists public.email_unsubscribes (
  email       text primary key,
  created_at  timestamptz not null default now()
);
alter table public.email_broadcasts enable row level security;
alter table public.email_broadcast_recipients enable row level security;
alter table public.email_unsubscribes enable row level security;
revoke all on public.email_broadcasts from anon, authenticated;
revoke all on public.email_broadcast_recipients from anon, authenticated;
revoke all on public.email_unsubscribes from anon, authenticated;

-- v250: fee offer toggle (₹0 platform fee + convenience fee) — set only by POST /admin/fee-offer
alter table public.platform_fee_config add column if not exists offer_mode boolean not null default false;
alter table public.platform_fee_config add column if not exists offer_fee_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists offer_label text;

-- v250: creator coupons — "apply automatically" launch offers
alter table public.coupons add column if not exists auto_apply boolean not null default false;

-- v252: creator referral programme
alter table public.referrals add column if not exists referred_email text;
alter table public.referral_config add column if not exists signups_per_reward integer;
alter table public.referral_config add column if not exists free_deals_per_reward integer;
alter table public.referral_config add column if not exists free_deals_valid_days integer;
alter table public.referral_config add column if not exists featured_days integer;
alter table public.referral_config add column if not exists share_pct_of_fee numeric;
alter table public.referral_config add column if not exists share_cap_per_creator numeric;
alter table public.referral_config add column if not exists min_withdraw numeric;
alter table public.referral_config add column if not exists attribution_days integer;
create table if not exists public.referral_reward_uses (
  id           text primary key,
  user_id      text not null,
  deal_id      text,
  ugc_order_id text,
  created_at   timestamptz not null default now()
);
create table if not exists public.referral_withdrawals (
  id         text primary key,
  user_id    text not null,
  amount     numeric not null,
  status     text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  utr        text,
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);
alter table public.referral_reward_uses enable row level security;
alter table public.referral_withdrawals enable row level security;
revoke all on public.referral_reward_uses from anon, authenticated;
revoke all on public.referral_withdrawals from anon, authenticated;

-- v252: promotional line shown with the fee offer
alter table public.platform_fee_config add column if not exists offer_promo_line text;
alter table public.platform_fee_config add column if not exists offer_line_until timestamptz;
```

### 9. `session38.sql` — Session 38 — brand / agency markup fee settings

```sql
-- Session 38 (Ravi: "PHELE YE SAB THEEK KRO") — run once in Supabase → SQL Editor.
-- Only ADDS columns. Safe to run twice.
--
-- Brand / agency markup (the % added to a creator's rate card when a brand or agency views it)
-- and the matching deduction %s used to live only in the server's local file (lost on every
-- deploy, different on every Cloud Run instance). They now sit next to the other fee settings.
-- Defaults are the values the app used until now.

alter table public.platform_fee_config add column if not exists brand_markup_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists creator_deduction_pct numeric not null default 2;
alter table public.platform_fee_config add column if not exists agency_markup_pct numeric not null default 5;
alter table public.platform_fee_config add column if not exists agency_deduction_pct numeric not null default 5;

-- Make sure the server can read the new columns right away (PostgREST schema cache).
notify pgrst, 'reload schema';
```

### 10. `session38_part2.sql` — Session 38 — chat moderation log + pitch leads

```sql
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
```

### 11. `session39.sql` — Session 39 — creator home picks + referral config

```sql
-- Session 39 — only ADDS. Run once in Supabase (SQL editor).
-- 1) Admin picks the 3–4 creators shown on the creator Home ("Creators like you, winning on YBEX")
--    and on the onboarding photo step. Admin → Users → creator → "Show on creator home".
alter table if exists public.creator_profiles
  add column if not exists show_on_creator_home boolean not null default false;
create index if not exists creator_profiles_home_pick_idx
  on public.creator_profiles (show_on_creator_home) where show_on_creator_home;

-- 2) Referral share (Ravi, session 39): 0.2% of what the invited friend received (after the Ybex
--    fee), still capped per friend. New admin-editable setting; the old share_pct_of_fee column
--    stays (not used any more).
alter table if exists public.referral_config
  add column if not exists share_pct_of_earnings numeric not null default 0.2;
```

### 12. `session40.sql` — Session 40 — two score columns may be empty ("Not enough data")

```sql
-- Session 40 (v260). Safe to run more than once.
-- Audience estimate: when a creator has not given likes / reach, "Authentic audience" and
-- "Performance score" are stored as NULL ("Not enough data") instead of a made-up number.
alter table public.creator_profiles alter column fake_follower_pct drop not null;
alter table public.creator_profiles alter column performance_score drop not null;
```

### 13. `session41.sql` — Session 41 — What's new + push notifications (5 tables)

```sql
-- Session 41 — Ravi approved building What's new + push notifications now ("now strt working").
-- Run this whole file once in Supabase → SQL editor after deploying v261. Safe to run again.
-- Session 41 — "What's new" popup. Run once in Supabase → SQL editor.
create table if not exists public.whats_new (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  points jsonb not null default '[]'::jsonb,
  audience text not null default 'all' check (audience in ('all', 'creator', 'brand')),
  cta_label text,
  cta_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whats_new_seen (
  user_id text not null,
  item_id uuid not null references public.whats_new(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Only the server (service key) reads and writes these tables.
alter table public.whats_new enable row level security;
alter table public.whats_new_seen enable row level security;

-- Push notifications ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  url text,
  audience text not null default 'all' check (audience in ('all', 'creator', 'brand', 'niche')),
  niches jsonb not null default '[]'::jsonb,
  send_at timestamptz,          -- empty = send now
  sent_at timestamptz,          -- set when it went out
  sent_count integer,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.push_log (
  user_id text not null,
  kind text not null,           -- 'promo' | 'deal'
  ref text not null,            -- push_campaigns.id or notifications.id
  sent_at timestamptz not null default now(),
  primary key (kind, ref, user_id)
);
create index if not exists push_log_promo_day_idx on public.push_log (kind, sent_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_campaigns enable row level security;
alter table public.push_log enable row level security;
```

## Not to run now (see step 4)

### `purge_aadhaar.sql`

```sql
-- Session 34 (Ravi): Ybex no longer collects Aadhaar (KYC = PAN + bank/UPI). The Privacy Policy now
-- says so, so remove what older versions stored. Run in Supabase → SQL Editor AFTER checking the
-- counts in step 1. The image files themselves are in the private storage bucket "kyc-documents" —
-- delete those from Storage too (step 2 lists them).

-- 1. How many rows hold Aadhaar today (read only)
select count(*) filter (where coalesce(aadhaar_number, '') <> '') as with_number,
       count(*) filter (where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '') as with_images
from public.creator_kyc;

-- 2. List the image files first (copy this result), then delete them in Storage → kyc-documents
select aadhaar_front_url, aadhaar_back_url from public.creator_kyc
 where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

-- 3. Clear them
update public.creator_kyc
   set aadhaar_number = null, aadhaar_front_url = null, aadhaar_back_url = null
 where coalesce(aadhaar_number, '') <> '' or coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

update public.verifications
   set documents = documents - 'creator_aadhaar'
 where documents ? 'creator_aadhaar';
```

### `find_wrongly_completed_briefs.sql`

```sql
-- Session 24. Briefs that were auto-marked COMPLETED while slots were still open
-- (bug: "Completed · Recruited 1/2"). Read-only: review the list first.
select b.id, b.title, b.brand_id, b.max_creators, b.claimed_count, b.budget,
       count(o.id) filter (where upper(coalesce(o.status,'')) in ('COMPLETED','PAID','RELEASED')
                           or upper(coalesce(o.payment_status,'')) in ('RELEASED','PAID')) as done_orders,
       (b.max_creators - count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED')) as open_slots,
       (b.max_creators - count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED')) * b.budget as escrow_on_open_slots
from public.ugc_briefs b
left join public.ugc_orders o on o.brief_id = b.id
where upper(coalesce(b.status,'')) = 'COMPLETED'
group by b.id
having count(o.id) filter (where upper(coalesce(o.status,'')) <> 'CANCELLED') < b.max_creators
order by b.created_at desc;

-- To reopen them for creators (only after reviewing the list above):
-- update public.ugc_briefs set status = 'OPEN' where id in ( ...ids from above... );
```


## (was SESSION_31_SUPABASE_PROMPTS.md)

# Session 31 — prompts for Ravi's Supabase-connected Claude

Copy one prompt at a time. Run them in this order. Prompt 3 only AFTER version230 is deployed and tested.

---

## Prompt 1 — landing reviews: rating column + report (safe, run any time)

```
Project: Ybex (Supabase). Please do these steps and report back exactly what you found and changed.

1. Show the columns of public.landing_reviews (name, type, default, nullable).
2. If there is NO column named "rating": add it with
     ALTER TABLE public.landing_reviews ADD COLUMN rating smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5);
   If it exists, do not change it; just report its type.
3. If there is NO column named "created_by": add it with
     ALTER TABLE public.landing_reviews ADD COLUMN created_by text;
4. Show the row count of public.landing_reviews and public.landing_brands, and the RLS policies on both tables.
   Do NOT add, delete or edit any rows.
5. Report: columns before/after, row counts, RLS policies.
```

## Prompt 2 — delete the empty `banner-images` bucket (safe)

```
Project: Ybex (Supabase Storage). Please:
1. Count the files in the storage bucket "banner-images" (all folders).
2. If it has 0 files: delete the bucket "banner-images".
   If it has ANY files: do NOT delete it — list the file paths and sizes and stop.
3. Confirm the bucket "banners" exists and is PUBLIC (create it as public if it is missing, allowed types image/jpeg, image/png, image/webp).
4. Count rows in public.banners where image_url starts with 'data:image/' (do not change them — the app's admin button moves them).
5. Report what you did.
```

## Prompt 3 — make `content-submissions` private (run LAST, after v230 is live and tested)

```
Project: Ybex (Supabase Storage). The app now opens every deliverable video through its own
/api/media link (access check + 15-minute signed link), so the bucket no longer needs to be public.
Please:
1. Show whether the bucket "content-submissions" is public, and its file count and total size.
2. Set the bucket "content-submissions" to PRIVATE (public = false). Do not move, rename or delete any file.
3. Show the storage.objects policies for this bucket. Do NOT add any policy that lets anon or
   authenticated users read it (the server uses the service role).
4. Repeat steps 1–3 for "live-proofs" and "ugc-assets" and report whether each is public.
5. Report before/after for each bucket.
```

### How to test after Prompt 3 (Ravi)
1. Open a UGC order (brand) with a submitted video → it plays.
2. Same as the creator → it plays.
3. Open a campaign chat with a deliverable video → it plays; Download still works.
4. Log out and paste an old video link in the browser → it must NOT open.
If any of 1–3 fails: tell me which screen; to undo quickly, ask the Supabase Claude to set the bucket back to public.


## (was SESSION_35_SUPABASE_PROMPTS.md)

# Session 35 — prompts for Ravi's Supabase-connected Claude

Copy ONE prompt at a time, in this order. Send the report each prompt asks for back to the coding
session before running the next one. Every prompt says: check first, change only what is written,
stop and report on any error.

Order:
1. Prompt 0 — health check (read only)
2. Prompt 1 — `onboarding_progress` table (needed by v239+ onboarding resume)
3. Prompt 2 — `user_consents` table + waitlist column (needed by v241+ consent records)
4. Prompt 3 — Aadhaar purge, step 1 (read only: counts + file list)
5. Prompt 4 — Aadhaar purge, step 2 (clear) — only after Ravi deleted the files from Storage
6. Then the older prompts in `docs/database/SESSION_31_SUPABASE_PROMPTS.md`: Prompt 1, Prompt 2,
   and Prompt 3 LAST (after the new version is live and tested).

---

## Prompt 0 — health check (read only, run first)

```
I need a READ-ONLY health check of my Supabase project for Ybex. Do not change anything.

1. Tell me which project you are connected to (name + ref), so I can confirm it is Ybex production.
2. For each table below, say whether it exists, and list its columns with types:
   onboarding_progress, user_consents, waitlist, creator_kyc, verifications, users,
   creator_profiles, ybex_ephemeral, platform_fee_config.
3. For onboarding_progress and user_consents (if they exist): is Row Level Security enabled, how many
   policies do they have, and do roles anon / authenticated have any privileges on them
   (information_schema.role_table_grants)?
4. Does the table waitlist have a column named terms_accepted_at?
5. List the storage buckets and say for each whether it is public or private.

Reply with a short report, one section per point. If anything errors, show the exact error and stop.
```

## Prompt 1 — onboarding progress table

```
I need one new table in my Supabase project for Ybex (onboarding progress, saved after every step).
Do ONLY what is written below. Do not change, drop or alter any other table, policy, function or data.

STEP 1 — Check (read only): if public.onboarding_progress already exists, show its columns and STOP.

STEP 2 — If it does not exist, run exactly:

create table if not exists public.onboarding_progress (
  user_id     text primary key,
  role        text not null check (role in ('creator', 'brand')),
  flow        text not null,
  page        text not null,
  pos         jsonb,
  answers     jsonb not null default '{}'::jsonb,
  basics_done boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.onboarding_progress enable row level security;
revoke all on public.onboarding_progress from anon, authenticated;

Do NOT add any RLS policy (only the server's service-role key uses this table).

STEP 3 — Verify and report: the 8 columns and types; RLS enabled; zero policies; anon and
authenticated have no privileges; row count 0. Show the exact error if any step fails.
```

## Prompt 2 — consent records table

```
I need one new table and one new column in my Supabase project for Ybex (who agreed to which Terms
version, and when). Do ONLY what is written below. Do not change anything else.

STEP 1 — Check (read only): does public.user_consents exist? Does public.waitlist have a column
terms_accepted_at? If both already exist, show them and STOP.

STEP 2 — Run exactly:

create table if not exists public.user_consents (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  kind        text not null check (kind in ('terms', 'privacy', 'marketing', 'creator_terms', 'brand_terms')),
  granted     boolean not null,
  version     text not null default '1.0',
  source      text,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists user_consents_user_kind_idx on public.user_consents (user_id, kind, created_at desc);
alter table public.user_consents enable row level security;
revoke all on public.user_consents from anon, authenticated;

alter table public.waitlist add column if not exists terms_accepted_at timestamptz;

Do NOT add any RLS policy.

STEP 3 — Verify and report: user_consents columns and types; the index exists; RLS enabled; zero
policies; anon / authenticated have no privileges; waitlist now has terms_accepted_at. Show the
exact error if any step fails.
```

## Prompt 3 — Aadhaar purge, step 1 (READ ONLY)

```
Ybex no longer collects Aadhaar. Before deleting old data I need a READ-ONLY report. Change nothing.

1. Run:
select count(*) filter (where coalesce(aadhaar_number, '') <> '') as with_number,
       count(*) filter (where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '') as with_images
from public.creator_kyc;

2. Run and give me the full result as a list (I will delete these files from Storage myself):
select user_id, aadhaar_front_url, aadhaar_back_url from public.creator_kyc
 where coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

3. Run:
select count(*) from public.verifications where documents ? 'creator_aadhaar';

If a column or table does not exist, say so and continue with the next query.
```

## Prompt 4 — Aadhaar purge, step 2 (clear) — only after the files were deleted from Storage

```
Ybex no longer collects Aadhaar. Clear the old Aadhaar data. Do ONLY this.

STEP 1 — Run exactly:
update public.creator_kyc
   set aadhaar_number = null, aadhaar_front_url = null, aadhaar_back_url = null
 where coalesce(aadhaar_number, '') <> '' or coalesce(aadhaar_front_url, '') <> '' or coalesce(aadhaar_back_url, '') <> '';

update public.verifications
   set documents = documents - 'creator_aadhaar'
 where documents ? 'creator_aadhaar';

STEP 2 — Verify: re-run the three counts from the read-only report; all must be 0. Report the
number of rows each update changed. Show the exact error if any step fails.
```


---

## STATUS (end of session 35)
Done: Prompt 0, 1, 2, 3 (read-only), Session 31 Prompt 1.
Found: 3 KYC files (1 Aadhaar + 2 PAN) of two deleted accounts in the PUBLIC bucket `cover-images`
(mobile KYC upload sent no bucket — fixed in v244).

Ravi, by hand (Dashboard → Storage → cover-images):
- folder 91fcc5f2-b557-4d5f-a5eb-8323795fe221 → delete both files
- folder a3185fa0-fef2-4e55-b933-2c1d04a2d09e → delete file_ne8ndc286p.png
- bucket banner-images → Delete bucket

## Prompt 5 — KYC cleanup (only AFTER the files above are deleted)
```
Final cleanup for Ybex. Do ONLY what is written.
STEP 1 (read only):
select bucket_id, name from storage.objects
where name ilike '%ztz950lga2e%' or name ilike '%b0vvaz3ufft%' or name ilike '%ne8ndc286p%';
Expected: 0 rows. If any row comes back, show it and STOP.
STEP 2:
delete from public.creator_kyc
 where creator_id in ('a3185fa0-fef2-4e55-b933-2c1d04a2d09e', '91fcc5f2-b557-4d5f-a5eb-8323795fe221');
delete from public.password_reset_tokens where user_id = 'a3185fa0-fef2-4e55-b933-2c1d04a2d09e';
STEP 3: rows deleted (expected 2 and 1) and
select count(*) from public.creator_kyc where aadhaar_front_url is not null or aadhaar_back_url is not null; (must be 0)
```

## Prompt 6 — missing columns (file: scripts/sql/OLD_SQL_already_run.sql (session35_schema_fixes part))
Ask: run the file exactly as ONE migration named session35_schema_fixes; on any error show it and STOP;
reply "done" + row count of creator_payment_methods.
```sql
-- Session 35 (7 Oct 2026): columns the app already writes but the live database never had.
-- Supabase refuses a whole insert/update when ONE key is not a column, so each gap below made a
-- real feature fail. Only ADD columns (all nullable), one trigger pair, and lock one table.
-- Nothing is dropped or renamed. Safe to run twice.

-- 1. Creator payout details (UPI / bank). The app saves by user_id; the table only had creator_id,
--    so "Save payout details" always returned an error.
alter table public.creator_payment_methods add column if not exists user_id text;
alter table public.creator_payment_methods add column if not exists upi_id text;
alter table public.creator_payment_methods add column if not exists bank_account_number text;
alter table public.creator_payment_methods add column if not exists bank_ifsc text;
alter table public.creator_payment_methods add column if not exists account_holder_name text;
alter table public.creator_payment_methods add column if not exists updated_at timestamptz;
do $$
declare c text;
begin
  foreach c in array array['creator_id', 'method_type', 'account_details'] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'creator_payment_methods'
                 and column_name = c and is_nullable = 'NO') then
      execute format('alter table public.creator_payment_methods alter column %I drop not null', c);
    end if;
  end loop;
end $$;
update public.creator_payment_methods set user_id = creator_id::text where user_id is null and creator_id is not null;
create or replace function public.ybex_payment_method_fill() returns trigger language plpgsql as $$
begin
  if new.creator_id is null and new.user_id is not null then
    begin new.creator_id := new.user_id; exception when others then null; end;
  end if;
  if new.method_type is null then
    new.method_type := case when coalesce(new.upi_id, '') <> '' then 'UPI' else 'BANK' end;
  end if;
  return new;
end $$;
drop trigger if exists ybex_payment_method_fill on public.creator_payment_methods;
create trigger ybex_payment_method_fill before insert or update on public.creator_payment_methods
  for each row execute function public.ybex_payment_method_fill();
create unique index if not exists creator_payment_methods_user_id_key on public.creator_payment_methods (user_id);
alter table public.creator_payment_methods enable row level security;
revoke all on public.creator_payment_methods from anon, authenticated;

-- 2. Creator "Request payout" + admin counters (transactions).
alter table public.transactions add column if not exists updated_at timestamptz;
alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists payout_requested boolean;
alter table public.transactions add column if not exists payout_request_count integer;
alter table public.transactions add column if not exists payout_request_notes text;
alter table public.transactions add column if not exists last_payout_requested_at timestamptz;

-- 3. Admin "mark payout paid" on UGC orders.
alter table public.ugc_orders add column if not exists payout_status text;
alter table public.ugc_orders add column if not exists utr_number text;
alter table public.ugc_orders add column if not exists deal_id text;
alter table public.payout_requests add column if not exists utr_number text;
alter table public.chat_threads add column if not exists ugc_order_id text;

-- 4. Brand: "N creators match this brief" read creator_profiles.niche.
alter table public.creator_profiles add column if not exists niche text;

-- 5. Brand profile city / state / agency type (onboarding + settings).
alter table public.brand_profiles add column if not exists city text;
alter table public.brand_profiles add column if not exists state text;
alter table public.brand_profiles add column if not exists agency_type text;

-- 6. Creator onboarding writes the date of birth on users; without the columns the whole users
--    update failed (including onboarded = true).
alter table public.users add column if not exists dob text;
alter table public.users add column if not exists date_of_birth text;

-- 7. Notifications written with id / link / data (campaign approvals, payment released, invites)
--    were refused. Keep notif_id as the key: fill it from id when a row comes without one.
alter table public.notifications add column if not exists id text;
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists data jsonb;
create or replace function public.ybex_notif_fill() returns trigger language plpgsql as $$
begin
  if new.notif_id is null then
    new.notif_id := coalesce(new.id, 'notif_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  end if;
  if new.redirect_path is null and new.link is not null then new.redirect_path := new.link; end if;
  return new;
end $$;
drop trigger if exists ybex_notif_fill on public.notifications;
create trigger ybex_notif_fill before insert on public.notifications
  for each row execute function public.ybex_notif_fill();
```

## Prompt 7 — Session 31 Prompt 3 (content-submissions private) — LAST, after v244 is live and tested.


## (was UGC_DEADLINE_RELIST_REFUND_SYSTEM.md)

# Build prompt: UGC deadline reminders, auto-relist and brand cancel & refund

> Paste this whole file into the build tool. It is written for an AI coding agent working in the
> Ybex repo (version-196 or later). **Claude reviews the result afterwards** (see the last section).
> Decisions marked **(approved)** are final. Remaining **[DECISION]** items use the default written next to them.

---

## 0. Project rules you must follow (from `docs/code/ARCHITECTURE.md`, `AGENTS.md`)

- Read `docs/code/ARCHITECTURE.md` first. The table at the top lists **protected rules**; do not undo any of
  them. Add a new row for each rule you introduce, with the reason and the guard test.
- **WHO + WHEN on every action.** Each route checks who may call it and in which state.
- **Status tokens are the DB contract.** Every new `status` / `flow_state` value goes into
  `backend/statusTokens.ts` and into the Supabase check constraint (give Ravi the SQL).
- **A money claim in the UI must match the server.** Never show an amount, fee or timeline the
  server doesn't produce or can't keep.
- **No competitor names** anywhere.
- Run `npm run verify` (tsc + crash guard + all tests) before handing back. **Never edit an
  existing test to make it pass**; change the code.
- All in-app, email and WhatsApp text is **English**.
- Supabase is the source of truth. `db_mock.json` is a local fallback only — it is wiped on every
  Cloud Run restart, so nothing in this system may depend on it alone.

## 1. Why this exists

A creator claims a UGC brief (the brand's money is already in escrow) and the app promises
*"Missing the deadline cancels the order."* **The server never enforces this.** Today:

- `POST /ugc/orders/claim` (`backend/ugc_routes.ts`, ~line 2135) sets
  `internal_deadline = now + 24h`, and that's the only place a deadline exists.
- Nothing checks it afterwards. No reminder, no cancel, no relist; a creator can even submit after
  the deadline. The brand's slot stays blocked by a creator who has gone quiet.
- There is **no brief-cancel route** for brands at all.

Goal: creators get nudged to deliver; if they don't, the slot goes back to the public quickly and
visibly; brands can cancel unused slots and get their money back through a tracked refund queue.

## 2. Definitions

- **Claim time** = when the order was created (`ugc_orders.created_at`).
- **Deadline** = `ugc_orders.internal_deadline`. It is 24h today. If the brief-level delivery
  option (24/48/72h, field `delivery_hours` on `ugc_briefs`) has been built, use it; otherwise 24h.
- **"Did something"** = the first draft exists: `video_url` OR `submission_link` OR `drive_url`
  set, or status `SUBMITTED` / `DELIVERED` / `CONTENT_SUBMITTED` / `IN_REVIEW`. Revisions and
  live links are **out of scope**; only the first draft counts.
- **Active order** = not delivered, not cancelled, not completed.

## 3. The scheduler (build this first)

There is no job runner today, and Cloud Run is **one instance**. Build:

- A protected endpoint `POST /internal/cron/ugc-deadlines`, secured by the header
  `x-cron-secret` (compared constant-time with env `CRON_SECRET`; 401 otherwise). Not reachable
  without the secret, not linked from any UI.
- **Google Cloud Scheduler** calls it every **15 minutes**. Write the exact `gcloud` command for
  Ravi in your hand-off note.
- Each run processes all active orders past their thresholds. It must be **idempotent**: running
  twice in the same minute sends nothing twice and relists nothing twice. Store the state on the
  order (fields below) and update it with a conditional write (only if the value is still what you
  read), so two overlapping runs can't both act.
- It must also be correct when we move to several instances later: no in-memory state, only DB.

New `ugc_orders` fields (give Ravi the SQL):
`reminders_sent int default 0`, `last_reminder_at timestamptz`, `admin_alerted_at timestamptz`,
`expired_at timestamptz`, `expiry_reason text`.

## 4. Reminders to the creator

**Schedule:**
- First reminder **6 hours after claim**, if nothing was done.
- Then **every 3 hours** until the deadline, while still nothing is done.
- Stop immediately once the draft exists or the order is closed.

**Quiet hours (approved):** no email/WhatsApp between **10 pm and 8 am IST**. A reminder
that falls in that window goes out at 8 am. The in-app notification is always sent.

**Cap (approved):** with a 48h/72h deadline, "every 3h" means many messages, so send **max 6
reminders per order**; the last one is the "final" message (see copy).

**Channels, every reminder:**
- In-app notification: `notifications` table, `redirect_path` = the order workspace.
- **Email** via the existing Resend setup (see `backend/helpers.ts` / `notificationService.ts`
  for the current sender).
- **WhatsApp** (see §9).

**Action button:** every message has one button, **"Upload your video"**, which opens the order
workspace. Mobile: `/creator/ugc?tab=manage&orderId=<id>`. Desktop: same route. It must open that
order, not the list. There is a known bug where a deep link opens the raw order — fix it or make
sure the button still lands correctly.

**Content of the messages:** use the approved copy in §10. Don't invent your own wording.

## 5. Admin alert

- **When:** 3 hours before the deadline, if there's still no draft, set `admin_alerted_at` (once).
- **What:** an admin-dashboard alert plus an email to the admin address, listing creator (name,
  phone, email), brand, brief, deadline and time left, with a link to the order. The admin may
  call the creator.
- Also log it with the existing admin action log (WHO = system, WHEN = now).

## 6. Deadline passed, still no draft → expire and relist

At the deadline, if nothing was done, **in one guarded step**:

1. Order: status → new token **`EXPIRED`** (add it to `statusTokens.ts` + DB constraint). Set
   `expired_at`, `expiry_reason = 'NO_DRAFT_BY_DEADLINE'`. The order leaves the creator's active
   list. Show it under "Closed" with a line: *"This order expired because no draft was submitted in
   time."* The creator can no longer submit to it; the server rejects submit on an expired order
   with 409.
2. **Slot:** give it back to the brief with the existing slot helper
   (`backend/ugcSlots.ts → releaseBriefSlot`). **The money stays in the brief's escrow.**
   Nothing is refunded here; this is not a brand cancellation.
3. **Brief becomes "relisted":** set on `ugc_briefs`: `relisted_at timestamptz`,
   `relist_count int`, `is_priority boolean true`.
4. **Record** on the creator: a missed-deadline count (used by the creator card's on-time %
   later). Don't change their rating number directly.
5. **Notify:**
   - Creator: expired message (§10).
   - Brand: *"Your creator missed the deadline — your brief is live again at the top"* (§10).
6. The chat thread gets a system message and `thread_updated` (protected rule 30).

The same creator **can't re-claim** a brief they let expire.

## 7. Relisted briefs: top of Explore + bonus

- **Priority:** in `GET /ugc/briefs/available`, relisted briefs (`is_priority = true` and an open
  slot) come **first**, newest relist first, then the normal order. The card shows a badge
  **"Urgent · relisted"** (mobile `CreatorUGCMobile.jsx` explore list, desktop
  `CreatorUGCBrowse.jsx`).
- `is_priority` clears when the relisted slot is claimed (or the brief closes).
- **Relist bonus: NOT in this build (Phase 2).** Don't add any bonus field, setting or text.
- **[DECISION] Deadline for the new creator:** default is the brief's normal delivery time from
  their claim (not shortened).

## 8. Brand cancels a brief → refund queue

There is no brief cancel today. Build `POST /ugc/briefs/:id/cancel`.

**WHO:** only the brief's brand (or admin).

**WHEN:**
- **Not within 24 hours of creating the brief.** Return 409 with
  *"You can cancel this brief 24 hours after posting it."* The UI shows the time left
  instead of the button.
- After 24h: allowed at any time.

**What gets cancelled (approved):** **only slots nobody is working on**
(unclaimed + relisted). Orders already claimed and in progress, or delivered, continue as normal
(the creator is working; cancelling them is a dispute, not a button). The brief closes to new
claims. If every slot is in progress, the cancel button explains that and offers support.

**Refund amount:** open slots × per-creator budget, from the server's own brief/escrow numbers.
If the brief has no open slots, 409.

**Records:**
- A refund row: new table `ugc_refunds` — `id, brief_id, brand_id, amount, slots, reason,
  status ('PENDING' | 'PROCESSED' | 'FAILED'), refund_account_snapshot (jsonb), utr,
  failure_reason, requested_at, processed_at, processed_by`. Give the SQL; RLS on, no public policies.
- Brief: status `CANCELLED` (or `PARTIALLY_CANCELLED` if some orders continue) → both into
  `statusTokens.ts`.

**Refunds are paid MANUALLY by Ybex from the company bank account — not through Razorpay.**
Do not call the Razorpay refund API anywhere in this system.

- The brand needs a **refund account**. In the cancel flow, first ask **"How would you like your
  refund?"** with two choices: **UPI** or **Bank account** (approved by Ravi).
  - **UPI** → show only the UPI ID field.
  - **Bank account** → show account number, re-enter account number, IFSC and account holder name.
  - If the brand already saved one, show it masked (last 4 digits / UPI) with "Use this" or "Change". Store it like creator payout methods (full number never sent back
  to the browser; see `backend/payoutMethods.ts` for the validation + masking pattern). New table
  or reuse: `brand_refund_accounts` (SQL, RLS on, no public policies).
- The cancel **stores a snapshot** of that account on the `ugc_refunds` row (so a later change
  doesn't redirect an already-requested refund).

**Brand message on confirm (before the call):** a confirmation sheet showing the exact server
amount and the masked refund account. After success: see §10 "Brand cancel".

## 9. Admin: Payouts → "UGC Refunds"

- A new section **"UGC Refunds"** inside the admin dashboard's Payouts area (desktop `Admin.jsx`
  payouts tab; also mobile `AdminPayoutMobile.jsx`).
- It lists **only brand cancellations** (`ugc_refunds`), not expired creator orders. Those relist
  and never come here.
- Each row: brand, brief, amount, slots, requested time, status.
- The row shows the brand's refund account **the same way the admin payout screen shows a
  creator's payout account** (reuse that component/layout): method (UPI or Bank), UPI ID, or
  account number + IFSC + holder name, each with a copy button. Full details visible **only to
  admins**.
- Action **"Mark as refunded"**: admin enters the **UTR / bank reference** (required) and date. Status
  → `PROCESSED`, store `utr`, `processed_at`, `processed_by`. Log WHO and WHEN. The brand gets the
  "refund sent" message (§10) with the UTR.
- Action **"Mark failed"** with a reason (e.g. wrong account). The brand is asked to fix the refund
  account; the row returns to `PENDING`.
- Refund rows older than 2 working days while still `PENDING` are highlighted red for the admin.
- The brand sees the refund status on the brief ("Refund processing" → "Refunded on <date>").

## 10. Message copy (approved)

User-facing name for escrow is **Ybex SafePay** (Ravi: many users don't know the word "escrow").

**Approved by Ravi** (subjects made more urgent on his request). `{payout}` = the order's
`creator_payout` from the server — never a guessed number. Keep the urgency honest: say only what
the system really does.

Placeholders: `{payout}`, `{creator_first_name}`, `{brief_title}`, `{brand_name}`, `{time_left}`,
`{deadline_time}`, `{amount}`, `{order_link}`.

**Reminder, first (6h after claim)**
> Subject: ⏳ Your ₹{payout} is waiting — upload your video for {brand_name}
>
> Hi {creator_first_name}, you claimed **{brief_title}** by {brand_name}. The payment is already
> held safely with Ybex SafePay, and it's yours once your video is approved. You have **{time_left}** left to
> upload your draft.
>
> Button: **Upload your video**

**Reminder, repeat (every 3h)**
> Subject: ⚠️ Only {time_left} left — don't lose your ₹{payout} order
>
> Hi {creator_first_name}, we haven't received your draft for **{brief_title}** yet. Please
> upload it before **{deadline_time}**. Brands pick creators who deliver on time, and late or
> missed orders show on your profile.
>
> Button: **Upload your video**

**Reminder, final (last one before the deadline)**
> Subject: 🚨 Last chance: {brief_title} gets cancelled at {deadline_time}
>
> Hi {creator_first_name}, this is the last reminder. If no draft is uploaded by
> **{deadline_time}**, this order will be cancelled, the brief goes to another creator, and the
> missed deadline is recorded on your profile.
>
> Button: **Upload now**

**Creator, order expired**
> Subject: ❌ Your ₹{payout} order for {brief_title} was cancelled
>
> Hi {creator_first_name}, no draft was uploaded for **{brief_title}** by the deadline, so the
> order has been cancelled and the brief is open to other creators. You can keep claiming new
> briefs. Please claim only when you can deliver on time.
>
> Button: **Explore briefs**

**Brand, creator missed the deadline**
> Subject: Your brief is live again — back at the top for creators
>
> The creator who claimed **{brief_title}** didn't deliver in time, so we cancelled their order.
> Your payment is still held safely with Ybex SafePay, and your brief is back at the top of the creator feed so a
> new creator can pick it up quickly.
>
> Button: **View brief**

**Brand cancel, confirmation sheet (before cancelling)**
> **Cancel this brief?**
> {slots} unused slot(s) will be cancelled and **₹{amount}** refunded to your account ending
> **{account_last4}** within 1–2 working days. Creators already working on this brief will finish their orders.
>
> Buttons: **Cancel brief** / **Keep brief**

**Brand cancel, after success**
> **Brief cancelled.** Your refund of **₹{amount}** will be sent to your account ending
> **{account_last4}** within **1–2 working days**.

**Brand, refund sent**
> Subject: ✅ ₹{amount} refund sent — UTR {utr}
>
> We've sent **₹{amount}** for **{brief_title}** to your account ending **{account_last4}**.
> Bank reference (UTR): **{utr}**.

**Admin alert**
> Subject: [URGENT] {creator_name} hasn't delivered — {time_left} left
>
> {creator_name} ({creator_phone}, {creator_email}) claimed {brief_title} for {brand_name} and
> hasn't uploaded a draft. Deadline: {deadline_time} ({time_left} left). Reminders sent:
> {reminders_sent}.
>
> Button: **Open order**

WhatsApp versions: same text, shortened to fit a template (one short paragraph + the button).
Submit them as **Utility** templates (order updates). Meta may re-classify very salesy wording
as Marketing (costs more, needs marketing opt-in), so keep the WhatsApp body factual; the extra
urgency lives mainly in the email subject.

## 10b. Brand explainer promise depends on this build

The brand explainer (`src/components/ugc/BriefSafetyExplainer.jsx`) already promises: *"100% refundable. Any slot no creator is working on can be cancelled after the first 24 hours, and the full amount comes back to your bank or UPI."* The cancel + refund flow in §8–§9 must deliver exactly that.

## 11. WhatsApp setup

- WhatsApp Business messages need a provider (e.g. Twilio or Meta Cloud API) and **Meta-approved
  templates** for business-initiated messages, with the button as a URL button. Create one
  template per message in §10.
- The creator must have **opted in**. Add a consent line at signup/profile, stored as
  `whatsapp_opt_in` + phone. No opt-in → email + in-app only.
- New env vars (document them for Cloud Run). If they're missing, WhatsApp is skipped silently
  and email still goes out. Never fail the job because WhatsApp failed.
- Log every send (channel, template, order, result) so we can see delivery problems.

## 12. Tests to add (must pass with `npm run verify`)

- Scheduler: 5h59m after claim → nothing; 6h → one reminder; running twice → still one; 9h →
  second; draft uploaded → no more; quiet hours shift email/WhatsApp to 8 am; cap respected.
- Admin alert once, 3h before the deadline.
- Expiry: status `EXPIRED`, slot released, money unchanged, brief `is_priority`, same creator
  can't re-claim, submit on an expired order → 409, both parties notified.
- `/ugc/briefs/available` puts relisted briefs first.
- Cancel: 403 for another brand; 409 within 24h; only open slots refunded; amount equals the
  server's numbers; `ugc_refunds` row created; in-progress orders untouched.
- Refund: `PROCESSED` only with a UTR entered by an admin; non-admin gets 403; the brand never
  receives another brand's account; the Razorpay refund API is never called.
- Cron endpoint: 401 without or with a wrong secret.
- No relist-bonus field or text anywhere (Phase 2).

## 13. Hand-off note to write when done

List:
- the SQL (fields, `ugc_refunds`, constraints, RLS)
- env vars
- the Cloud Scheduler command
- the WhatsApp templates submitted
- new status tokens
- new `docs/code/ARCHITECTURE.md` rows
- anything you couldn't finish

---

## For Claude (review checklist, used after the other tool builds it)

- Every item in §3–§11 exists and behaves as written, **or** Ravi approved a change.
- Protected rules 1–40 are not undone. New rows were added to `docs/code/ARCHITECTURE.md`. No existing test
  was edited to pass.
- `npm run verify` and `npm run build` pass. Read the new tests; they should test behaviour, not
  just grep strings.
- Cron security: secret required, constant-time compare, idempotent conditional writes.
- Money: expiry never refunds; cancel refunds only open slots; amounts come from the server; the
  bonus comes from the platform, not the brand; `PROCESSED` only on real Razorpay acceptance.
- Copy used is exactly the approved §10 text (1–2 working days is Ravi's own commitment — manual transfer).
- Status tokens added in `statusTokens.ts` + SQL constraint.
- WhatsApp fails safe (email still sends). Opt-in is respected.

---

## QA v382 (30 Oct 2026) — database / Supabase-dashboard items (NOT done: need Ravi's OK in the database session)

Source: Ybex_v382_Deep_QA_Report.pdf. Nothing below was changed by code; each is a dashboard / SQL action.

1. **CRITICAL — private buckets are public.** Supabase → Storage → `content-submissions`, `live-proofs`, `ugc-assets` → set **Private**; delete policy
   "App read private buckets" (anon SELECT); set allowed MIME types + size limits. The server signs all links (`backend/mediaAccess.ts`), so nothing breaks.
2. **Unique indexes (money).** `transactions`: unique on the Razorpay order id and on (deal_id, type) for SUCCESS rows — written for the real
   `refund_amount` default (0, not null; the old partial index in `scripts/sql/session56.sql` never matched). Stops the double-recorded payment race.
3. **RLS `public_select_campaigns` (anon, qual=true):** limit to `status='live'`; then move `BrandPublicProfileModal.jsx:62` to the server API.
4. **Storage policy "Insert avatars and brand-logos" (anon INSERT):** remove after the 3 upload screens go through `/api/upload`; add size/MIME limits.
5. **Test data:** delete users `dev-user-id-12345`, `dev-admin-id-12345`, `dev-brand-id-12345`, `00000000-0000-0000-0000-000000000000`; confirm / remove
   admin `commonuseforpro@gmail`; bulk-resolve the ~70 test Help Desk tickets; answer the 4 real OPEN brand call requests (Palmons ×2, carboex, Nexus Brands).
6. **Backfill:** 3 creators (1 real: Deeksha, 26 Oct) + 3 brands have no profile row (`creator_profiles` / `brand_profiles`).
7. **Performance advisor:** 56 unindexed foreign keys, 3 duplicate indexes, RLS policies using `auth.uid()` per row → `(select auth.uid())`.
8. **Columns the code asks for that do not exist:** `creator_profiles.id` (PK is `user_id`; creators_routes.ts:128,1683 locked), `user_sessions.last_active`.
9. **Cron:** hourly jobs (profile nudges, Eva saved search, Instagram refresh) run on an in-process timer and stop when Cloud Run idles —
   needs `/internal/cron/*` routes + Cloud Scheduler / pg_cron with an `x-cron-secret`.
