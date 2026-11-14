# ⚠️ PROTECTED CHANGES — READ BEFORE EDITING (for developers and AI tools)

**To any AI assistant (Google AI Studio / Gemini, Copilot, Cursor, Claude, …) and any developer:**
the items below are security, money and data-privacy fixes. Each one closed a real hole.
**Do not remove, weaken, "simplify" or work around them — even if a feature seems easier without
them, even if the user asks for a small UI change nearby.** If a change you are asked to make
seems to require touching one of them, STOP and tell the user instead of changing it.

**Before finishing ANY change, run `npm run verify`** (typecheck + crash guard + all tests).
The tests named below fail when a protection is undone. Never edit or delete a test to make it
pass — a failing test here means the change is wrong, not the test.

| # | Protected rule | Why (what went wrong before) | Where | Guard test |
|---|---|---|---|---|
| 1 | `npm start` = `NODE_ENV=production node dist/server.cjs` | `node server.ts` crashed on Cloud Run → "failed to listen on PORT" | `package.json` | `deployStart.test.ts` |
| 2 | Demo admin login only with `DEMO_LOGIN=true` | It followed payment test mode (ON on run.app) → anyone could GET `/api/admin/bypass` and get an **admin** token | `admin_system_maintenance_routes.ts`, `server.ts` | `session22Audit.test.ts` |
| 3 | No demo data for real users unless `DEMO_SEED=true` | Every new user got fake collabs, invoices, earnings, orders; a real creator was added as applicant to real campaigns | `auth_routes.ts` (`/auth/me`) | `session22Audit.test.ts` |
| 4 | `/auth/sync` stays removed (410) | No login check; anyone could set any account's role (incl. admin) and read its row | `auth_routes.ts` | `session22Audit.test.ts` |
| 5 | No login auto-provision; no bare `user_id` as token; `/auth/session` only for a real session | Any email + any password created a verified account; "admin" in email → admin | `auth_routes.ts`, `server.ts parseAuthUser` | `session20Fixes`, `session21Review` |
| 6 | Onboarding saves `users.role`; creator↔brand switch blocked after onboarding | Brands saw "Only brands can post campaigns"; role could be changed by API | `roleGuards.ts` | `onboardingRole.test.ts` |
| 7 | Contract signing needs a verified email OTP → one-time `sign_token` (server) | Signing screens showed the OTP in a toast / accepted a typed name | `signTokens.ts`, `session_routes.ts`, all `/sign` routes | `phase2`, `session22` |
| 8 | OTP codes, sign tokens, OTP send limit in shared store `ybex_ephemeral` (hashed) | With 2+ Cloud Run instances, verify/sign failed randomly | `ephemeralStore.ts`, `scripts/sql/ybex_ephemeral.sql` | `session22.test.ts` |
| 9 | OTP code is returned to the browser (or logged) **only on a non-production server** — `resolveOtpEcho` (`NODE_ENV !== "production"`, `OTP_ECHO=off` disables). Never tied to payment test mode / run.app (Session 43) | Code visible to whoever asked = no verification; payment test mode is on for every run.app deploy, so the live site prefilled every signup / login / signing code | `otpEcho.ts`, `auth_routes.ts`, `session_routes.ts` | `campaignRoutesAndOtp`, `session43Otp` |
| 10 | Only the deal's two parties sign / accept / counter; compare by **side**, not user id | A stranger could accept someone's counter-offer | `campaignGuards.ts`, deal routes | `campaignIntegrity`, `session21Review` |
| 11 | Escrow cannot be funded before both sides signed (`CONTRACT_NOT_SIGNED`) | Money taken for unsigned deals | `payment_routes.ts`, `escrowService.ts` | `moneyWiring`, `escrowService` |
| 12 | A money claim in the UI must match the server (gross vs net, RELEASED ≠ PAID, no fake %) | Earnings page showed gross as net and a fake "+100%" | earnings pages | `moneyWiring` |
| 13 | UGC cancel = real Razorpay refund, else `PENDING` + `refund_due` admin alert | It said "refunded" with no money moving | `refunds.ts`, `ugcLifecycleService.ts` | `phase2` |
| 14 | UGC slot claim is compare-and-set | Two creators got the same slot → two payouts | `ugcSlots.ts` | `ugcIntegrity` |
| 15 | Sockets: tied to the logged-in user; rooms only for the deal's parties; deal events never `io.emit` to everyone; online status only to contacts | Anyone could read any deal chat live and everyone's notifications | `socketAccess.ts`, `socketServer.ts` | `phase1and3`, `session22` |
| 16 | Admin alerts (new sign-ups' name/email) to admins only | Leaked to every user | `sendNotification`, `emitAdminEvent` | `phase1and3` |
| 17 | Private buckets (`content-submissions`, `live-proofs`, `ugc-assets`, `kyc-documents`) are **never** made public by code; files open only via `/api/media` (15-min signed link, party check) | Clean videos downloadable before approval; server re-publicised the bucket on every start | `mediaAccess.ts`, `media_routes.ts`, `storageHelpers.ts`, `src/lib/mediaUrl.js` | `mediaAccess.test.ts` |
| 18 | Do **not** build `/object/public/content-submissions/...` URLs in the frontend; use `resolveMediaUrl` / `mediaHref` | Bypasses the access check | `VideoEmbedPreview.jsx`, `mediaUrl.js` | `mediaAccess.test.ts` |
| 19 | `/api/admin/run-sql` stays removed | It returned the whole `process.env` (all secret keys) to anyone | `server.ts` | `session20Fixes` |
| 20 | Signed upload URLs only for the deliverable folders | Could upload into any bucket (KYC too) | `misc_routes.ts checkSignedUploadTarget` | `phase1and3` |
| 21 | Every `/admin/*` route checks admin; formerly open routes (landing brands/reviews, bulk-import, collab deliverable, performance record, `/files/:id` for private files) check the caller | Anyone could deface the landing page, insert leads, overwrite deliverables, download KYC files | the route files | `session22Audit.test.ts` |
| 22 | Public creator profile hides email/phone/bank/UPI/PAN/Aadhaar/GST/address | The whole row was public | `profilePrivacy.ts`, `creators_routes.ts` | `session22Audit.test.ts` |
| 23 | No empty `catch {}` — backend uses `logIgnored`, frontend `ignored` | Failures (OTP not sent, lost sessions) vanished without trace | everywhere | `session22.test.ts` |
| 24 | Every `flow_state` token is listed in `statusTokens.ts` (the DB contract) | Unknown states broke cards and payouts | `statusTokens.ts` | `statusTokens.test.ts` |
| 25 | No hard-coded fake orders / fake brands / ₹50,000 placeholders; no competitor names | Fake money records | — | `moneyWiring` |
| 26 | The server always uses the service-role client (`supabase = privilegedSupabase` when the key is set). The browser never reads/writes `users`, `user_sessions`, `transactions`, `files`, `deals`, `*_kyc` directly — it calls the API (`browserDbRoutes.ts`) | Those tables had "anyone may do anything" RLS policies so anon-key calls worked; any browser could read session tokens, KYC, payments, or set its own role to admin | `server.ts`, `browserDbRoutes.ts` | `session22Audit.test.ts` |
| 27 | Profile-table writes from the browser (`brand_profiles`, `creator_profiles`, `creator_portfolio_items`, `creator_social_channels`, notifications "mark read") go through `ownDb` → `POST /api/db/own`; the server forces the caller's own row and drops staff-only columns (verified, kyc_*, rating, featured, role, suspension; `profile_status` only draft/under_review/pending) | RLS on these tables is SELECT-only for the browser; direct upserts failed silently. A direct-write policy would let anyone edit anyone's profile or mark themselves verified | `src/lib/ownDb.js`, `browserDbRoutes.ts` | `ownDb.test.ts`, `session22Audit.test.ts` |
| 28 | Notifications: the browser reads them only via `GET /api/notifications` and gets live ones over our socket (`new_notification` to room `user_<id>`); never `supabase.from('notifications')` or Supabase realtime | The table had to be readable by anyone for the old direct reads/realtime — everyone's notifications were public. Also the server emitted to room `<id>` while sockets join `user_<id>`, so live notifications never arrived | `BrandDashboard.jsx`, `BrandHomeMobile.jsx`, `server.ts` | `session22Audit.test.ts` |
| 29 | Helpdesk: the browser uses only the API for `support_tickets` / `ticket_messages` (`/support/my-tickets`, `/support/tickets/:id/messages` — owner or staff, `/admin/support/tickets`, `PATCH /admin/support/tickets/:id/status` — staff); live refresh by polling, not Supabase realtime | Both tables were open to anyone (read + write); any logged-in user could read any ticket's messages | `support_routes.ts`, `AdminHelpdesk.jsx`, `HelpTickets.jsx`, `AdminAnalytics.jsx` | `session22Audit.test.ts` |
| 30 | Every successful POST/PUT/PATCH on a thread/order action route sends one `thread_updated` to both parties (`threadSync.ts`, mounted with `router.use`). Only state fields travel (`SYNC_FIELDS`), never the enriched record. Clients merge it without touching their own thread `id`, then do one coalesced refresh (`createCoalescedRunner`) | Negotiate / accept-counter and others sent nothing, so the other screen showed old buttons until its 15 s poll; bursts of events caused flicker | `threadSync.ts`, `ChatBox.jsx`, `useChatThreadMobile.js`, `src/lib/chatSync.js` | `session23.test.ts` |
| 31 | Chat messages are shown in time order: the messages endpoint sorts after merging local rows, and both clients sort. Every `chat_messages.message_id` written to Supabase is a UUID | A non-UUID id made the campaign revision insert fail; the card lived only locally and was appended after everything, so it stuck to the bottom of the chat | `chat_routes.ts`, `campaign_lifecycle.ts`, `chatSync.js` | `session23.test.ts` |
| 32 | Login check: parallel requests with one token share one lookup; token → user_id is cached ≤ 5 s; the user row is never cached. Logout deletes the Supabase session row and clears the cache | Each request ran 2 sequential Supabase lookups (×10 per page load). Logout removed the session only locally, so the token kept working | `authLookupCache.ts`, `server.ts`, `auth_routes.ts`, `session_routes.ts` | `session23.test.ts`, `session20Fixes.test.ts` |
| 33 | Mobile chat reads deal state only from `src/components/chat/dealState.js` (a copy of desktop ChatBox's flags) — never its own copy. Escrow payment on mobile uses `processRazorpayPayment` with the same arguments as desktop; the escrow sheet never says "secured" unless funded and never states a fee. A UGC approval (releases payout) asks for confirmation. Negotiation opens the desktop `NegotiationTable` | Mobile's own flags ignored `payment_funded`, kept any old revision open and showed "Sign" during negotiation; "Make payment" opened a sheet that said "Payment secured · fee Free" and paid nothing | `dealState.js`, `ChatBoxMobile.jsx`, `useChatThreadMobile.js`, `MobileEscrowSheet.jsx`, `MobilePayoutCard.jsx` | `mobileChatActions.test.js` |
| 34 | Mobile money screens show only the server's numbers (`gross_amount`, `platform_fee_amount`, `gst_amount`, `creator_net_amount`, real UTR) — no assumed fee %, no sample UTR/ids. Mobile admin payout sends the desktop payload with FULL ids (display ids are truncated) and uses the desktop readiness rules. Mobile UGC: live link sent as `link`/`links`; brand payout release asks first; live-link correction sends `action: reject_live_links` | Mobile invented a 12.5%/5% fee and a sample UTR, sent a 7-char deal id to release-payout, used `liveLink` (server ignores it) and turned link corrections into draft revisions | `AdminPayoutMobile.jsx`, `BrandPaymentsMobile.jsx`, `CreatorEarningsMobile.jsx`, `CreatorUGCMobile.jsx`, `BrandUGCMobile.jsx` | `mobileAudit.test.js` |
| 35 | **Loading states** (section below). Button actions (save, OTP, logout, approve, submit, pay) never call `startLoading()` — they use `useBusy` + `<ButtonSpinner />` in the tapped button. Page data shows `ContentSkeletons` in the content's shape. `GlobalLoader` stays a 2px top bar, non-blocking. The big-wordmark splash is only `ColdStartSplash` (auth loading) | The old full-screen blurred loader blocked the whole app for any fetch or button tap | `useBusy.js`, `ButtonSpinner.jsx`, `ContentSkeletons.jsx`, `GlobalLoader.jsx`, `ColdStartSplash.jsx` | `loadingStates.test.js` |
| 36 | Creator payout destination: `GET/POST /creator/payment-methods` read the shared Supabase table first, validate with `backend/payoutMethods.ts` (exactly one of UPI / bank; bank = 9–18 digit account + IFSC + holder), and the browser only ever gets `account_last4`. Mobile edits it through `PayoutMethodSheet`, desktop through `AddPaymentMethod` | GET read only local `db_mock.json` (lost on restart) and returned the full account number; no screen on desktop or mobile ever showed the add form; switching to UPI kept the old bank fields | `payoutMethods.ts`, `payment_routes.ts`, `PayoutMethodSheet.jsx`, `AddPaymentMethod.jsx`, `Earnings.jsx` | `payoutMethods.test.ts`, `session24Mobile.test.jsx` |
| 37 | Payout request is per deal: `POST /creator/payout-request` checks WHO (deal's creator) and WHEN (approved deal, escrow on record, not already released) via `payoutRequestBlock`. `payout-eligible-deals` returns only unpaid funded deals and only the server's `creator_net_amount` (never a guessed amount or %). Mobile opens `PayoutRequestSheet`; desktop's header button opens the same per-deal request | Anyone could flip any deal's transaction (even RELEASED) to PROCESSING; eligible deals invented ₹5,000 and 85%; mobile "Nudge admin" set state for a desktop-only modal (did nothing); desktop "Request Payout" only showed a toast | `payoutMethods.ts`, `payment_routes.ts`, `PayoutRequestSheet.jsx`, `CreatorEarningsMobile.jsx`, `Earnings.jsx` | `payoutMethods.test.ts`, `session24Mobile.test.jsx` |
| 38 | Mobile notifications (`/creator/notifications`, `/brand/notifications`) render the inbox's `inbox/mobile/NotificationsMobile` (plain text, mark one / mark all read). Taps follow only in-app paths (`notificationTarget`). A failed load shows an error + retry, not "all caught up" | The old screen rendered `<notif.icon />` with no icon set and crashed on the first notification (the server always sends "Welcome"); dead back button; title went through `dangerouslySetInnerHTML` | `notifications/mobile/NotificationsMobile.jsx`, `inbox/mobile/NotificationsMobile.jsx` | `session24Mobile.test.jsx` |
| 39 | Mobile creator can decline a revision (chat card + UGC workspace) with the desktop endpoints/body; only the latest changes card, while the deal waits on it, has buttons. An order-linked support ticket is built by `chat/orderTicket.js` for both desktop `OrderSupportModal` and mobile `MobileOrderSupportSheet`. Mobile UGC "Cancel claim" only on an unsigned reservation (desktop rule) | The mobile decline handler was `() => {}`; mobile support opened the general help page with no order; mobile had no cancel-claim | `useChatThreadMobile.js`, `MobileChangesCard.jsx`, `MobileMessageRow.jsx`, `ChatBoxMobile.jsx`, `CreatorUGCMobile.jsx`, `orderTicket.js` | `session24Mobile.test.jsx` |
| 40 | A UGC brief's payment is "already used" only if a transaction for that order already funds a brief, deal or UGC order (`backend/briefPayment.ts`); the unlinked row written by `/payments/razorpay/verify` is replaced by the brief's row. Brand clients save the paid order (`src/lib/briefPaymentRetry.js`) and a retry posts with it instead of opening a new checkout | verify wrote an unlinked local row first, so every paid brief got 409 "already been used for another brief" — money taken, no brief — and "Secure brief & pay" again charged a second time | `ugc_routes.ts`, `briefPayment.ts`, `briefPaymentRetry.js`, `BrandUGCMobile.jsx`, `BrandUGCPost.jsx` | `briefPayment.test.ts` |
| 41 | **KYC-only UGC claim.** `POST /ugc/orders/claim` asks `backend/creatorKyc.ts` (creator_kyc by `creator_id`, else the newest real `verifications` row — same priority as `/verifications/me`) BEFORE the OTP token is used and a slot is reserved: not approved → 403 `KYC_REQUIRED`, lookup failed → 503 (never let through). Mobile M01 and the desktop contract modal check first and send no OTP to an unverified creator. The campaign-apply gate uses the same helper (`users.verified` is NOT KYC) | The campaign gate read creator_kyc by `user_id` (wrong column), errored and let everyone through; UGC had no KYC check at all | `creatorKyc.ts`, `ugc_routes.ts`, `server.ts`, `CreatorUGCMobile.jsx`, `UGCContractModal.jsx`, `utils/kycStatus.js` | `session24Phase1.test.ts`, `session24Phase1.test.jsx`, `creatorUgcMobileSmoke.test.jsx` |
| 42 | **UGC terms from the brief.** First-draft deadline = brief `delivery_hours` (24/48/72, default 48; old briefs 24) set at claim; every UGC order gets **3 revisions** (`backend/ugcTerms.ts`, `src/utils/ugcTerms.js`). Timers use the order's own window (`orderWindowHours`), texts use the brief's hours — no hard-coded "24h" / "Up to 2" on order, agreement or timer screens. If the `delivery_hours` column is missing, the paid brief is saved without it (`scripts/sql/ugc_delivery_hours.sql`) | Server said 5 revisions, design 2, mobile 3; everything showed 24h | `ugcTerms.ts`, `ugc_routes.ts`, `ugcLifecycleService.ts`, brand post + creator screens | `session24Phase1.test.ts`, `session24Phase1.test.jsx` |
| 43 | **Brief complete = every slot delivered** (`isBriefFullyDelivered`), not "every existing order done" | A 2-slot brief closed after one order ("Completed · 1/2"); the open slot couldn't be claimed and its escrow was stuck. Find old ones: `scripts/sql/OLD_SQL_already_run.sql (find_wrongly_completed_briefs part)` | `ugc_routes.ts` (`/ugc/briefs/my`) | `session24Phase1.test.ts` |
| 44 | **Creator card data is real only.** `GET /creators/:id/ugc-stats` (`backend/creatorStats.ts`): completed orders, on-time % from first drafts (revised orders skipped, expired = late), rating from `reviews` by others; null when nothing to base it on → "New on Ybex", never 0★/0%. Brand claim views show `CreatorClaimStats`; the fake mobile "Accept" (toast only) is gone. No invented ₹2,000/₹5,000 amounts on brand/creator UGC screens | Brand saw only a name; mobile had a button that pretended to assign a creator | `creatorStats.ts`, `CreatorClaimStats.jsx`, `BrandInstantUGC.jsx`, `BrandUGCMobile.jsx` | `session24Phase1.test.ts`, `brandUgcMobileSmoke.test.jsx` |
| 45 | **Referral code = `YBEX-` + first 8 id chars** (`src/utils/referral.js`), which signup matches; reward amount only from the server (`referral/stats`). Notification read/ack only for the owner, with a safe id | Every Refer screen built a code the server never matched (no referral ever recorded) and showed an assumed ₹500/₹1,000; anyone could mark any notification read | `referral.js`, `auth_routes.ts`, Refer screens, `tags_notifications_routes.ts` | `session24Phase1.test.ts`, `session24Phase1.test.jsx` |
| 46 | **Brand explainer + designed creator card (Claude Design).** `BriefSafetyExplainer` opens once per brand (localStorage, per user) when the post flow opens (mobile `view === "post"`, desktop `/brand/ugc/post`) and reopens from "How it works". User-facing name for escrow is **Ybex SafePay**; point 4 is the refund promise ("100% refundable … after the first 24 hours") — the cancel/refund build must keep it true. `CreatorCard` (compact / mobile / expanded) is the only claimed-creator view on brand screens (claims modal, claims sheet, both order pages), fed by rule 44's real data | Brands fear not getting money back and don't know "escrow"; the old rows showed only a name | `BriefSafetyExplainer.jsx`, `CreatorCard.jsx`, `BrandUGCMobile.jsx`, `BrandUGCPost.jsx`, `BrandInstantUGC.jsx`, `BrandUGCOrders.jsx` | `session24Design.test.jsx`, `brandUgcMobileSmoke.test.jsx` |
| 47 | **UGC deadline reminders, auto-relist and brand cancel & refund.** Protected cron `POST /api/internal/cron/ugc-deadlines` (guarded with `x-cron-secret`) enforces internal deadlines: sends creator reminders (6h after claim, every 3h, max 6, quiet hours 10pm-8am IST), alerts admin 3h before deadline, auto-expires missed orders (`status: EXPIRED`), relists brief with explore priority (`is_priority: true`), blocks creator from re-claiming expired briefs. Brand can cancel unused brief slots 24h after posting (`POST /ugc/briefs/:id/cancel`) to request refund to verified UPI/bank account (`ugc_refunds`), processed manually by admin with mandatory UTR (`POST /admin/ugc-refunds/:id/process`) | Creators kept briefs hostage without submitting; missing deadline had no consequences; no brand cancellation or tracked refund mechanism | `ugcDeadlineService.ts`, `ugc_routes.ts`, `ugcRefundAccounts.ts`, `BrandUGCBriefs.jsx`, `BrandUGCMobile.jsx`, `CreatorUGCBrowse.jsx`, `CreatorUGCMobile.jsx`, `Admin.jsx` | `ugcDeadlinesRelistRefund.test.ts` |
| 48 | **No admin backdoors; hardened login.** No master password, no seeded admin accounts, no Supabase-Auth login fallback, no plain-text password store (`user_plain_passwords` is wiped on load). Session tokens are 32 random bytes; email lookup is an exact case-insensitive match; 8 wrong passwords → 15-min lock (`backend/authSecurity.ts`); legacy plain/"mock_hash_" passwords are upgraded to bcrypt on first login; every `/api` answer is scrubbed of password fields. Admin passwords are set in Supabase with `crypt(...)` (bcrypt) | v204 accepted `123456789` for any admin email (listed in the source), created six admins with that password on every start, and let any Supabase Auth account log in as the app user with that email | `auth_routes.ts`, `authSecurity.ts`, `server.ts`, `db_mock.json`, admin user routes, `UserEnforcementPanel.jsx` | `session24Review.test.ts` |
| 49 | **Deadline / refund system review.** Expiry only while the order still waits for a first draft (`PRE_DRAFT_STATUSES`, no `video_url`); quiet-hours reminders are deferred, not counted; an expired slot on a cancelled brief is queued for refund (never stuck); cancel = one server quote (`/ugc/briefs/:id/cancel-quote`) + per-brief lock + refund row saved before a conditional brief update (rolled back on conflict); admin "refunded" only for PENDING with a real account and a UTR; a FAILED refund re-queues when the brand saves a new account; `/market-intelligence/*` needs sign-in (search/audit admin-only) | Gemini's build could expire a just-submitted order, lose night reminders, write two refunds on a double tap, keep refunds only in the local file, and strand an expired slot's money on a cancelled brief | `services/ugcDeadlineService.ts`, `ugc_routes.ts`, `CancelBriefModal.jsx`, `BriefRefundStatus.jsx`, `AdminUgcRefundsTab.jsx`, `market_intelligence_routes.ts` | `session24Review.test.ts`, `brandRefund.test.jsx`, `ugcDeadlinesRelistRefund.test.ts` |
| 50 | **Strict: claim = OTP signature, timer starts at signing** (Ravi). The only way a creator gets a UGC order is the claim flow (KYC → agreement → OTP) which sets `agreement_signed_creator` and `internal_deadline` in the same step. The legacy `/ugc-orders/:id/accept` refuses creators (`CLAIM_WITH_SIGNATURE`); signing an old unsigned reservation (`/ugc/orders/:id/sign`) checks KYC and starts the timer at that moment | The legacy accept path gave creators an order marked "signed" with no OTP, no KYC check and no deadline; the old sign route never started a timer | `ugc_routes.ts`, `UgcOrders.jsx`, `CreatorUGCMobile.jsx` | `session24Review.test.ts` |
| 51 | **Creator self-cancel = no refund, relist** (Ravi, session 25). Only the order's creator, only before the first draft, one of the 4 reason chips ("Other" needs a note). Guarded update (`PRE_DRAFT_STATUSES`, `video_url` null). Order `CANCELLED` with `expiry_reason` `CREATOR_CANCELLED` (counts like a missed deadline) / `CREATOR_CANCELLED_GRACE` (within 1h of the timer start) / `CREATOR_CANCELLED_UNSIGNED` (never signed) — none of them may re-claim the brief. The money stays in the brief; the slot is relisted at the top (or queued for refund if the brief is already cancelled). Brand gets in-app + email; the creator's reason is only in the admin log | A creator cancel ran the brand-refund path: the brand was auto-refunded through Razorpay for the creator's choice and the slot reopened with no money behind it | `services/ugcDeadlineService.ts` (`cancelUgcOrderByCreator`), `ugc_routes.ts`, `creatorStats.ts`, `statusTokens.ts`, `CreatorCancelOrderSheet.jsx`, `CreatorUGCMobile.jsx`, `ManageUGCOrdersView.jsx` | `creatorSelfCancel.test.ts`, `orderCancel.test.jsx` |
| 52 | **Brand cancels ONE order: 24h wait, no draft, no fee, manual refund** (Ravi, session 25). Refused in the first 24h after the creator's timer started (`CANCEL_WITHIN_24H`) and whenever a draft exists (`DELIVERED_USE_DISPUTE`). After 24h with no draft: refund row (`ugcref_ord_<order>`, one per order) saved first, then the guarded order update (rolled back if a draft landed); `expiry_reason` `BRAND_CANCELLED` never counts against the creator and doesn't block them; the slot leaves the brief; money → Admin → UGC Refunds (never Razorpay). A saved refund account is required. A cancellation fee (for work already done) is Phase 2 | The old route refunded through Razorpay at any time, even minutes after the claim, and never touched the brief | `services/ugcDeadlineService.ts` (`cancelUgcOrderByBrand`), `ugc_routes.ts`, `BrandCancelOrderModal.jsx`, `BrandUGCOrders.jsx`, `BrandUGCMobile.jsx` | `creatorSelfCancel.test.ts`, `ugcIntegrity.test.ts`, `orderCancel.test.jsx` |
| 53 | **Admin accounts & staff roles** (session 25). `parseAuthUser` wraps `parseAuthUserRaw` with `neutralizeStaffTeamRole`: a `team_role` of `sub_admin`/`super_admin`/`owner` only counts on an `admin`/`sub_admin` account. Only a full admin (`isFullAdmin`) creates admin accounts or changes team roles; new passwords are bcrypt and must pass `newPasswordProblem` (10+ chars, letters + numbers, no 123456789); brand team members can't get a staff team role. A Supabase RLS refusal is reported as "service key missing" (`SERVICE_KEY_MISSING`); `/api/health` shows `supabase_service_role`. Admin FAQ writes go through `/admin/faq` | Create-user stored `mock_hash_<password>` (plain text), a sub-admin could create a Super Admin, and a brand could name a team member "sub_admin" to open ~57 admin checks; the FAQ page wrote the table from the browser | `server.ts`, `authSecurity.ts`, `admin_users_enforcement_routes.ts`, `brands_routes.ts`, `admin_content_routes.ts`, `AdminFAQManager.jsx` | `session25Security.test.ts` |
| 54 | **Direct brand invitation = a normal campaign deal with a different start** (Ravi, session 26). Brand invites from the creator profile with a real fee (₹3,000+, `INVITE_AMOUNT_REQUIRED`); the invite waits as `pending_creator_acceptance`, no chat. Only the invited creator accepts or declines (`isInvitedCreator`), only while pending (`INVITE_CLOSED`); double accept returns the same chat. Accept ALWAYS creates a NEW `deals` row + `thread_camp_<dealId>` thread (never re-uses or rewrites an older thread between the same two people) with `agreed_amount` = the brand's fee, then two messages: an automatic creator thank-you (`text`, `metadata.automated`) and the brand's `brand_invitation_offer` card, whose Accept / Negotiate belong to the CREATOR. From there it is the campaign flow: Accept opens the contract (desktop ContractModal, mobile contract sheet — also for `creator_application_offer`, whose mobile Accept used to hit `brand-accept-counter` and 409). No text is written in anyone's name beyond that greeting; no invented fee/days/revisions on the cards. Invites are stored in Supabase `brief_requests` (server-only: RLS on, no policies, anon/authenticated revoked — never add a browser policy), always with an explicit `status` (the column default is `NEW`); accept/decline are guarded updates on the stored status, so two taps or two instances open one deal; a stale `accepting` (>2 min) counts as pending. Login returns `SERVICE_KEY_MISSING` / `LOGIN_LOOKUP_FAILED` (v211, re-applied). | Invite re-used the old chat and reset a finished deal to NEGOTIATING; a note the creator never wrote; brand had to "accept" its own offer; no deal row behind the chat | `backend/directInvites.ts`, `creators_routes.ts`, `ShortlistCards.jsx`, `MobileShortlistCards.jsx`, `MobileMessageRow.jsx` | `session26Invites.test.ts` |
| 55 | **UGC brief post never sticks on "Processing…"** (Ravi, session 26). `POST /ugc/briefs` is idempotent per paid Razorpay order: the brief stores `razorpay_order_id`, and a repeat post by the same brand returns that brief (`already_posted`), another brand gets `PAYMENT_ALREADY_USED`. Desktop + mobile post screens watch the paid order (`watchPaidOrder` via `onOrderCreated`) in case the checkout callback never arrives, post once (`postingRef`), and the desktop page leaves for My Briefs with a hard-redirect fallback (`goToPostedBriefs`). | Payment succeeded and the brief went live, but the page stayed on "Processing…" until a manual refresh | `backend/ugc_routes.ts`, `src/lib/briefPaymentRetry.js`, `src/lib/razorpay.js`, `BrandUGCPost.jsx`, `BrandUGCMobile.jsx` | `src/lib/briefPaymentRetry.test.js` |
| 56 | **Two ways to delete an account** (Ravi, session 27). Admin panel → Delete: **Normal delete** = `POST /admin/users/:id/delete`, soft delete to the bin, restorable, for accounts closed for a user's mistakes. **Complete wipe out** = `POST /admin/users/:id/wipe` (`backend/admin_wipe_routes.ts` + `backend/accountWipe.ts`): WHO = full admin only (not sub-admin), re-enters their own password (bcrypt, 5 tries / 15 min), never self. **v288 (Ravi, session 43): admin and sub-admin accounts can be binned / wiped too — only by a full admin, never yourself, never the last full admin (`backend/adminTargetGuard.ts`); a wipe also removes their `admin_permissions`. The normal delete now applies the same admin-target rule (before, any sub-admin could bin a full admin).** Money in escrow does NOT block it (Ravi: testing tool) — the admin confirms once (`force: true`, `WIPE_HAS_ACTIVE_MONEY`) and the log records it. Removes user, profiles, campaigns, applications, deals, chats + messages, invites, UGC briefs/orders, notifications, KYC, sessions, violations, waitlist and the Supabase Auth user — same email can sign up fresh. `transactions` are KEPT, name/email blanked. Service-role client only (`SERVICE_KEY_MISSING`). Every wipe is logged (`wipe_user`). Applies to brands, agencies, creators and unclaimed creators. | Only a soft delete existed: the same email could never sign up again and nothing removed the user's campaigns and chats. Never: without the password, by a sub-admin, with money in escrow without the admin's confirmation, or deleting `transactions`. | `backend/admin_wipe_routes.ts`, `backend/accountWipe.ts`, `backend/admin_campaigns_settings_routes.ts`, `src/components/admin/DeleteAccountPanel.jsx` | `backend/session27.test.ts` |
| 57 | **Contract signing email + chat reads** (session 27). The signing code goes to the email the server picks (`GET /api/contract/signing-email`, `backend/signingEmail.ts`): a brand's verified POC business email from Settings, else the login email. `/otp/send` checks it against Supabase profile rows. Signing NEVER changes the login email. `GET /chat/v2/threads/:id` and `/messages` answer only the two parties (brand team via `parent_brand_id`) and admins (`NOT_A_PARTICIPANT`). Explore Creators reads `GET /creators/explore` (public fields only, `data:` photos dropped, 1-min cache), not the browser Supabase client. | The contract used the login email, not the verified POC email; signing a contract overwrote the login email; any logged-in user could read any chat by id; Explore read every column of every creator from the browser and broke. | `backend/signingEmail.ts`, `backend/session_routes.ts`, `backend/chat_routes.ts`, `backend/creators_routes.ts`, `ContractModal.jsx`, `MobileContractSheet.jsx`, `Explore.jsx` | `backend/session27.test.ts` |
| 58 | **Admin panel + landing show only real data** (Ravi, session 27). Admin server reads use the service-role client (anon reads are revoked). No invented numbers or claims: no "100% funded", fee %, AI accuracy, stock photos as avatars/thumbnails, default rates, default testimonials or brand logos, or made-up campaign banners. A dispute decision queues the money (`refund_status` / `payout_status` = `PENDING`) — it never marks a refund or payout as done. Performance metrics return stored numbers only (`available: false` otherwise); the chart shows "No performance data recorded yet." Not-built features say "Not built yet". | The admin dashboard showed fixed badges and 0s (anon reads), disputes marked refunds as PROCESSED with no money sent, waitlist approval saved a stock photo and ₹2,500 rate, the landing showed Nike/Puma/Adidas and a fake review, the creator dashboard showed fake brand campaigns, the metrics chart was random. | `backend/admin_*_routes.ts`, `backend/admin_content_routes.ts`, `backend/market_intelligence_routes.ts`, `AdminAnalytics.jsx`, `CampaignReviewQueue.jsx`, `InfluencerMetricsChart.jsx`, `BrandGridSection.jsx`, `CreatorDashboard.jsx` | `backend/session27.test.ts` |
| 59 | **Brand KYC has one answer; drafts belong to one user; pages refresh live** (Ravi, session 28). Campaign publish and Launch-draft use `getBrandKycStatus` — same order as `GET /verifications/me` (brand_kyc, else the newest real verifications row); a failed lookup answers 503 `KYC_CHECK_FAILED`. Browser drafts go through `src/lib/userDraft.js` (key `<name>::<user_id>`); never read `campaign_draft` / `ugc_draft` directly. Live pages use `useLiveRefresh`: NotificationPopup re-announces every socket notification as `ybex:live`; pages reload silently on a matching notification, on focus and on a slow backup timer | The dashboard said "Approved Partner" while Launch said "complete your KYC" (gate read brand_kyc only); a draft saved on one brand showed on another brand in the same browser; KYC approval and new applicants needed a page refresh | `backend/creatorKyc.ts`, `backend/campaigns_routes.ts`, `src/lib/userDraft.js`, `src/lib/liveRefresh.js`, `NotificationPopup.jsx`, `AuthContext.jsx`, campaign / dashboard pages | `backend/session28.test.ts` |
| 60 | **Campaign, UGC and Invite-to-campaign are locked** (Ravi, session 28: all three tested working on the deployed build; launch is close; mobile UI work next). Logic files are frozen by content hash; screen files of these flows may be redesigned but must make exactly the same server calls. Unlock only with Ravi's written OK via `npm run protect:update -- --reason "..."` (logged in `docs/code/PROTECTED_CHANGES.md`) | Before launch an AI edit to UI could silently change backend or deal logic, and Ravi would have to retest every flow | `scripts/protectedFlows.mjs`, `scripts/protected/manifest.json`, `docs/code/PROTECTED_CHANGES.md`, `GEMINI.md`, `AGENTS.md` | `backend/protectedFlows.test.ts` |
| 61 | **Every OTP signature leaves a permanent record** (Ravi, session 28). All four sign routes (campaign chat, `/deals/:id/sign`, UGC claim, UGC order sign) call `recordAgreementSignature` (`backend/agreementRecord.ts`) after the OTP check: the text the screen showed (`agreement_text` + `agreement_version` from `src/lib/agreementCapture.js`), sha256, signer, role, acting brand, OTP email + verified time (`noteSignEmail` → `consumeSignToken` → `takeLastSignMeta`), IP, device, amount, ids. Table `agreement_signatures` (Supabase): server-only, no edits, no deletes/truncate except rpc `wipe_agreement_signatures` (Complete wipe out), hash and OTP enforced by CHECKs. Recording never blocks a signature; a failed write logs `[agreement-record] FAILED`. Missing text → `|text-not-captured`; amount not in text → `|amount-not-in-text` | Signing saved only a flag + time — no proof of which text was agreed, by which email, from where | `backend/agreementRecord.ts`, `backend/signTokens.ts`, sign routes, `backend/admin_agreements_routes.ts`, `backend/admin_wipe_routes.ts`, contract screens, `AdminSignedContractModal.jsx` | `backend/agreementRecord.test.ts` |
| 62 | **Overlays render in `<body>` and lock the page** (session 29). Modals and drawers use `ModalPortal` + `useScrollLock` (`src/components/common/ModalPortal.jsx`, `src/lib/useScrollLock.js`). A parent with a CSS transform traps `fixed` children; `PullToRefresh` must keep `transform: none` at rest. | `backend/session29.test.ts` |
| 63 | **Creator dashboard numbers come from `GET /dashboard/creator`** (session 29, `backend/creatorDashboard.ts`). Earnings use the Earnings-page rules (released vs in escrow, creator net). No invented trends, sparklines, match %, budgets, names or photos on the dashboard; missing data is shown as missing. Active deals never list completed work. The dashboard must not call the public profile route (it counts a view). | `backend/session29.test.ts` |
| 64 | **Photos are stored small** (session 31, `backend/imageResize.ts`). Every image going to `avatars`, `brand-logos`, `profile-assets` (≤512 px), `cover-images` (≤1200 px) or `banners` is turned into WebP on the server (`/upload` and `processBase64Image`); screens that upload straight to Storage use `src/lib/shrinkImage.js`. Banner pictures live in the `banners` bucket, never as base64 in `banners.image_url`. | `backend/session31.test.ts` |
| 65 | **Landing reviews are only admin-added** (session 31). No built-in or fallback reviews; no reviews → the section is hidden. A failed review save/delete answers with an error — never a silent save to server memory. Each review has a 1–5 `rating`. | `backend/session31.test.ts` |
| 66 | **One socket.io connection per tab** for bell, popup, inbox, dashboards and chat list (`src/lib/sharedSocket.js`: `acquireSocket(userId)` → `lease.on/onConnect/emit/release`). Never `io(...)` in a new component. The open chat thread (locked) still has its own. | `backend/session31.test.ts`, `src/lib/sharedSocket.test.js` |
| 67 | **Match % on the creator profile is computed, never random** (`src/lib/creatorMatch.js`): Category 40 · Platform 20 · Budget 25 · Location 15 from the viewing brand's own profile + campaigns; a part without data is left out; no data → no %. | `src/lib/creatorMatch.test.js` |
| 68 | **Signup / email OTP is Supabase-only and hashed** (session 33). Signup, verify-email and resend need the service key (else 503 `SERVICE_KEY_MISSING`), look the email up duplicate-safe (`findUserByEmail`), never create a local-file-only account, store only `otp_hash` (no `plain_otp`), fail with `OTP_SAVE_FAILED` if the code is not in Supabase (another Cloud Run instance must be able to verify it), and return the code to the browser only in test mode. An anon/publishable key in `SUPABASE_SERVICE_ROLE_KEY` is rejected at startup (`serviceKeyProblem`). | Gemini v235 fallback made accounts that vanished on deploy and saved plain OTPs; verify failed on other instances | `backend/auth_routes.ts`, `backend/authSecurity.ts`, `backend/server.ts`, `Signup.jsx` | `backend/session33Auth.test.ts` |
| 69 | **Explore on mobile is its own screen** (`src/components/explore/mobile/ExploreMobile.jsx`, design EX-01/02/03/05), not the desktop page squeezed. Same calls as desktop: `GET /creators/explore`, `GET /campaigns?mine=true` (own campaigns only), `POST /creators/:id/send-brief` with `message` (the server requires it). Invite pickers never list other brands' campaigns. | Mobile showed the desktop page; multi-invite never sent `message` (every invite 400); the picker listed every brand's live campaigns | `ExploreMobile.jsx`, `Explore.jsx` | `exploreMobile.test.jsx` |
| 70 | **Onboarding progress lives on the server** (`POST`/`GET /onboarding/progress`, `backend/onboardingProgress.ts`, table `onboarding_progress` — `scripts/sql/OLD_SQL_already_run.sql (onboarding_progress part)`). Every step saves answers + `page` (shared step name) + `pos` (this flow's own screen); resume = same flow → same screen, other device → that page's screen (`src/lib/onboardingProgress.js`). Popups (OTP, Instagram details, add-channel) are not reopened. Not device storage. Basic details first (creator: name, Instagram handle, mobile if sign-up had none; brand: company name → account manager with designation + mobile). After the basics every screen shows "Saved ✓" + **Finish later** (sheet + Log out) instead of "Save & exit". A missing phone is saved to `users.phone` only when the account has none. The onboarding gate itself is unchanged — except (session 39, Ravi) a creator who tapped **Finish later** after the basics may use the app (`src/lib/onboardingLater.js`, App.jsx ProtectedRoute); Home's "Complete your profile" brings them back to the same step. | Creator mobile restarted at screen 1 every time; brand saved nothing before Publish; progress only on one browser | `onboardingProgress.ts`, `onboardingProgress.js`, `FinishLater.jsx`, the 4 onboarding flows | `backend/onboardingProgress.test.ts`, `src/lib/onboardingProgress.test.jsx` |
| 71 | **Brand desktop "Important for you"** = the creator card (`ImportantForYou.jsx`) fed by `src/lib/brandTasks.js`, real tasks only, in Ravi's order: content to review (UGC `SUBMITTED`/`PROOF_SUBMITTED`, campaign threads `SUBMITTED`/`PROOF_SUBMITTED`) → deal room brand's turn (creator counter only when the last message is the creator's `negotiation_offer`; sign; fund escrow) → pending applicants per campaign → KYC → company profile → "Post a campaign" / "Explore creators". No always-on promo tasks. Desktop only. | Always-on "Pre-fund campaign escrow" / "Need Custom Social Ads?" | `BrandDashboard.jsx`, `brandTasks.js`, `/brands/me/application-stats` (+ campaign_id, status) | `src/lib/brandTasks.test.js` |
| 72 | **Public creator application = waitlist only** (`backend/creatorApplication.ts`). Submit saves a Pending `waitlist` row (real save, else an error — never a fake "submitted"); it never creates or changes a creator profile or an existing account. Required: photo, name, gender, email, mobile, Instagram handle, city, followers, avg reach, price for 1 UGC video, niche. Numbers use ONE rule on form and server (`parseCount`: 1.5L = 1,50,000). No spam limit on purpose (ads; team checks by hand). Admin approve (single + batch, shared `approveCreatorApplication`) = exactly ONE unclaimed profile per email, a real account with that email is never touched; metrics from the applicant's own followers/reach (same formula as registered creators). Approve / reject (reason required) email the creator. Only admins edit applications. | Profile went live on submit with fake stats; duplicates on approve; an applicant's email could overwrite a real profile; 1.5L saved as 15; fake success | `creatorApplication.ts`, `misc_routes.ts`, `admin_waitlist_routes.ts`, `PublicCreatorApply.jsx`, `applyMobile/*` | `creatorApplication.test.ts`, `creatorFormValidation.test.js`, `applyMobile.test.jsx` |
| 73 | **Legal text lives in ONE file** — `src/lib/legal/legalContent.js` (public Terms, Privacy, Refunds; in-app cards: common + creator + brand). Public pages: `/info/terms`, `/privacy-policy`, `/info/refunds` (+ `/terms`, `/privacy`, `/refunds` redirects); role pages `/info/creator-terms`, `/info/brand-terms` linked from the app only. Settings → Privacy & Terms (4 surfaces) = `components/legal/LegalPanel.jsx`. Never write a claim the app does not do (no auto-approval until built, no "zero commission" for creators, no made-up GSTIN, no "escrow" wording). | Signup linked to pages that did not exist; settings claimed "Zero markup" / "GDPR" while a fee is deducted; fake GSTIN on admin invoice | `legalContent.js`, `LegalSections.jsx`, `LegalPanel.jsx`, `InfoHub.jsx`, `PrivacyPolicy.jsx` | `src/lib/legal/legal.test.js` |
| 74 | **Consent is recorded** in `user_consents` (`backend/consents.ts`, `scripts/sql/OLD_SQL_already_run.sql (user_consents part)`): signup (ONE required box: Terms + Privacy, which cover campaign / account / Ybex update emails — Ravi: no separate updates box), last onboarding step (Terms + Privacy + Creator/Brand Terms, required box, all 4 flows), settings "Offers and promotions" switch (default off). Recording never blocks signup. Consent lines: signup, Google button, apply form, onboarding last step, above every Brand Pay button (`PayConsentLine`), OTP signing. 18+ on mobile onboarding too (`src/lib/age.js`). | Tick boxes proved nothing; mobile let under-18s through | `consents.ts`, `TermsAgreeBox.jsx`, `PayConsentLine.jsx`, `Signup.jsx` | `consents.test.ts`, `legal.test.js` |
| 75 | **KYC without Aadhaar** — creators: PAN + bank or UPI; brands: one registered business document (GSTIN or PAN). The server ignores Aadhaar fields; old values are cleared with `scripts/sql/OLD_SQL_already_run.sql (purge_aadhaar part)`. Receipts say "Payment receipt" and show no GSTIN until Admin turns on GST registered (`usePlatformTax`). | Aadhaar was stored; tax-invoice wording without GST registration | `creators_routes.ts`, `CreatorSettings.jsx`, `InvoiceModal.jsx`, `EscrowDashboard.jsx`, `invoicePdf.js` | `legal.test.js` |
| 77 | **One motion system** (Session 37): every animation setting lives in `src/lib/motion.js` (open ≈ 0.22 s, close ≈ 0.16 s, no bounce); popups use `Presence` + `PopupBackdrop` + `PopupPanel` from `src/components/common/Popup.jsx` (phone = bottom sheet with drag-down to close, desktop = small fade/scale, `{x && <Popup/>}` sits inside `<Presence>` so it can close smoothly); route change never waits for the old page (mobile: deeper page from the right, back from the left, tabs fade); `MotionConfig reducedMotion="user"`; framer-motion only (no GSAP); `tw-animate-css` makes `animate-in` / `fade-in` classes work. No infinite loops on app screens. | Animations were half dead (Tailwind v4 classes), popups vanished on close, 0.7 s wait on every page change, two libraries | `motion.js`, `Popup.jsx`, `App.jsx`, `index.css` | `src/lib/motion.test.js` |
| 78 | **Admin money + permissions** (Session 38). Money rules live in `backend/adminMoney.ts`: release-payout refuses an already-paid or refunded payment; admin refund refuses an unknown payment, more than was paid, a paid-out deal, or a second refund; "Escrow secured" counts only `isEscrowHeld` (paid in, not paid out, not refunded); payout requests = `payout_status PROCESSING` or `payout_requested`. The payout modal reads the creator's saved method (`creator_payment_methods`) first. Admin lists read every page (`fetchAllRows`, Supabase stops at 1000). One gate (`backend/adminPermissions.ts`, before all routes) limits sub-admins to the areas ticked in Permissions; unmapped admin writes are super-admin only. Markup %s live on `platform_fee_config` (`backend/platformSettings.ts`, `session38.sql`). KYC approve changes only that request and reports save errors. No seed/demo data in a fresh store; shipped `db_mock.json` is empty | Double payouts possible, refunds without limits, paid-out money shown as escrow, saved UPI invisible to admin, sub-admins with full power, fake AI switch, demo users/violations on every new instance | `adminMoney.ts`, `adminPermissions.ts`, `platformSettings.ts`, `payment_routes.ts`, `admin_system_maintenance_routes.ts`, `admin_kyc_verification_routes.ts`, `server.ts`, `AdminAnalytics.jsx`, `EscrowDashboard.jsx` | `backend/session38Admin.test.ts` |
| 79 | **Moderation, pitches, referrals in Supabase; payout after approval; generated numbers for creators only** (Session 38 part 2). Blocked / profanity-flagged chat messages are rows in `chat_moderation_events` (`backend/chatModeration.ts`); Admin Chat + Reports read and resolve them there. Pitch Leads read `brief_requests` from Supabase (`backend/pitchLeads.ts`); admin status/notes go to `pitch_lead_admin` — never write `brief_requests.status` (locked invite flow). Referral activity uses `referralData().allReferrals()`. Payout request / chat nudge only at deal status COMPLETED or APPROVED (`PAYOUT_READY_DEAL_STATUSES`). Generated campaign views / applied / faces (`utils/campaignStats.js`) are shown to creators only; brands, agencies and admins get `utils/campaignStatsForViewer.js` (real counts, real photos, no views number unless tracked) | Moderation and pitches lived in one instance's file and vanished on deploy; creators could ask for money before approval; brands saw made-up numbers on their own campaigns | `chatModeration.ts`, `pitchLeads.ts`, `chat_routes.ts`, `admin_pitch_leads_routes.ts`, `payoutMethods.ts`, `payment_routes.ts`, `campaignStatsForViewer.js`, `BrandHomeMobile.jsx`, `Campaigns.jsx`, `CampaignDetail.jsx` | `backend/session38Part2.test.ts` |
| 80 | **Creator mobile shell (session 39, Ravi)** — bottom bar only on the 5 main pages (Home, Campaigns, Explore UGC, Inbox list, Profile hub: `isCreatorNavPage` in `src/lib/bottomNavVisibility.js`); inner screens drawn inside one route call `useHideBottomNav(true)`; pages without the bar carry a back arrow (`MobileBackButton`). Every new page starts at the top (Layout resets `#app-scroll-container`). No desktop-era "Good afternoon" header for creators. Keyboard never covers the field being typed in (`src/lib/keyboardAware.js` + `--kb` CSS; sheets lift via `data-sheet`). No decorative sparkle icons / ✨ emojis anywhere (Ravi: "AI generated lagta hai"). App font = DM Sans everywhere (logo excepted). No invented numbers in UI copy (140%, 3x, "25000 followers"…). | Nav on every page, pages opened half-scrolled, keyboard hiding inputs | `Layout.jsx`, `BottomNav.jsx`, `bottomNavVisibility.js`, `keyboardAware.js` | `earningsMobileNoCrash.test.jsx` |
| 81 | **Hooks before early returns.** A component never returns (loading skeleton, `if (!x) return null`) before all its hooks have run — that crashed mobile Earnings and could crash mobile chat (session 39 scan: 0 left). | "This page didn't load" | — | `earningsMobileNoCrash.test.jsx` |
| 82 | **Creator Home picks + referral share (session 39, Ravi).** "Creators like you" and the onboarding photo-step faces = only creators ticked in Admin → Users → "Show on home" (max 4, `creator_profiles.show_on_creator_home`, `backend/creatorHomePicks.ts`). Referral cash share = **0.2% of what the invited friend received after the Ybex fee**, capped ₹2,000 per friend (`share_pct_of_earnings`), paid by Ybex; UI shows only "You also get a share of what your friend earns" and only the referrer's own earnings. "Zero commission · you keep 100%" line on creator Home stays (Ravi's decision C, risk explained once). | — | `creatorHomePicks.ts`, `referralProgram.ts` | `referralProgram.test.ts` |
| 83 | **Audience estimate (session 40, Ravi option B).** "Authentic audience" and "Performance score" are an ESTIMATE from the creator's own likes / comments / reach against typical levels for the account size — one helper for server and screens (`src/utils/audienceEstimate.ts`). Always labelled "Estimate" with "Based on the creator's own numbers, not verified"; missing numbers → "Not enough data" (DB null). Never a default (94, 95, 5.4%, 4.8%) and never followers-only maths. | `fake = 3.5 + followers mod 120`, score 94 on an empty profile | `creators_routes.ts` 🔒, `creatorApplication.ts`, `misc_routes.ts` leaderboard, `AudienceEstimate.jsx` | `session40Helpers.test.js` |
| 84 | **Admin roles + KYC files (session 40).** Role change goes through `backend/adminRoleChange.ts`: Super Admin → role admin/team admin; Sub-Admin → role admin/team sub_admin; Standard → the account's own role (brand/agency/creator from its profile), team null, module list cleared; no profile → refused. Only a Super Admin edits roles or module permissions; a failed save is an error. Admin KYC previews open through `/api/media` (`mediaHref`), never the 7-day link saved at upload. | "Standard User" left role=admin (still full admin); sub-admin could grant itself modules; blank PAN previews | `admin_users_enforcement_routes.ts`, `KYCManager.jsx`, `UserEnforcementPanel.jsx` | `session40Fixes.test.ts` |
| 85 | **Phone shell (session 40).** Marketing footer (`PremiumFooter`): back on phones in session 41 (rule 86); never in chat / inbox. The open chat is a fixed box the size of the visible screen (`--vvh`/`--vvtop`, `keyboardAware.js`), so its message box sits on the keyboard; `kb-open` = a field is focused and the visible area is clearly shorter than the screen, and it hides the bottom tab bar. Live links must be a post / reel / video (`src/utils/liveLinkCheck.js`). No `const x = x …` anywhere (test). | Half-open chat, footer behind Apply bar, tab bar on top of the keyboard | `InboxMobile.jsx`, `PremiumFooter.jsx`, `index.css`, `keyboardAware.js` | `keyboardAware.test.js`, `session40Fixes.test.ts` |
| 86 | **Session 41 phone rules.** Footer shows on phones too; a page with its own fixed bottom bar passes `clearBottomBar`. A bottom sheet on a long page uses `MobileSheet fixed` (absolute sheets stick to the page bottom). Page change = fade only (a transform on the page wrapper makes fixed bars jump); no backdrop blur on touch screens. | Sheet half-way down the page, footer under the sheet, jittery popups | `PremiumFooter.jsx`, `MobileSheet.jsx`, `lib/motion.js`, `index.css` | — |
| 87 | **Every link and every API call must exist.** In-app links must match a `<Route>`; every fixed `api.*("…")` must match a server route. | 404 "page doesn't exist" (UGC Chat with Brand), brand logo never loading (`GET /brands/profile` does not exist) | `App.jsx` | `src/utils/session41Links.test.js`, `backend/session41ApiRoutes.test.ts` |
| 88 | **Status words are earned.** Brand "APPROVED" only when the admin approved the KYC; submitted = "Under review". Brand KYC `documents` may be an array with one object — unwrap it. No demo values in live screens (no default city / date / terms / pitch). | "APPROVED" with KYC still in review, every KYC field "Not provided", every applicant in "Mumbai" | `BrandHomeMobile.jsx`, `BrandProfileMobile.jsx`, `misc_routes.ts`, `CampaignDetail.jsx` | `brandKycMobile.test.jsx` |
| 89 | **Quick action + What's new popups.** Quick action (phone): invites (creator), applications (brand) and deals where the inbox chip says it's your turn; it reuses the exact calls of the invite modal / applicants page and the inbox chip logic — no new endpoints. What's new: admin writes + publishes (`/admin/whats-new`), each user sees each update once; Terms popup always sits above it. | — | `components/quickActions/*`, `components/whatsNew/WhatsNewPopup.jsx`, `admin/WhatsNewManager.jsx`, `backend/whats_new_routes.ts`, `scripts/sql/OLD_SQL_already_run.sql (session41 part)` | `quickActionsData.test.js`, `whatsNew.test.ts` |
| 90 | **Installable app (PWA).** `public/manifest.json` (one manifest), service worker from `vite-plugin-pwa`; the worker never answers `/api`, `/socket.io`, `/.well-known`, `/uploads` with the app page. Install banner: Android uses Chrome's prompt (caught early in `index.jsx`), iPhone shows the Add-to-Home-Screen guide; never inside chat. Play Store wrapper: `twa-manifest.json` + `public/.well-known/assetlinks.json` (host and key fingerprint must be the real ones). | PDF "Open" returning the app page | `vite.config.js`, `index.jsx`, `usePWAInstall.js`, `PWAInstallPrompt.jsx` | — |
| 91 | **No new database changes for now (Ravi, session 41).** Only app bugs / errors are fixed. No new Supabase table, column, bucket or SQL file, and no feature that needs one. Write the need in `docs/database/PENDING_DB_CHANGES.md`; all of it is done in one dedicated database session. Exception approved by Ravi in session 41: What's new + push notifications (`session41.sql`). | Half-built features waiting on tables nobody made | `docs/database/PENDING_DB_CHANGES.md`, `GEMINI.md`, `AGENTS.md` | — |
| 92 | **Push notifications (session 41).** Deal pushes = every row written to `notifications` (a 20 s loop in `push_routes.ts`; one push per row via `push_log` primary key, so several servers never double-send; no locked file touched). Promo pushes = Admin → Push notifications (any language; everyone / creators / brands / creators by niche; city = Phase 2; send now or schedule; max 2 promo per person per day). No on/off setting in the app. Permission: our own screen first (sticker + Ravi's lines + "Yes, keep me posted" / "Not now" = ask again in 3 days), then the phone popup on tap. iPhone only when added to Home Screen. Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (/ VAPID_SUBJECT). | Lost deals because nobody saw the invite | `backend/push_routes.ts`, `public/push-sw.js`, `src/lib/push.js`, `PushPermissionScreen.jsx`, `PushNotificationsManager.jsx` | `backend/push.test.ts` |
| 93 | **Saved answers for instant screens (session 42).** `api.get` keeps the last good answer of every GET (memory) and of the home / inbox / bell reads (phone storage, `src/lib/apiSnapshot.js`). Home (creator + brand) and the mobile inbox paint those first, then refresh quietly. Snapshots belong to one token: wiped on every logout path and when another account logs in. Never decide money / deal / chat state from a snapshot — screens always take the server answer that follows. Phones load only the mobile home (`Dashboard.jsx` lazy-loads the desktop dashboards + charts). | "Slow like a website" | `src/lib/apiSnapshot.js`, `src/lib/api.js`, `CreatorHomeMobile.jsx`, `BrandHomeMobile.jsx`, `InboxMobile.jsx`, `Dashboard.jsx` | `src/lib/apiSnapshot.test.js` |
| 94 | **Installed app = /app (session 42).** `manifest.json` start_url `/app`. Logged in → dashboard; logged out → welcome (2 cards: Creator, Brand / Agency) → one email box → `POST /auth/check-email` → existing: "Continue with OTP" (big) + "Use password instead" (small, only if the account has a password); other role: offer it; new: name + mobile + terms → `/auth/signup` (random long password unless they set one) → email code → onboarding. Login codes: `POST /auth/login-otp`, checked inside `POST /auth/login` as `{ email, otp }` so every account check still runs; stored in the existing `ybex_ephemeral` store (no new table), 3 codes / 15 min, 5 wrong tries. Inside the installed app `/` and `/login` (no query) redirect to `/app`. Status bar strip = colour at the top of the page (`StatusBarSync.jsx`). Install steps per browser (iPhone Chrome too): `src/lib/installGuide.js`. | Landing page inside the app; no install on iPhone Chrome | `src/pages/app/*`, `backend/loginOtp.ts`, `backend/auth_routes.ts`, `StatusBarSync.jsx`, `components/install/*` | `src/pages/app/appLogin.test.jsx`, `backend/session42LoginOtp.test.ts` |

**Env switches that must stay OFF in production:** `DEMO_LOGIN`, `DEMO_SEED`. `PAYMENTS_TEST_MODE`
must be `false` for real use (while test mode is on, fake `pay_test_` payments are accepted and
OTP codes are shown on screen).

**Safe to change freely:** texts, colours, layout, spacing, icons, new pages that call existing
APIs, button placement (see AGENTS.md). When in doubt: ask, and run `npm run verify`.

---

# Ybex — Campaign vs UGC

Read this before touching anything in chat, escrow or the deal lifecycle.

## The one thing that causes bugs here

Ybex runs two products through a lot of the same code:

| | Campaign | Instant UGC |
|---|---|---|
| What it is | A brand runs a campaign; creators apply; a deal is signed | A brand orders a video directly from a creator |
| Record | `deals` row | `ugc_orders` row |
| Identifier | UUID, e.g. `3f2b…-…` | prefixed string, e.g. `ugcord_1773…` |
| Has a signature stage | yes | no |
| Chat thread id | `thread_camp_…` or a UUID | `thread_ugc_…` |

Both of these were historically stored in the **same column**: `chat_threads.deal_id`. So a
`deal_id` may hold a campaign UUID or a UGC order string, and code that assumed one got the
other. That single ambiguity is behind a long run of bugs — Supabase `22P02` errors from
passing `ugcord_…` where a UUID was expected, UGC orders silently updating the `deals`
table, revision state landing on the wrong record.

## The identifiers to use

- **`campaign_deal_id`** — set only on campaign threads. Always a UUID or `null`.
- **`ugc_order_id`** — set only on UGC threads.
- **`deal_id`** — legacy, still populated for both. Hundreds of call sites read it, so it
  has not been removed. **Do not use it in new code to decide which flow you are in.**

`populateThreadData` in `backend/server.ts` sets `campaign_deal_id` and `ugc_order_id`, plus
`is_ugc`, `type` and `deal_type`.

## How to tell which flow you are in

Do not pattern-match on the string. Use the flags the serializer already gives you:

```ts
const isUgc = Boolean(
  thread.is_ugc || thread.ugc_order_id ||
  String(thread.deal_type || '').toUpperCase() === 'UGC'
);
```

When you only have a raw id, check for the `ugcord_` / `thread_ugc_` prefix, and validate
the UUID shape before sending anything to a Supabase UUID column:

```ts
const isUuid = (v: any) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
```

## Rules

1. **Never write a UGC id into a UUID column.** Guard with `isUuid` first. An unguarded
   write fails the whole statement, not just that row.
2. **Decide by what the thread IS, not by what you could prove.** Gating a UGC write on
   "did the order row resolve" means the write is skipped exactly when resolution failed —
   which is when it mattered. Gate on `isCampaignThread` instead, and let UGC be the
   default. See `syncUgcLifecycleEvent`.
3. **Campaign code is under a freeze.** Do not modify `backend/campaigns_routes.ts`,
   `backend/admin_campaigns_settings_routes.ts`, `src/pages/brand/BrandCampaign*.jsx`,
   `src/pages/creator/CreatorCampaignFlow.jsx` or `src/components/campaigns/` without
   explicit sign-off.
4. **Shared files must branch, not switch.** `server.ts`, `ChatBox.jsx`, `SystemMessage.jsx`,
   `MessageBubble.jsx`, `ContentProofNotice.jsx` and `deals_chat_routes.ts` serve both
   flows. Changes go inside a UGC-only or campaign-only branch, leaving the other path
   byte-identical.
5. **Order your state checks carefully.** A revision request updates the thread immediately
   but the order row can lag. If "content submitted" is allowed to win that tie, the UI
   sticks on the old state. See `src/components/chat/chatFlowState.js`.

## Database

`campaign_deals` is a view over `deals`, added so the campaign table can be referred to by
a name that says what it is. The underlying table is unchanged and both names work.

`chat_threads.campaign_deal_id` and `transactions.campaign_deal_id` are nullable UUID
columns. Backfilled only where the existing `deal_id` is a valid UUID; UGC rows are left
`NULL` deliberately. Readers fall back to `deal_id` when it is `NULL`.

Migration to run if these are not yet present:

```sql
ALTER TABLE IF EXISTS chat_threads ADD COLUMN IF NOT EXISTS campaign_deal_id UUID;
ALTER TABLE IF EXISTS transactions  ADD COLUMN IF NOT EXISTS campaign_deal_id UUID;

UPDATE chat_threads SET campaign_deal_id = deal_id::UUID
 WHERE campaign_deal_id IS NULL AND deal_id IS NOT NULL
   AND deal_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- The UUID guard matters here too. transactions.deal_id can hold a ugcord_ string, and
-- without the filter the whole statement fails on the first one.
UPDATE transactions SET campaign_deal_id = deal_id::UUID
 WHERE campaign_deal_id IS NULL AND deal_id IS NOT NULL
   AND deal_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE INDEX IF NOT EXISTS idx_chat_threads_campaign_deal_id ON chat_threads(campaign_deal_id);
CREATE INDEX IF NOT EXISTS idx_transactions_campaign_deal_id ON transactions(campaign_deal_id);

CREATE OR REPLACE VIEW campaign_deals AS SELECT * FROM deals;
```

## Fees

The brand is charged **no platform fee**. Escrow holds the full agreed amount and the
commission is taken from the creator's side at payout. Brand-facing screens therefore show
`Brand Fee: ₹0` — this is a display change only; `calculatePlatformFee` and the amounts
written to `transactions` are untouched.

## Chat contact filter

`backend/contactSecurityFilter.ts` blocks attempts to move a deal off-platform. It is
enforced on the server; `src/utils/contactSecurityFilter.js` re-exports the same module so
the UI can warn instantly, but the client is never the barrier.

Contact keywords do **not** block on their own — only when they appear near something
contact-shaped. "Is this for iPhone or Android?" must keep working. Revision notes and
briefs are exempt entirely, so a brand can ask a creator to keep a phone out of frame.

## Route Separation & Lifecycle Handlers (Phases A–D)

Campaign and UGC lifecycle execution are split into dedicated modules with discrete namespaces:

1. **Campaign Namespace (`/campaign/threads/*`)**:
   - Handled by `createCampaignLifecycleHandlers` in `backend/campaigns_routes.ts`.
   - Manages campaign content approvals (`approve-content`), draft submission (`submit-content`), live link submissions (`submit-live-link`), live links approval (`approve-live-links` / `mark-complete`), revisions (`request-revision` / `reject-content`), and cancellations (`cancel-order`).
   - Wired via `setupCampaignThreadRoutes`.

2. **UGC Namespace (`/ugc/threads/*` & `/ugc/orders/*`)**:
   - Handled by `createUgcLifecycleHandlers` and `setupUgcOrderRoutes` in `backend/ugc_routes.ts`.
   - Manages raw deliverable submissions (`submit` / `submit-content`), instant order approval & payout release (`approve` / `mark-complete`), revisions, decline revisions, and order claims cancellation.

3. **Thin Forwarders & Legacy Compatibility**:
   - Legacy `/chat/v2/threads/*` endpoints in `backend/server.ts` are thin forwarders that resolve the thread and dispatch to either the UGC or Campaign lifecycle handler using `isUgcThread(thread)`.


---

## Security model (sessions 19–21) — read before touching auth, money or chat

Every lifecycle action checks **WHO** (the caller is a party on *this* deal: `partyRole()` in
`backend/campaignGuards.ts`, `ugcGuards.ts` for UGC) and **WHEN** (the deal is at the right
step). A new route that moves money or changes a deal's stage must do both.

| Area | Where | Rule |
|---|---|---|
| Login | `backend/server.ts` `parseAuthUser` | Only real session tokens (`user_sessions`, read with the privileged client). A bare `user_id` is never a token. Login never creates accounts — sign-up + email verification only. |
| Roles | `backend/roleGuards.ts` | Set at sign-up / onboarding. An onboarded creator cannot become a brand (or back) through an API call. |
| Signing | `backend/signTokens.ts` | `/otp/verify` of a `contract_sign` code returns a one-time `sign_token` (10 min, that user only). Every `/sign` route and the UGC claim require it. |
| Escrow | `payment_routes.ts` create-order | Amount comes from the deal, never the browser; refused until both sides signed (`CONTRACT_NOT_SIGNED`). |
| Payout | `campaigns_routes.ts` approve-live-links, `ugcLifecycleService` APPROVE | Brand/admin only, needs a live link (campaign + UGC collab) or an approved deliverable (raw/edited UGC). Status `RELEASED` = platform released it; an admin makes the bank transfer and marks it `PAID`. Admins get a `payout_due` alert. |
| Refund | `backend/refunds.ts` | UGC cancel refunds the order's share through Razorpay. `refund_status` is `PROCESSED` only when Razorpay accepted it, otherwise `PENDING` + a `refund_due` admin alert. |
| UGC slots | `backend/ugcSlots.ts` | Compare-and-set on `claimed_count`; never read-then-write. |
| Sockets | `backend/socketAccess.ts` | A socket belongs to the logged-in user. `join_room` only for a party of the thread. Deal events go to the thread room + both parties + `admins` — never `io.emit` to everyone. |
| Uploads | `misc_routes.ts` `checkSignedUploadTarget` | Signed upload URLs only for `content-submissions` / `ugc-videos/`, `campaign-deliverables/`, `chat-attachments/`. |
| Notifications | `broadcastAdminNotification` | Admin alerts go to `user_id: 'admin'` and the `admins` socket room only. `'all'` is for real platform announcements. |

## Where the data lives

- **Supabase is the source of truth.** The server uses `privilegedSupabase` (service-role key)
  for anything it must be able to read regardless of RLS — sessions, users, threads, orders.
  Without `SUPABASE_SERVICE_ROLE_KEY` the server falls back to the anon key and RLS silently
  hides rows (that is what made a brand look like "not a brand").
- **`getDb()` / `saveDb()` is a local in-memory store** flushed to `db_mock.json` (and a cloud
  backup). It is a cache/fallback, not a second database: it only knows what this server
  instance saw. Do not add features that depend on it being complete — read Supabase.
  An empty `db_mock.json` is a fresh store (v171c ships it empty).
- The browser writes to Supabase directly in ~19 places (anon key + RLS). Anything involving
  money, roles or another user's data must go through the server instead.

## Deal flow (campaign)

`BRIEF_SENT → NEGOTIATING ⇄ NEGOTIATING_COUNTER → AI_AGREEMENT_READY → (both sign, OTP) →
escrow paid → ACTIVE → SUBMITTED (draft) ⇄ CHANGES_REQUESTED / REVISION_DECLINED →
CONTENT_APPROVED → PROOF_SUBMITTED (live link) ⇄ REVISION_REQUESTED_LINKS / REVISION_DECLINED_LINKS →
COMPLETED (payout RELEASED)`

UGC: claim (= creator signs, OTP) → deliverable → approve (raw/edited: payout) or, for a
collaboration, draft approve → live link → payout. `CANCELLED` refunds.

All `flow_state` values are listed in `backend/statusTokens.ts`; a test fails on an unlisted
one. A new value needs the DB constraint updated first.

## Environment variables

| Variable | Needed for |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` (`VITE_…` for the browser) | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required in production** — sessions, roles, admin writes |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Escrow payments, UGC deposits, refunds |
| `PAYMENTS_TEST_MODE` | `true` = no real payments; OTP codes are returned to the screen. Unset + `APP_URL` on `run.app` also means test mode — set `false` for real use |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | All emails incl. OTP. The sender domain must be verified in Resend |
| `RESEND_ALLOW_FALLBACK` | Only for local dev: pretend an email was sent when Resend fails |
| `APP_URL` | Links in emails; test-mode detection |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook (event `order.paid`, URL `/api/payments/razorpay/webhook`) — records a campaign payment even if the brand's app closed before /verify. Off when empty. A live key (`rzp_live_`) always turns payment test mode OFF. |
| `VITE_PLAY_STORE_URL` (optional) | Android "Install the app" opens this Play Store page instead of the browser install |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `GEMINI_API_KEY` | AI features (market intelligence, suggestions) |
| `ADMIN_EMAIL` | Admin notifications by email |
| `DEMO_LOGIN` | Demo/bypass logins — keep off in production |

## Known structural debt (not fixed yet)

- Very large files: `backend/server.ts` (~3.8k lines), `campaigns_routes.ts` (~3.3k),
  `src/components/chat/ChatBox.jsx` (~3k). Split them route-group by route-group, with the
  tests green after each step — not in one go.
- Empty `catch {}` blocks outside the money/auth files still swallow errors silently; the
  money/auth ones report through `backend/logIgnored.ts`.
- `strict: false` in `tsconfig.json`; the frontend is mostly JSX.

## Private media (session 22)
- `content-submissions`, `live-proofs`, `ugc-assets`, `kyc-documents` are private buckets. The server never makes them public (`isPrivateBucket` in `backend/mediaAccess.ts`).
- The browser opens those files only through `GET /api/media?src=<bucket/path>` (`backend/media_routes.ts`): viewer = session cookie, Bearer, or the `k` media key from `/auth/me` (12 h, cannot log in). Allowed: staff, the uploader, a party of the file's thread/order, or (for `/upload` files) someone with a deal with the uploader. KYC: owner + staff only. Answer: 302 to a signed URL valid `MEDIA_URL_TTL_SECONDS` (15 min).
- Frontend: `resolveMediaUrl` → `mediaProxyUrl` (`src/lib/mediaUrl.js`); plain links use `mediaHref`.
- Optional env: `MEDIA_KEY_SECRET` (else derived from the service-role key; with neither, keys work only on the instance that issued them — cookie still works).
- Limit: the watermark is still an overlay. A burned-in watermark needs an ffmpeg preview copy (not built).

## Shared short-lived state (session 22)
- OTP codes (hashed) and contract sign tokens live in `public.ybex_ephemeral` (`backend/ephemeralStore.ts`, SQL: `scripts/sql/ybex_ephemeral.sql`), service-role only. Consuming a sign token is one `DELETE … RETURNING`, so it works once across all instances. Without the table it falls back to instance memory and logs a warning once.
- The OTP send rate limit is still per instance.

## Online status (session 22)
- `user_status_change` goes to the user's contacts (other side of any thread/order/deal) and admins; `get_online_users` returns only contacts (staff: everyone). Before, both went to every connected user.
- Socket wiring lives in `backend/socketServer.ts`; rules in `backend/socketAccess.ts`.

## File map additions (session 22)
- `backend/socketServer.ts` socket wiring · `backend/notificationService.ts` notifications + admin broadcasts + emails · `backend/storageHelpers.ts` buckets/signed URLs/base64 upload · `backend/campaign_lifecycle.ts` campaign deal lifecycle handlers · `backend/ephemeralStore.ts` shared short-lived state · `backend/mediaAccess.ts` + `media_routes.ts` private media · `src/utils/ignored.js` frontend swallowed-error reporting (dev only).


## Loading states (rule 35 — every new feature follows this)

One pattern per job. Pick by **what the user is waiting for**:

| Waiting for | Use | Never |
|---|---|---|
| App cold start (session unknown) | `ColdStartSplash` — already mounted in `App.jsx`, driven by `AuthContext.loading`. Nothing to add. | A second splash / full-screen loader anywhere else |
| Moving to another page, or a page whose content is a form (settings) | `startLoading()` / `stopLoading()` → the 2px top bar (`GlobalLoader`). Always call `stopLoading()` in `finally`. | Blocking overlays, `backdrop-blur`, big logos |
| A page's DATA (lists, cards, detail pages, profiles) | Render header/nav/tabs immediately; where the data goes, render a skeleton from `src/components/common/ContentSkeletons.jsx` (`CardGridSkeleton`, `DetailSkeleton`, `ProfileSkeleton`, or `Shimmer` for a custom shape) in the **final shape**. Mobile lists: `MobileSkeletons.jsx`. | Centered spinners with "Loading…" text, empty `min-h-screen` divs, `startLoading()` on top of a skeleton |
| A BUTTON action (save, send OTP, verify, logout, approve, reject, submit, upload, pay) | `const { isBusy, anyBusy, run } = useBusy()` (`src/lib/useBusy.js`); wrap the handler in `run("key", …)` (or `begin/end` in an existing try/finally); the button gets `disabled={anyBusy}` and shows `<ButtonSpinner />` while `isBusy("key")`. `run` also blocks double taps. | `startLoading()` for a button — it signals a page load and gives no feedback on the button itself |

Details: skeleton shimmer is `#EFEFF4 → #F7F7FA`, 1.6 s linear; bar is `#7C3AED`, 2 px, 250 ms show delay, finishes at 100 % then fades; everything is static under `prefers-reduced-motion`. A money-moving button (approve & release, pay) also asks for confirmation first (rules 33–34).



### 76. Only real database columns (session 35)
Supabase refuses a WHOLE insert / update / upsert / select when one key is not a column of the
table (and an `.or(...)` with an unknown column fails the whole query). Most of these errors were
ignored, so features failed silently (apply form, payout details, admin warn, notification read …).
- Before writing to a table, check its columns (live list: `docs/database/PENDING_DB_CHANGES.md (History part)`,
  section "Live schema"). Never add "just in case" alias keys (`phone` + `mobile`, `photo` + `picture`).
- Extra keys for the local cache are fine, but strip them before the Supabase call
  (`onlyColumns(row, WAITLIST_COLUMNS)` in `backend/creatorApplication.ts`).
- Test fakes must reject unknown columns like Supabase does (see `creatorApplication.test.ts`).
- Need a new column? Add a `scripts/sql/*.sql` file + a prompt for Ravi; never assume it exists.
- Bank / KYC data never goes on a table the browser or Explore can read (`creator_profiles`).

## UI consistency (rule 87 — Ravi, session 55)

"AI bot ka UI alag hai, app ke features ke liye app ka UI hi use hoga."

- **App UI** (every app feature: landing page, payment / checkout page, dashboards, sheets, forms,
  chat screens): light `#F4F4F8` / `#F2F2F7` background, white cards, violet `#7C3AED` (border
  `#DDD6FE`, soft `#F5F0FF`), ink `#0A0A0A`, dark band `#17122B`, DM Sans. Use the tokens in
  `src/index.css`.
- **Eva bot UI** (green `#1F7A35` frosted glass, `TH` in `FeedbackBot.jsx`) is ONLY for the inside of
  the Eva chat. Never use the bot's green / glass on an app screen — not even when Eva sends the
  user there (e.g. "Pay now" opens the normal app payment page in the app UI).
- New screens copy an existing app screen's look; don't invent a third style.
- The website landing (`src/pages/dashboard/Landing.jsx`) shows only true things: no made-up live
  activity, counts, ranked creators or fee claims; server lists (creators, brand logos, reviews) hide
  when empty. Keep it light on phones: no huge `blur-[…]` glow layers, no animation library.

## PHASE 2 (decided by Ravi, session 34 — not built yet)

### Phase 2 additions (session 36, decided by Ravi 7 Oct 2026)
- **Fee model = Option B** (after the launch period, announced openly): creator gets 100% of the quoted amount;
  brand sees one total = creator amount + "Secure payment & protection" charge (shown, tap for what it covers).
  Negotiation is always on the creator amount. Never a hidden mark-up (Ravi asked for a hidden two-way cut;
  declined — two different amounts in one OTP-signed contract, CCPA dark-pattern rules 2023, own Terms).
  Needs: Ravi's written OK for 7 locked files (feeCalculator.ts, payment_routes.ts, razorpay.js,
  campaign_lifecycle.ts, campaigns_routes.ts, ugc_routes.ts, agreementTerms.js); old deals keep the old
  model; refund on non-delivery = full brand total (suggested); one % or the 15/5 threshold (open); UGC % (open); CA check on GST.
- **72-hour auto-approval** (then add the line to contract clause 2.3).
- **Promo email system**: notification settings page, honour the "Offers and promotions" switch.
- **Videos to Cloudflare R2** when storage > 70% (700 MB), egress > 3.5 GB/month, or > 20 UGC orders/week.
- **Not to build:** Pay & hire, Fund all / Nudge, Chat before accept (off-platform risk).
- Admin screens keep the word "escrow" (Ravi). Landing page: never change anything except what Ravi names.

- Session 35 open items: lead-merge columns (`leadMergeService.ts`), market-intelligence tables, `user_sessions` device fields, `ybex_sync.updated_at`, legacy `/public/creators/apply` route (suggest: switch off), `collabs` legacy route, `chat_messages.id` / `chat_threads.payment_funded` reads in locked `deals_chat_routes.ts`, profile `panel_message`.
- **DPDP paperwork:** data-processing agreements with each provider (accept their standard DPAs), breach-notice process and timelines, consent manager.
- **Re-accept changed Terms:** when `LEGAL.termsVersion` changes, ask once before continuing.
- **KYC / bank consent boxes** on the KYC and bank screens.
- **Delete account** and **Download my data** buttons in settings (until then: by email to privacy@ybexmedia.in).
- **Auto-approval** 72 hours after a submission with no Brand response — then add it back to the Terms and Refund Policy.
- **Razorpay Route** (or similar) for the secure payment hold instead of Ybex's current account — confirm with the CA.
- CA answers (TDS section and rate, GST / TCS, invoice format) → update `legalContent.js` and receipts.
- Admin screens still say "escrow" (internal only); user screens say "secure payment hold".
- **Promo / update email system** (Ravi: Phase 2): admin "Send email" screen (audience: all creators / brands / niche / city; subject, message, preview), batched sends via Resend, per-user one-click **Unsubscribe** link + `List-Unsubscribe` header (Gmail bulk-sender rule), unsubscribe page without login, skips users who unsubscribed or have "Offers and promotions" off, sent / unsubscribed report.
