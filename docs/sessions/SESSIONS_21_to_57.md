## Session 70 part 100 (v419 final-2): Eva + invoice, in-house brands, admin cleanup, waitlist duplicates, checkout/receipt redesign, email Send now
- Eva: brand search by every creator detail (gender split, state, engagement, age, barter, YouTube, language); creator jobs (profile complete with auto-save, payment ETA, monthly report, agreement red flags, content plan, brand reply, campaign match). Eva free invoice (invoiceCore.js + EvaInvoice.jsx, tables invoices / invoice_clients / invoice_billing_profile, server invoice no per FY, TDS asked) + Admin → Money → Eva invoices.
- In-house brands (cfg:inhouse_brands): ₹500 minimum, "Pay" = funded by Ybex (order_inhouse_, brand ₹0). Marked in Users → brand → Enforcement with the admin password; each ₹0 payment needs the pay PIN (askInhousePin sheet; bcrypt hash; 5 wrong = 15 min lock).
- No fee % anywhere; "Convenience fee (i)" dark bubble (FeeInfo). Receipt + PDF redesigned to Ravi's Checkout.dc.html screen 05. UPI Collect ("Enter UPI ID") removed — NPCI ended it 28 Feb 2026 → "Other UPI app" (upi:any, intent + QR) and Collect hidden on every checkout.
- Admin cleanup: one ADMIN_NAV menu (sidebar / drawer / phone More), What's new under Developer, AdminMoreMobile + 8 unused routes (incl. /admin/bypass) deleted, all tabs lazy, Overview counts only, phone queues counts-first, Help desk polling slower.
- KYC: whole row opens, Waiting/Approved/Rejected boxes, deep link &open=<id>. Waitlist: handle → Instagram link, "Left sign-up" tab, View KYC + Approve KYC (separate from Approve), "2 accounts · same Instagram" flag. Approving an application also approves the linked account (approveAccountProfile); list auto-heals old approved Started rows. Explore: one card per Instagram (dedupeByInstagram).
- Emails: queue only sent at night when someone used the site → Admin → Email broadcast → Waiting emails + "Send now <number>" (/admin/email-queue[/send]); night cron also sends single mails.
- Tests 3,368 pass; manifest updated; repo 998 files. Details: out/SESSION_70_100_SUMMARY_v419_final.md.

## Session 70 part 99 (v419 final): phone admin + full QA round
- Phone admin (Ravi's "Admin Mobile" design): src/components/admin/mobile/ — Overview queues, Users, KYC list + review (Google audit, documents, approve/reject sheets), Payments (payouts / UGC refunds / referral with UTR), More, Waitlist, Campaign review, Settings list, search, notifications. Every action on the existing admin APIs; other sections open the desktop component inside the phone frame. Admin.jsx renders it under 768px; Layout hides its own header/nav on /admin for staff.
- pending-counts KYC = creator_kyc + brand_kyc (badge matched the list; prod showed 195 vs 86).
- QA (creator / brand / Eva / admin) fixes: paid deal shows charged amounts (deals/:id → paid), hired = escrow funded, UGC signed rule same on desktop + phone, GSTIN "verified" only after KYC, Eva: "?" alone is not a ticket, chat kept for the tab, fallback answers saved, one 5xx no longer turns history off, KYC how-to; creator copy ("You're working on it"), Payouts filter, niche dedupe, nav "UGC".
- Later the same night: "Cancellation under review" (open cancel ticket → thread.cancel_requested; inbox chip, chat button, menu banner, no second request, no upload nudge) and Eva's 30-a-day phone cap removed (server still limits AI).
- Android 1.0.13 (code 14). Tests: src/v419AdminMobile.test.jsx.

## Session 70 part 98 (v419): QA v406 M-3 + Android push (Firebase)
- adminMoney.refundBlock: after a FULL deal refund the brand's service fee can still be refunded (NOT_FUNDED guard now lets a fee refund through while fee is left). Test: backend/v418M3.test.ts.
- Android 1.0.12 (code 13): google-services.json (Firebase project ybex-87436, com.ybex.app) in android-app/. Push turns on only when the native build says Firebase is there (MetaEvents.hasFirebase) — older builds get the web code by live update and stay off (no crash). Test: src/v419Push.test.jsx.
- Server sends to Android through FCM only with secret FCM_SERVICE_ACCOUNT_JSON (Firebase → Project settings → Service accounts → Generate new private key). Firebase console campaigns work without it.
- Still optional from QA v406: A11Y contrast cleanup (partial), full CSP script-src (risky with Meta/GA/Razorpay — not done).

## Session 70 part 97 (v418 final): Meta app events + Play button + UTM fix
- Android 1.0.11: Meta SDK (installs, signup, QualifiedCreator 1K/10K, value 1) + Play install referrer. Website: QualifiedCreator10K, PlayStoreClick, Play button (PLAY_STORE_LIVE). CAPI: app events as action_source app. UTM kept across browsers. Details: out/SESSION_70_97_SUMMARY_v418_final.md.

## Session 70 part 96 (v418): cleanup + last Low fixes + Eva history
- 7 unused files removed (repo 992). Last 6 Low copy/UI fixes. The mobile chat box grows. Eva history: 100 messages per reopened chat, agency users included. Details: out/SESSION_70_96_SUMMARY_v418.md.
- Run `node scripts/protectedFlows.mjs --update --reason "v414+v415+v416+v417+v418"` before deploy.

## Session 70 part 95 (v417) — all leftover bugs fixed
- v414 Low list + v416 skip list done (staff label, offer floor by deal type, team unread, attachment rules + button, delete draft, pitch player, date lines, Eva overlap). Details: out/SESSION_70_95_SUMMARY_v417.md.
- Run `node scripts/protectedFlows.mjs --update --reason "v414+v415+v416+v417"` before deploy.

## Session 70 part 94 (v416) — brand panel round 3 (find more + fix all)
- ~130 more brand issues found; all Medium+ fixed (payments one source, UGC confirm sheets/budget limits, invites withdraw, chat tablet, popups a11y). Details: out/SESSION_70_94_SUMMARY_v416.md.
- Run `node scripts/protectedFlows.mjs --update --reason "v414+v415+v416"` before deploy.

## Session 70 part 93 (v415) — brand panel UI/UX polish
- Full brand panel audit (desktop + mobile): popups, animations, layout shifts, copy, crashes fixed. Details: out/SESSION_70_93_SUMMARY_v415.md.
- Run `node scripts/protectedFlows.mjs --update --reason "v414+v415"` before deploy.

## Session 70 part 92 (v414) — chat deal bug fix
- All non-Low chat deal bugs (Collab/UGC/Campaign/Invite) + regressions + UI glitches fixed. Details: out/SESSION_70_92_SUMMARY_v414.md.
- Locked files changed with Ravi's OK; run `node scripts/protectedFlows.mjs --update --reason "v414 chat deal fixes"` before deploy (manifest not re-locked in session).

## Session 70 part 91 (v413)
- Waitlist: Started lead hidden when the same IG handle already has a creator account (no more double rows).

## Session 70 part 90 (v412)
- QualifiedCreator value = 1 instead of follower count (metaPixel.js, metaCapi.ts). 2 tests updated.

# Ybex — ALL session summaries (ONE file, newest first)

v378 (29 Oct 2026, Ravi: "sab summary ek hi file mein, purani hata do"): this is the only summary file. The file name
stays SESSIONS_21_to_57.md because a test checks it exists (src/session49.test.js) — it now holds every session.
Very old summaries (sessions 20–57, the brand mobile audit) were removed; older zips still have them. Rules that still
matter live in docs/code/ARCHITECTURE.md and docs/code/PROTECTED_CHANGES.md.
**Add each new session at the TOP of this file** (do not make a new summary file — 1,000-file limit).

---

# Session 89 / v411 — 5 Nov 2026 (Ravi: "bina fetch ke aage badha toh account banta hai — phir auto fetch hona chahiye")
Deploy **v411** (contains v410 … v397). **No DB change. No locked file changed.** No old test changed; backend/v408Join.test.ts +1.
- A creator account made with an Instagram username (join form, WhatsApp join, Google "One last step", Google pending) now asks
  Meta for the numbers ~4 s later in the background (kickInstagramRefresh; skipped when the hourly budget is kept for sign-ups).
- Opening Profile → Social platforms also fetches a profile that was NEVER fetched (was: only ones older than a day).
- The hourly refresh (cron /internal/cron/instagram-refresh) already picks never-fetched profiles first.
- Not automatic: a creator whose numbers come back under the minimum AFTER the account was made keeps the account — they show
  with their followers in Admin (Ravi decides; ask before adding an auto block).

---

# Session 88 / v410 — 5 Nov 2026 (Ravi's phone: "Couldn't check @aryanxploree right now")
Deploy **v410** (contains v409 … v397). **No DB change. No locked file changed.** No old test changed; backend/v408Join.test.ts +1.
- Live: @aryanxploree reads fine now (Aryan Mishra, 1,752 avg views) but Meta gave **no follower count** — the code turned that into
  **0 followers**, which would have shown "under 500" and blocked the sign-up on the server (Number(null) = 0). Now a missing count,
  or "0" while reels get 200+ views, is "unknown" → let through (backend/instagramConnect.ts trustedFollowers / statsFromInstagram).
- "Couldn't check … right now" at 15:31 = the per-visitor limit (10 lookups / hour per internet address — Ravi was testing, and
  mobile networks share addresses). Now 20 / hour per address; the shared Meta budget (80 previews / hour) is unchanged.

---

# Session 87 / v409 — 5 Nov 2026 (Ravi: "deploy sahi hua? username wala kaam kar raha hai?")
Deploy **v409** (contains v408 … v397). **No DB change. No locked file changed.** No old test changed; v408Flow.test.jsx +1.
- Live check (ybexmedia.in, phone size): server is v408 (join-proof answers); username fetch works — @ybex.in → "✓ YOU QUALIFY ·
  8.7K", @anas_vlogs_010 → "YOU'RE ALREADY ON YBEX · a•••@gmail.com" → Log in. The Instagram lookup takes ~8–10 s (Meta).
- Found: a browser that had opened Ybex BEFORE the deploy kept the OLD sign-up screen (service worker kept the old files; the new
  version waited on /app/continue, a "busy" page, forever). Fix (src/index.jsx): when a new version is ready and the person
  hasn't tapped / typed on the page yet, it loads at once; once they use the page it still waits (no lost OTP / form / payment).
- Note: the live check saved @ybex.in as a "Started" lead in Waitlist (our own account) — can be deleted in Admin.

---

# Session 86 / v408 — 5 Nov 2026 (Ravi: approved Join prototype "Ybex Join flow — clickable prototype"; login QA list; admin
video — sub-admin red toasts; "This page doesn't exist" on admin; Google login)
Deploy **v408** (contains v407 … v397). **No DB change. No locked file changed in this session** (v407's OK'd locked changes are
inside). Tests changed because the requirement changed (Ravi): src/pages/app/appLogin.test.jsx (a brand's email on the Log in
screen logs in as a brand — no "wrong side" screen; a NEW email on the creator Log in screen makes no account, it goes to the
Instagram step; /login route has the `login` flag), src/pages/app/webAuthV370.test.jsx (the "new email → account" check now on
the brand screen), backend/v376EasySignup.test.ts (the checked Instagram is a card with Change, not a text box). New tests:
src/v408Flow.test.jsx, backend/v408Join.test.ts, + v407IgFirst.test.jsx (3 more).
1. **Join screen (creators, /app/continue/creator)** = the approved prototype: "Get paid for your reels"; Instagram box with the
   real logo, auto-fetch 0.9 s after typing (spinner in the box); one result card (✓ YOU QUALIFY / YOU'RE ALREADY ON YBEX → Log in
   / UNDER 500 → Share my best work / CAN'T SEE → Continue anyway); "🔒 We never ask your password. Why?" (sheet); **Continue with
   Google** under Continue; "Trusted by 3,000+ creators" strip with Explore editor-pick photos + real activity lines
   (GET /api/public/join-proof — first names only, no money); "Already on Ybex? Log in".
2. **Google on creator screens = log in or carry**: an existing Google account logs in; a NEW one makes no account — it comes back
   to the Instagram screen with a red "NO ACCOUNT YET — <email>" note; after the check POST /api/auth/oauth/pending/complete makes
   the account with that Google (follower minimum re-checked on the server). Works for web, Android/iPhone app (native Google) and
   the iPhone Home Screen hand-off.
3. **Log in**: landing "Sign in" and /login open the Log in screen; /app has "Already on Ybex? Log in"; Log in = Google + email
   only (no WhatsApp, no "signing in as a Creator" line); a brand's email logs in as a brand; a new email → "No Ybex account —
   Join with my Instagram" (no account made without the Instagram check).
4. **Join form**: the checked Instagram is a card (photo, @username, followers) with **Change** → back to the Instagram screen;
   remembered 1 hour (was 6); Back goes Join form → Instagram screen → the page they came from (challenge), not /app.
5. **Install popup** never on landing / offer / challenge / sign-in pages or inside the Instagram / Facebook browser — only for
   signed-in people on app pages.
6. **Leads**: eligible creators (min+ followers) who checked their Instagram and left are saved in Waitlist as status "Started"
   (POST /api/public/ig-lead; under-minimum / private are NOT saved). Admin → Waitlist chip "Started on Join (left)".
7. **Private account page**: "Don't know how? See how" → bottom sheet with the Instagram steps + "Done — check again".
8. **Admin**: sub-admins no longer get red "You don't have permission…" / "Failed to load waitlist data" toasts from background
   reads (installQuietPermissionToasts in lib/api.js); /admin/<anything> opens the panel (was "This page doesn't exist"); the 404 page sends admins to /admin.
9. **KYC upload** (Ravi: a creator couldn't finish KYC — no PAN photo ever reached storage): phone photos that are HEIC, have
   no file type, or are big are turned into a JPEG (max 2000 px) on the phone before upload (lib/prepareUpload.js — creator +
   brand KYC, mobile + desktop, profile / cover photos); the server accepts a generic type and decides by the file's first bytes
   (fileMagic.sniffType); the error toast now says the real reason. New tests: src/v408Upload.test.js, backend/v408Join.test.ts.
- Kept as is (Ravi): "3,000+ creators", the welcome demo cards, the welcome design (no top-right Log in).
- Not built yet: mobile number and photo as separate screens after the account, "Welcome back, <name>" one-tap on the same phone.

---

# Session 85 / v407 — 5 Nov 2026 (Ravi: "username fetch hota dikhta nahi — box ke andar gol gol ghume, neeche naam + 10.2K
followers; aur jiska account bana hai wo login kaise karega?")
Deploy **v407** (contains v406 … v397). **No DB change. Locked files changed with Ravi's OK ("OK", 5 Nov): content_submissions_routes.ts,
creators_routes.ts** (manifest updated, logged in docs/code/PROTECTED_CHANGES.md). No old test changed. New test:
src/v407IgFirst.test.jsx (+ v404Purge.test.ts maskEmail check).
1. Join (app, /app/continue/creator): the username is fetched 0.9 s after typing stops (or Enter / leaving the box) —
   spinner inside the box on the right, then a small line under it: photo, name, "@user · 10.2K followers" (amber "under
   500" when low; "couldn't read — public + Professional?" when private). Continue uses that same result (no second fetch).
2. **Already have an account**: POST /api/public/ig-account (followerGate.ts) — if a creator account already uses that
   Instagram username the screen says "@user already has a Ybex account (r•••@gmail.com)" and the button becomes **Log in**
   (no second sign-up). The "Already have an account? Log in" button is now a full-width button, always visible.
3. Logged-out Instagram previews: 10 / hour per visitor (was 6) — the auto-check uses a few while typing. 80 / hour total unchanged.
- Needs IG_GRAPH_TOKEN + IG_BUSINESS_ID in the hosting secrets; without them the fetch can't run ("couldn't check — continue").
4. **Fewer database calls** (Supabase logs, 24 h: ~122k calls, peak ~4/s — the database itself is not overloaded):
   push loop no longer rewrites push_log for the same notifications every minute (~6.4k/day); /system-status reuses its
   answer for 10 s (~9k/day); /collabs reads collabs + waves once each, in parallel (was 4 reads); creators_routes no longer
   keeps asking for creator_profiles.id after the first "column does not exist" (~1.1k failed calls/day). Test: backend/v404Purge.test.ts.

---

# Session 84 / v406 — 5 Nov 2026 (Ravi, iPhone screenshot: Google "Access blocked … redirect_uri_mismatch",
redirect_uri=http://localhost:3000/api/auth/oauth/google/callback)
Deploy **v406** (contains v405 … v397). **No DB change. No locked file changed.** No old test changed; v404Purge.test.ts +1 check.
- Cause: the hosting's front proxy now reaches the app as Host = localhost:3000, so the server told Google "localhost".
- Fix: oauthOrigin() in backend/oauth_routes.ts (Google + Apple, and the old /auth/google routes in auth_routes.ts): on the
  live server (NODE_ENV=production) localhost / 127.0.0.1 / ai.studio / run.app → https://ybexmedia.in; the Worker's
  x-forwarded-host ybexmedia.in still wins. Local dev unchanged (OAUTH_ALLOW_LOCALHOST=true keeps localhost on a prod build).
- Google Cloud already has https://ybexmedia.in/api/auth/oauth/google/callback registered (v378) — nothing to add there.

---

# Session 83 / v405 — 4 Nov 2026 (Ravi: "L-1 kr de"; "P-1 bhi kr de")
Deploy **v405** (contains v404 … v397). **Locked file changed with Ravi's written OK ("kr de"): backend/payment_routes.ts**
(manifest updated, logged in docs/code/PROTECTED_CHANGES.md). **DB: nothing to run** — users.deletion_requested_at / deletion_reason + index were
already live (checked 4 Nov). First purge ~2 Dec 2026. No old test changed. New test: backend/v404Purge.test.ts.
1. **L-1 /transactions**: the dashboard, chat payout card and Eva asked at the same moment → now one database read per user
   while it runs (no cache after, so new payments show at once). Optional paging ?limit=20&offset=0 + X-Total-Count; without
   params the full list as before (Earnings totals need it). /escrow-transactions shares the same read.
2. **P-1 30-day purge** (runAccountPurge in backend/admin_wipe_routes.ts): a user who deleted their own account (Settings → Delete account) is hidden
   at once; after 30 days the same "complete wipe" as Admin removes everything + the login. Kept: transactions (name/email
   blanked). Skipped: admin-bin deletes, admin accounts, money in escrow (logged as held). Runs once a day on a timer, or
   POST /api/internal/cron/account-purge (x-cron-secret). Each purge is in the admin log ("purge_deleted_account").
   The admin wipe code was moved into wipeAccountData (admin_wipe_routes.ts) so both use one wipe; checked live on QA.

---

# Session 82 / v404 — 4 Nov 2026 (Ravi: "entries close popup mein dena hi nahi"; "baaki grey text bhi kar de")
Deploy **v404** (contains v403 … v397). **No DB change. No locked file changed.** No old test changed; v403DesktopKyc.test.jsx +1 check.
1. Diwali entry poster: the "Entries close in …" countdown line is gone (it overlapped "₹300 FREE CASH" at big text). The
   /challenge page still shows the close date.
2. All remaining light-grey text (`text-gray-400` / `text-slate-400`, 108 files) → `-500` (about 4.7:1 on white, was ~2.5:1).
   dark: / hover: / placeholder: variants unchanged.

---

# Session 81 / v403 — 4 Nov 2026 (Ravi: "QA PDF ke bache points fix karo; KYC page: IG link, poori profile, bina KYC Approve
nahi; desktop pe Eva nahi + mobile-wali UI desktop ke liye banao")
Deploy **v403** (contains v402 … v397). **No DB change. No locked file changed.** No old test changed. New tests:
src/v403DesktopKyc.test.jsx, backend/v403QaFixes.test.ts.
1. **KYC admin page** (KYCManager.jsx): the Instagram / social handle opens the profile (socialProfileUrl); "View complete profile"
   opens the same full user view as Users (/admin?tab=users&open=<id>); a creator with no KYC documents shows
   "KYC not submitted yet" instead of Approve / Reject (kycSubmitted), and no red pending dot in the list.
2. **Onboarding**: pasting an Instagram link in the username box keeps the username (was "httpsinstagram.comriya") → fetch works.
3. **Desktop**: Eva shows for creators who skipped onboarding (DesktopEva). Dashboard banner slides get a white background (no
   overlap). Push "Never miss a brand deal" ask = centered card on ≥768px. Diwali entry screen + full-screen promo poster =
   phone-sized centered card. Refer & Earn (creator) = two columns (programme left, code / wallet right). The product tour waits
   until the terms sheet / other popups close (it opened on top of them). Bottom sheets "tag a brand" and "entry done" centre on desktop.
4. **QA v395 report leftovers**: S-9 marking someone else's notification read → 404 (was 200). E-AI-1 phone / email / PAN / bank keys
   dropped and emails / phone numbers masked in Eva context. B-1 -webkit-backdrop-filter added. A11Y-1 text-secondary /
   text-tertiary tokens darker (4.5:1+), grey hint texts, nav labels, login green, campaign-create chips/buttons. A11Y-2 landing
   deal slider gets a label. S-1 Diwali "₹1,00,000" shrinks to fit at 200% text.
5. **Not done (needs Ravi)**: P-1 30-day hard delete needs users.deletion_requested_at + a job (DB change → PENDING_DB_CHANGES.md);
   L-1 /transactions paging is in locked payment_routes.ts (needs written OK). Some tailwind gray-400 / slate-400 texts remain
   (~640 uses; changed only where QA flagged).

---

# Session 80 / v402 — 4 Nov 2026 (Ravi: "Instagram username sign-up se pehle, 500 se kam ko wahin mana karo; photo + naam wala
screen; waitlist mein ads wale recent leads upar; profile photo ka notification")
Deploy **v402** (contains v401 … v397). **No DB change** (waitlist rows, ybex_ephemeral). **No locked file changed.** Tests changed
because the requirement changed: backend/v374Waitlist.test.ts (default sort now newest first); src/pages/app/appLogin.test.jsx (a new
creator now lands on the photo step, not straight on Home); src/pages/app/webAuthV370.test.jsx (the in-app-browser check starts after
the Instagram step); backend/v376EasySignup.test.ts (afterSignup sets target = DIWALI_ADD_PATH, then the photo step);
backend/v399EmailBudget.test.ts (+ PHOTO_NUDGE in NO_EMAIL_TYPES). Same checks otherwise. New tests: src/v402WaitlistRecent.test.js,
backend/v402SignupGate.test.ts, src/v402SignupFlow.test.js. Approved mockup: artifact "Ybex creator sign-up — step 1 + photo popup".
Decision (Ravi): keep the short Meta-ads flow; creator accounts are still made at sign-up for 500+ (dashboard, ₹300 offer).
1. **Join (app, /app/continue/creator) = Instagram username first** (src/components/signup/CreatorIgFirst.jsx, lib/signupPrecheck.js).
   Under the box a line fades between "🔒 Just your username — no login, no password" / "Ybex will never ask for your Instagram
   password" / "Trusted by 3,000+ creators" (RotatingHint.jsx).
   - 500+ (admin minimum) → the usual Join screen (Google / email + code / WhatsApp) with the username filled in.
   - Under → "Every big creator started small" page with **email + work link**, no account, no code e-mail →
     POST /api/public/follower-gate/work → Admin → Waitlist ("Below min · work shared", is_registered_user false).
   - Not readable (private / not Professional) → "check again"; still not → the same work-link page.
   - Meta busy / fetch off → let through (the onboarding gate still checks).
2. **Server check before a new creator account** (backend/followerGate.ts signupFollowerBlock, followers via the Instagram
   preview cache + hourly Meta budget): auth/quick-join, auth/phone/verify (new creator), auth/quick-profile (Google / Apple
   "One last step") → 403 LOW_FOLLOWERS. An Approved waitlist row (email or handle) is let through. App screens go back to the
   Instagram step / show the work-link page.
3. **Photo + name screen** (/app/photo, src/pages/app/AppPhotoStep.jsx): every NEW creator after the account is made (lib/afterSignup
   PHOTO_STEP), then where they were going (Home / Diwali reel). Only Back (no "Step 1 of 4", no Exit). Name from Instagram (never
   "@handle" / email); photo from Instagram / Google if there is one. Photo + name required. "Clear photo = more brand deals" +
   rotating creator circles (TrustAvatars). "Upload photo" → sheet: "Top Ybex creators brands love" = creators/home-picks (Admin
   "Show on home screen"), home-page card look; "Avoid" (dark / group / logo); Choose from gallery / Take a selfie → circle crop.
4. **Admin → Waitlist → Creators:** default **newest first** (Filters → Sort: Newest first / Most followers); chips **App sign-ups
   (ads)** / **CSV import**; with the "No photo" chip a bar "📸 Ask them to add a photo", and "Ask for photo" for selected rows →
   POST /admin/waitlist/photo-nudge → bell + phone notice PHOTO_NUDGE (no e-mail).
5. Correction to Session 78: user_registered / kyc_submitted / profile nudges never sent e-mails (bell / push only). The 4 Nov quota
   went on OTP codes (+ resends), the welcome note per new account and the 18-person broadcast. The v400 night queue (welcome,
   broadcasts) is what saves the quota.

---

# Session 79 / v401 — 4 Nov 2026 (Ravi: "deal / campaign updates raat ki queue mein nahi, ye turant dikhani hogi")
Deploy **v401** (contains v400 … v397). No DB change, no locked file, no old test changed.
1. notificationService.ts activityEmailPriority(type): activity e-mails about campaigns, applications, deals / offers, UGC orders /
   briefs / drafts / revisions, contracts, invites, payments / payouts / refunds / escrow go **at once** (high). KYC notices,
   new-work digests (ASSIST_NEW_CREATORS), welcome / profile and other notices stay LOW (night queue). Test in v399EmailBudget.test.ts.

---

# Session 78 / v400 — 4 Nov 2026 (Ravi: Resend "Daily Quota Limit" 100 emails reached — "login OTP vagairah sab priority pe, baaki sab
queue mein rahe, raat ko jab limit reset ho tab dekhe agar limit bachi hui hai toh bhej de, warna pending mein rahe"; no Resend Pro)
Deploy **v400** (contains v399 wipe fix, v398, v397). Tests: 2 old tests changed only because the version passed v399 (backend/v364SplitFee.test.ts, backend/v367Challenge.test.ts: the BUILT_IN pattern now also accepts v4xx; same check). **No DB change** (queue uses the existing ybex_ephemeral table, keys `emailq:…`,
counter `email:count:<UTC day>`). **No locked file changed** (creators_routes.ts invite mail left as it was). No old test changed.
New tests backend/v399EmailBudget.test.ts, backend/v399EmailGate.test.ts. 275 test files.
1. **backend/emailBudget.ts + helpers.ts Resend wrapper:** every mail is counted per UTC day. Default = HIGH (sent now): join / login /
   signup / resend / forgot-password codes, account codes, contract signing code, refunds, support replies, UGC deadline mails to
   creators, campaign invites (locked file), waitlist approval mail, pitch-lead mails, Eva chat export.
   LOW (`priority: "low"`): the personal welcome note, activity notification e-mails (the in-app notification is instant), onboarding
   reminders, admin alert e-mails (sign-up / UGC deadline). In the day a LOW mail is queued instead of sent.
2. **Night send:** 21:00–24:00 UTC (2:30–5:30 am IST, before Resend's 00:00 UTC reset) the queue goes out oldest first, only up to
   (100 − 3 − sent today); the rest waits for the next night (kept 14 days). Broadcasts (emailBroadcasts.ts) use the same budget.
   Runs every 5 min on a timer and on any request (Cloud Run may idle). Resend "quota" error → today marked full, low mails stop.
3. Env: RESEND_DAILY_LIMIT (default 100; set 0 on a paid plan → no gate), EMAIL_LOW_WINDOW_UTC (default "21-24").
4. **No e-mail at all (bell + phone push only):** notification types USER_REGISTERED, KYC_SUBMITTED, PROFILE_NUDGE (safety net —
   see the correction in Session 80: these never e-mailed) and any notice to a staff @admin.ybex login (NO_EMAIL_TYPES). KYC approved / other activity mails to users are LOW (night queue).
5. The 18 "not eligible (0 followers)" creators were binned (deletion_reason set) and their broadcast was sent (18/18).

---

# Session 77 / v399 — 4 Nov 2026 (Ravi: "do baar wipe kiya, dono baar 'wiped completely' aaya, but admin abhi bhi list mein hai")
Deploy **v399** (contains v398 + v397). **No DB change. No locked file changed. No old test changed.** New test backend/v399AdminWipe.test.ts.
1. **Cause (checked live):** the two admins (ravimarketing.com@gmail.com "Rishi & Vini", commonuseforpro@gmail.com) have 21
   admin_activity_logs rows (admin_id → users, no cascade). The wipe deleted everything else, then the users row was refused by the
   database, and the route still answered ok → "wiped completely" while the account stayed.
2. **Fix (backend/accountWipe.ts WIPE_UNLINK_COLUMNS + admin_wipe_routes.ts):** before deleting, the wipe clears the link to the
   wiped person in records that are kept (admin logs, auth logs, who-made banners / coupons / app versions / templates, report
   resolver, blog author, transaction admin_action_by, deal escrow hold admin, notification sender). The rows stay.
3. **Honest result:** after the wipe the server checks the users row; if it is still there → 500 WIPE_INCOMPLETE "The account could not
   be removed completely…" (+ a wipe_user_failed admin log), never "wiped completely".
4. Live data done this session (with Ravi's OK): brand accounts Ybex / Hostelbird / AdNexus (commonuseforpro+…@gmail.com), campaigns
   live for all three, Wefrnd campaign approved + reworked to the team's scripts, 13 UGC briefs (Wefrnd 4, ProRewards 3, Ybex 3 —
   2 creators each, no escrow: Ravi pays creators himself).

---

# Session 76 / v398 — 3 Nov 2026 (Ravi: "/admin aur /ybx-admin pe 'This page didn't load — Failed to fetch dynamically imported module' kyu aa raha hai, pure app mein solve karo")
Deploy **v398** (contains v397). **No DB change. No locked file changed.** Tests: 1 old test's pattern widened because the function
name changed (src/lib/apiSnapshot.test.js: `lazy(` → `lazy(` or `lazyRetry(`, same check: dashboard still loads separately).
New test src/v398StaleBuild.test.js. 272 test files, 2,625 pass.
1. **Cause (checked live):** after a deploy, screen files get new names (AdminLogin-BWUJfXE3.js → 404 on the live server). The service
   worker (registerType 'prompt') keeps giving the OLD saved page until the new version is applied, so Reload brought the same old page
   back; admin screens are not in the offline copy, so they always ask the server → 404 → "This page didn't load".
2. **Fix (src/lib/staleBuild.js):** on a missing-screen-file error the page lets the waiting new version take over (SKIP_WAITING), or,
   if none is waiting, drops the old service worker, then reloads once — on the new version. 20 s guard, never loops. Used by every
   lazy screen (App.jsx, Dashboard.jsx, Landing.jsx, DesktopEva.jsx via `lazyRetry`), the global error listeners (index.jsx) and both
   error screens. Page error screen for this case now says "Getting the latest Ybex… / We just shipped an update" with a spinner and
   "Load it now" (forces it).
3. **Server:** index.html, sw.js, registerSW.js, push-sw.js and workbox files are sent with `Cache-Control: no-cache` (hashed /assets
   files stay cached for a year).
4. Cloudflare worker (maintenance page, cloudflare/ybex-proxy-worker.js) is NOT live yet: the dashboard blocked the upload from the
   browser (403). Ravi pastes it in the Cloudflare editor → Deploy.

---

# Session 75 / v397 — 2–3 Nov 2026 (Ravi: Eva + Google AI from AI Studio, blog covers, "500 se neeche followers wale bahut kachra aa rahe hain, ads ka budget kharab ho raha hai — 500 ka lock laga, aur unke liye cute page + work link")
Deploy **v397** only (contains v391–v396). **No DB change** (uses existing waitlist columns: source, sample_links, notes, linked_user_id —
checked on the live schema). **No locked file changed.** Tests: 2 test files changed because the requirement changed (apply form now
accepts under-100 followers → saved as a work share): none of the old assertions broke; new tests backend/followerGate.test.ts,
src/v397FollowerGate.test.jsx. 271 test files, 2,620 pass.
1. **500+ followers to join (creators).** Default 500; admin can change it (item 6). Only numbers that came from Instagram itself (fetch / Instagram login) count;
   if the fetch fails (private account, Meta error) the creator goes on as before and the team decides in Waitlist.
   - Mobile onboarding: Next on screen 1 → clean page. Desktop: Next on step 1 (before the photo check) → clean page.
   - Server guard (backend/followerGate.ts, mounted before every POST /creators/profile): finishing sign-up with 1–499 followers → 403
     LOW_FOLLOWERS. Never touches a creator who already finished, an ordinary profile save, or a creator the team approved
     (their low-follower waitlist row Approved, or profile reviewed + approved).
   - Already-onboarded creators are not affected.
2. **Clean page (src/components/onboarding/FollowerGate.jsx)**, Ravi's final lines: 🌱 "Every big creator started small." / "Brands on Ybex
   look for 500+ followers. You're closer than you think." / box "Drop your best work link below." "If it matches brand standards, someone
   from the Ybex team will personally message you." [Send my work] → 🙌 "Got it! Someone from the Ybex team will personally message you if
   your work is a fit." + "Not @handle? Use another account" + Log out. No "no bots / waiting list" (Ravi).
3. **Work link → Admin → Waitlist** (POST /api/creator/follower-gate/work; GET /api/creator/follower-gate): one Pending row per creator,
   source `low_followers_work`, link in sample_links (more links add to the same row). Waitlist shows a violet "Under 500 · work shared"
   badge and a Filters chip of the same name. Approve = the creator can finish sign-up.
4. **Apply form (/apply-creator)**: under 500 followers → the same clean page; the form is sent with the work link and saved as
   `low_followers_work`. The Meta "Lead" event is NOT fired for them (ads optimise only on 500+). In-app, under-500 creators never reach
   "OnboardingComplete" either. (CompleteRegistration still fires at account creation — followers aren't known yet then.)
5. Android 1.0.10 (code 11) AAB built and signed with signing.keystore (SHA-1 A5:E0…C1:D7 = Play's upload key); file Ybex-1.0.10.aab.
   YBEX_ENV_v396.txt: new Google secret (…HqUc), ADMIN_EMAIL / ADMIN_ALERT_EMAIL = commonuseforpro@gmail.com, META_CAPI lines.
   Ravi: rotate Razorpay key secret, Supabase service key and Resend key (the env file was pasted in chat); after Google login works,
   disable the old Google secrets (…Ayd9, …IZOf). RAZORPAY_WEBHOOK_SECRET still empty.
6. **Admin can change the limit** (Ravi: "admin panel ke andar bhi option de de"; 3 Nov: "platform setting mai do, waitlist se hata"):
   Admin → Platform Settings → **Creator sign-up** tab → "Minimum followers to join" (also in the admin search; sub-admin permission
   settings_signup, or all settings). Default 500, 0 = no limit, max 1,00,000. Saved in the existing ybex_ephemeral
   table (key setting:creator_min_followers) — no new table/column. Every server picks a change up within 60 s; the sign-up page, the
   apply form, the server guard and the line "Brands on Ybex look for N+ followers" all follow it (backend/followerMin.ts,
   src/components/admin/FollowerLimitCard.jsx). Waitlist badge/filter renamed "Low followers · work shared" / "Below min · work shared".
7. **Eva + real Google AI (from Ravi's AI Studio copy of v396, now in v397)** — when no rule matches, Eva answers with
   Gemini ("chat" task, backend/assist_routes.ts) instead of "didn't get that", for brands and creators. Model: gemini-3.8-flash
   first, gemini-3.1-flash-lite as a DIFFERENT fallback (AI Studio had 3.8-flash twice — one model's free-tier limit would
   switch Eva's AI off); no temperature (Google's 3.8 guide); key = GEMINI_API_KEY (or API_KEY / GOOGLE_API_KEY), injected by
   AI Studio — .env.example no longer has an empty GEMINI_API_KEY line. Fix on top: no second AI call when the first one just
   failed (the person waited twice). Daily cap per account stays ASSIST_DAILY_LIMIT (30); a message can use 2 of it.
   Port: AI Studio forced PORT=3000 for everything; now only the AI Studio preview (tsx server.ts) is forced to 3000
   (backend/devPort.ts, imported before the server) — the deployed build keeps Cloud Run's PORT as before.
   vitest.config: AI Studio's test env lines kept. Not testable here without the real key → Ravi checks after deploy.
8. **Blog covers (1200 x 630) no longer cut** (Ravi): every frame is 40:21 — blog hero, Latest Posts thumbnails (w-28),
   cards, post page, related posts; hero title moved BELOW the image (no dark overlay); posts without a cover show Ybex's own
   /og-image.jpg (was an Unsplash beach photo). Admin → Blogs: "1200 x 630 px" next to the cover upload, preview in 40:21.
9. **Website down → maintenance page** (Ravi, 3 Nov: "site band ki thi par maintenance page nahi aaya"): the Cloudflare worker only
   caught 502/503/504/52x. When the AI Studio app is stopped / unpublished the hosting answers with its own page (200 / 404 / 500),
   which went straight through. Now any page load that is a 5xx or is not Ybex's own HTML (no `<div id="root">`) shows the
   maintenance page; /api calls unchanged (cloudflare/ybex-proxy-worker.js, test backend/v397WorkerDown.test.ts).
   **Ravi must paste the new worker file into Cloudflare → Workers → ybex worker → Edit code → Deploy** (it isn't part of the zip deploy).
10. **"Meet the Creators" cards same size on every phone** (Ravi, 3 Nov: "jo size iPhone mein aa rahi hai wahi sab mein fix,
   Android mein phail jaati hai"): the card columns are capped at 390 px (iPhone width) and centred, so wide Android screens no
   longer stretch the cards (src/components/dashboard/MeetCreatorsGrid.jsx, GRID_MAX_W).
11. Live database (Ravi asked): ProRewards "Diwali Dhamaka Reel" campaign approved → status live + "Campaign live" notification
   to the brand. Google login on the live site failed with invalid_client: the YBEX_ENV in AI Studio still had the OLD
   (deleted) Google secret …Ayd9 — Ravi pastes YBEX_ENV_FINAL_HqUc.txt and redeploys.
12. **Destructive buttons true red, not pink** (Ravi, 3 Nov): Block, Send report, Delete account, Decline (offers / changes / collabs),
   Reject (campaign brief, KYC, challenge entry, referral withdrawal, pitch), Close campaign, Suspend, Recall brief, Refund, Remove
   platform → solid red-600 #DC2626 (white text) for confirm buttons, light red (red-50 / red-200 / red-600) for secondary ones.
   Colour classes only — no text, handler or server call changed (protected-flow test passes).
13. **Instagram must be readable to join** (Ravi, 3 Nov: "personal account wale 300 ke chakkar mein aage badh gaye"): if Instagram
   can't be read (private / personal / not Professional / wrong username) the creator now gets the same clean page instead of
   the form: 🔒 "We couldn't open your Instagram." + how to switch to a public Professional (Creator) account + "I've switched —
   check again" + "Still a creator? Paste your best reel link — our team will personally open your account for you" (lands in
   Waitlist "Low followers · work shared" with a note). Server: finishing sign-up with no follower number → 403 IG_NOT_VERIFIED
   (team-approved still passes). Requirement change: 2 assertions in src/v397FollowerGate.test.jsx updated.
14. Explore cards: creators without niche/city → name + followers sit at the bottom next to AVG REACH (no empty gap).
15. "One last step" (after Google): rotating creator photos (admin picks + Explore creators) + "Trusted by 3,000+ creators"
   (TRUSTED_BY in src/pages/app/AppQuickDetails.jsx).
16. New sign-ups no longer get the Terms popup: an account made in the last 7 days with no Terms record is saved as accepted
   on the sign-up screen ("By continuing you accept…", source signup_screen). The popup still asks everyone who accepted an
   older version when the Terms change (backend/consents.ts).
17. Profile reminders keep going: 8 bell/push reminders (now, +2d, +4d, then every 3–7 days, ~4 weeks) instead of 3; they no longer
   stop when the Diwali offer closes (texts without the cash line then); creators who never finished sign-up get "Finish your Ybex
   profile" → /onboarding. Requirement change: backend/profileNudges.test.ts "at most 3" line updated.
18. Instagram check page: the work-link box is hidden at first — only "I've switched — check again" (asks Instagram right there,
   with a spinner). Fixed → the page goes away (or shows the under-N-followers page); still unreadable → "Still can't open @x" and
   the work-link box slides down from behind the button. "One last step": "Trusted by 3,000+ creators" on the left, rotating
   creator photos on the right (like onboarding).

---

# Session 74 / v396 — 2 Nov 2026 (Ravi: Creators filter like Explore; challenge entries without tags; Samsung keyboard over Eva; "waitlist se approve karte hi creator chala jata hai na?"; "ye popup baar baar aate hai, dismiss all ke baad bhi")
Deploy **v396** only (contains v391–v395). **No DB change. No locked file changed. No test changed** (new test src/v396AdminFixes.test.js).
1. **Admin → Users → Creators / Unclaimed: "Filters" button** opens an Explore-style panel (src/components/admin/AdminCreatorFilters.jsx,
   logic src/lib/adminCreatorFilters.js): followers (Under 1K / Nano / Micro / Macro / Mega + min–max, "5k" / "1L" ok), city, state, niche,
   platform, language, gender, paid / barter, rate per reel, + admin-only: profile status, KYC, Instagram fetched / not / private; sort.
   "Showing X of Y · Clear filters"; empty list says "No creators match these filters."
2. **Waitlist approve**: the data already went to the right place (registered → stays in Users → Creators, waitlist row linked; not
   registered → new Unclaimed profile). Two bugs made it look like nobody left the waitlist:
   - WaitlistManager opened on "All Statuses" (approved rows stayed in the list) → now opens on **Pending**; "Approved (moved to Users)"
     and "All Statuses" still in the dropdown. Approve toast says where the person went (approvedWhere()).
   - `/admin/users` (admin_users_enforcement_routes.ts) turned **every waitlist creator row (pending + rejected too)** into a made-up
     unclaimed creator, and an approved one showed twice. Now only an approved row with no linked account and no profile with the same
     handle / email (old approvals) is shown (`waitlistNeedsShadowRow`).
3. **Repeating admin pop-up** ("Pending Creator Verification" etc.): admin system alerts (broadcastAdminNotification: KYC submitted,
   signup, payout due) reached the blocking modal through the live socket + the server's local copy (no event_type), and Dismiss only
   marked one server's copy. Now: payload has `event_type` (notificationService.ts), NotificationPopup never blocks on admin system alerts
   (`isAdminSystemAlert`), dismissed ids are remembered on the device (localStorage `ybex_dismissed_popups`), Dismiss / Dismiss All close
   at once even if the server call fails. The alerts stay in the bell.
4. **Challenge entries** (Ravi: "jinhone hashtags use hi nahi kiye wo kyu dikh rahe / count ho rahe"; "follow ybex.in bhi isi me"):
   any reel can still be entered (v377 rule), but after **Refresh numbers** an entry whose caption misses @ybex.in / #Ybex /
   #YbexDiwaliChallenge, or that was posted before the start, is **auto-rejected** (`entryStatus` in challenge_routes.ts) → out of
   the public count, "Entries counted" and the ₹300/₹50 recharge line. "Reel not found / private" stays pending. Admin Approve /
   Reject always wins (Undo hidden on auto ones). **Follows @ybex.in**: Instagram's API can't tell who follows us, so the Checks
   column has "Follows @ybex.in? Yes / No" (link opens the creator's Following list); No → that creator's pending entries are
   auto-rejected. New route `POST /admin/challenge/follow {user_id, follows: true|false|null}` (stored in the challenge ledger,
   ybex_ephemeral — no DB change). CSV: + follows_ybex, auto_reject_reason.
   Creators are now TOLD to follow too (text only, no layout change): /challenge steps + rules + "reel ready" sheets + poster line
   ("@ybex.in follow + tag karo"), entry checklist (ChallengeUi), Diwali entry poster, Add collabs rule, profile-complete popup,
   Eva's offer text (OFFER_FOR_EVA) and the share text. Checked at 320 / 390 px: no overflow, headline still 2 lines.
5. **Keyboard over Eva on Samsung (Android app)**: the app targets SDK 36 → edge-to-edge, so Android doesn't shrink the WebView for
   the keyboard and visualViewport doesn't change. keyboardAware.js now also takes the keyboard height from the Capacitor Keyboard
   plugin events (keyboardWillShow) and the WebView's VirtualKeyboard API (Android app only) — used only when the page didn't shrink
   (`nativeKeyboardHeight()`, event `ybex:native-kb`); --kb / --vvh / kb-open follow it, and Eva's panel (FeedbackBot useVisibleBox)
   sits above the keyboard. Web part reaches the app by OTA; the plugin part needs the **new Android build 1.0.10 (code 11)**:
   android-app/package.json + `@capacitor/keyboard`, capacitor.config.json `plugins.Keyboard.resizeOnFullScreen: true`. Not tested on a
   real Samsung (simulated in Chromium: panel 824 → 494 px with a 330 px keyboard).
6. **QA report "Ybex v395 — Logged-in Mobile / E-mail / Money" (from the other chat) — fixed** (no locked file, no DB change):
   - S-1 (critical, filter injection through ids): `backend/idGuard.ts` on every /api request — an id-like path segment or
     `*_id` field with `,` `(` `)` → 400 BAD_ID (the string-built `.or()` filters are mostly in LOCKED files; this guards them all).
   - S-2: NOT real — the "EAAP…" strings are inside the mini-game's webp images (base64). Nothing to revoke.
   - S-3: a session the database says is gone/expired no longer works from a server's memory copy (server.ts `dbSaidNoSession`);
     local copies also honour expires_at. S-4: password reset also clears this server's copies + token cache.
   - S-5/S-10: base64 uploads get the same type + magic-byte check (`backend/fileMagic.ts`), max 100 MB; a refused type is 400/413
     (was 500); signed uploads refuse page/script/app files. S-6: brand website must be http(s) or a bare domain (`safeWebsite`).
   - S-7: `npm audit fix` (multer 2.5, body-parser, follow-redirects, qs, serialize-javascript…; no breaking change).
   - S-11: no fixed fallback secrets (`backend/fallbackSecret.ts`, random per start). S-12: local.env in .gitignore.
   - M-1: creators see the after-refund net (adminMoney `creatorShownNet` — only when the stored net is still full, so never twice)
     on every creator GET answer (server.ts middleware; trimmed rows from locked routes get their refund fields looked up).
   - M-2/M-7/M-8: brand Payments — a part refund is not "Refunded"; Spent = paid − refunded (+ a kept fee); In escrow = deal money
     only; campaign names found by id too. M-3: service fee can still be refunded after the whole deal amount went back.
   - M-4: every quote reads the fee settings fresh. M-5: empty / out-of-range fee values refused with 400 (UI keeps "" empty).
   - M-6/M-9: FeeBreakup uses the real calculator: brand sees service fee + GST + total (split model).
   - E-1 broadcast {{name}} / old ybexapp.ai.studio links fixed; E-2 ₹2,500 in UGC mails; E-3 brands greeted by full name;
     E-4 welcome mail viewport + our own founder photo (public/img/footer/founder-ravi-email.jpg); E-5 no Eva export mail with 0
     chats; E-6 no reminder without a stop link; E-7 creator gets bell + e-mail when a brand's payment is held
     (`backend/escrowNotify.ts`, a 1-minute job, once per transaction via ybex_ephemeral — payment code is locked).
   - UI: bottom nav 11 px, Diwali poster only on home screens, wallet chip says "Wallet" at ₹0, Brand Payments wraps at big text,
     bigger Statement / Invoice taps.
   - Tests changed because the requirement changed (QA report): v365BackboneE2E (fee 55 % → 400, not clamped), ugcDeadlines (₹2,500),
     evaV329 (export test uses a brand that has chats — empty export sends nothing now).
   - S-8, admin escrow name and the 24 px search boxes: done later in item 9. S-9 (low) and poster ₹ at 200 % text still open.
7. **Agency loophole** (Ravi): `/users/me/agency` had no role check (any account could mark itself agency) and /brand/kyc/submit let a
   creator make a brand row → both brand-only now; admin shows "Agency" only on BRAND accounts.
8. **Admin UX** (Ravi): universal search on every admin page (`AdminUniversalSearch.jsx` + `src/lib/adminSearch.js`: sections,
   settings like "popup", creators / brands / agencies / admins, waitlist people, campaigns; type badge on the right; Ctrl K).
   Deep links: `/admin?tab=users&open=<id>`, `tab=campaigns&open=<id>`, `tab=waitlist&q=…`, `tab=settings&view=<tab>`.
   Campaign review: "View brand details" + Brand ID. KYC list: creators show only PAN / "Not submitted".
   **Creator status = one word everywhere**: Live on Explore / Waiting / Not approved / Hidden (same rule as Explore) — badge in
   Users → Creators, "Review in Waitlist" button for Waiting, same words in the edit dropdown. Waitlist: compact strip
   (Creators · N waiting / Brands / Rejected bin, "N approved so far", "How approval works") instead of 4 big boxes, one search +
   ONE Filters button with every filter (status, followers & photo chips, Instagram, contact, platform, category), active filters
   as removable chips. Diwali poster font Rye now ships in public/fonts (Google font arrived after the 5-second poster).
9. **Small locked fixes** (Ravi OK in chat, 2 Nov: "jada bade major changes nahi hai ... unhe kr de"; logged in PROTECTED_CHANGES.md):
   S-8 — `/payments/quote` shows a deal's amount only to its own brand / creator / admin, others get 403 NOT_YOUR_DEAL.
   Admin escrow list: campaigns mapped by `id` AND `campaign_id`, so the real campaign name shows instead of "Campaign Deal".
   Chat / UGC search boxes (Chat, creator + brand UGC orders, UGC browse, Instant UGC) are 40 px tall, 16 px text on phone
   (no iOS zoom) — layout only, server calls same. Still not done: S-9 (low), poster ₹ at 200 % text.
QA pending list unchanged (9, 14, 15 etc.) — Ravi gave the testing to another chat.

---

# Session 73 / v395 — 2 Nov 2026 (Ravi, urgent: Meta event "QualifiedCreator" = creator with 1,000+ Instagram followers, Pixel + Conversions API, value = followers)
Deploy **v395** only (contains v391–v394). No DB change, no locked file.
New `backend/metaCapi.ts`: `qualifyCreator()` is called when a creator's follower count becomes known — Instagram lookup (instagramConnect.ts, also the daily refresh) and `/auth/onboard` (auth_routes.ts). At 1,000+ followers, for a creator account made in the last 30 days, ONCE per creator (key `metaqc:<user_id>` in ybex_ephemeral) it (1) sends a Conversions API event `QualifiedCreator` (hashed e-mail / phone / user id, _fbp / _fbc cookies, IP, browser, value = followers, currency INR, followers_count) and (2) puts `meta_event` in the API answer so the browser fires `fbq("trackCustom","QualifiedCreator",{value,…},{eventID})` (src/lib/api.js → metaPixel.js `trackServerEvent`). Same event id `qc_<user_id>` on both sides, so Meta counts it once. CompleteRegistration is unchanged.
**Ravi must add to YBEX_ENV:** `META_CAPI_ACCESS_TOKEN` (Events Manager → Pixel 965515649959745 → Settings → Conversions API → Generate access token). Optional: `META_TEST_EVENT_CODE` (Test events tab, remove after testing), `META_PIXEL_ID` (default is the Pixel in metaPixel.js). Without the token only the browser half is sent.
Tests: backend/v395MetaQualified.test.ts, src/v395MetaPixel.test.js. Local e2e: onboard with 400 → nothing; 5,000 → event; again → nothing; brand → nothing.

# Session 72 / v394 — 1 Nov 2026 (Ravi: admin push said "Sent to 12 phones" but nobody received it; "push notifications sahi se check kar")
Deploy **v394** only (contains v391–v393). No DB change, no locked file.
Push flow tested end to end on a local fake push service (subscribe, guest rules, admin send, dead-phone cleanup, scheduled push, deal-notification push, logout → guest): it works. "Sent" only means Google / Apple / Mozilla accepted the message; the phone still needs notifications allowed (Android Settings → Apps → Ybex → Notifications; Chrome site setting), battery saver off.
Change: backend/push_routes.ts `sendDetailed` sends 20 phones at a time (was one by one → thousands of phones could pass the 60 s limit) and the admin report now shows Browser / Android app / iPhone counts, refused count + last error, dead phones removed. PushNotificationsManager.jsx shows it in the toast. Android-app (FCM) and iPhone (APNs) phones only count once FCM_SERVICE_ACCOUNT_JSON / APNS_* are in YBEX_ENV (APNs key still to be added by Ravi). Test: src/v391Perf.test.js (last block).
v393 note: v391/v392/v393 are the same line; v391 = speed + mobile, v392/v393 = Google account chooser.

# Session 71 / v393 — 1 Nov 2026 (Ravi: "Google sign-in ek click me last account par seedha sign in kar deta tha, pooche")
Deploy **v393** only (contains v391; v392 was the same fix for non-iPhone only). No DB change, no locked file. AppContinue.jsx: the remembered e-mail (`login_hint`) is no longer sent on ANY phone (Ravi: iPhone too) — Google always asks which account (iPhone Home Screen app: Google asks for the e-mail, there is no account list there). The "Use a different Google account" link is hidden (not needed). Test: src/v391Perf.test.js (last block).

# Session 70 / v391 — 1 Nov 2026 (Ravi: "dono reports ke according sab thik kar de" — Speed QA + Mobile/screen-size QA)
Deploy **v391** only (contains v390). **No database change. No locked file changed.** Measured on a production build against a mock Supabase (Pixel-5 size, 4x slow CPU).
**Speed**
- Landing newspaper (16 clipped copies, 1,235 nodes, 200+ animations) is not rendered until the paper scrolls into view (`.np-off .np-slices{display:none}` in landingMobile.css / landingDesktop.css; reduced-motion jumps to the end state).
  Landing sections below the first screen use `content-visibility:auto`. Main-thread busy in 6 s: 4,280 ms → ~1,800 ms, layout 787 → ~100 ms, style 667 → ~300 ms.
- 25 landing PNG/large images → WebP (1.9 MB → 0.44 MB); the old PNGs are deleted from public/landing.
- App.jsx: Signup, Dashboard and the popups (Notification, Promo, Diwali entry, Profile-complete, What's new, Push permission) are lazy chunks; popups mount when the browser is idle (≤1.2 s, `Idle`). Main JS 372 → 331 KB gzip.
- Service worker is registered 3 s after page load (index.jsx `startSW`), so its ~2.4 MB background download never competes with the first page.
- Public lists `/landing-brands`, `/landing-reviews` (admin_content_routes.ts) and `/landing-creators` (creatorHomePicks.ts): 45–60 s in-memory cache; admin save/delete clears it. `/challenge/public` already cached.
- Not changed on purpose: the service worker still precaches every app chunk (the offline-app feature from v334).
**Mobile / screen sizes**
- Header: under 360 px (Layout.jsx) / 340 px (landing) "Sign in" hides and moves into the menu; buttons `nowrap`; 40–44 px tap targets. Menu button never leaves the screen at 280 / 320 px.
- index.html: pinch-zoom allowed again (no maximum-scale / user-scalable=no); iPhone inputs are 16px (index.css) so Safari does not zoom on focus.
- `.min-h-screen` / `.h-screen` follow the visible height (dvh); `.App` and mobile shell use `--yb-vh`; landscape phones get left/right safe-area padding; offer pinned bar has left/right safe-area and a short form under 340 px.
- Tiny text: every Tailwind text-[8–9.5px] outside admin → 11px; on public pages (landing, challenge, auth, app login, explore) 10–10.5px → 11px too.
- Landing: phone layout under 700 px (was 768) so iPad mini gets the roomy layout; phone-landscape hero shrinks so the first button is visible. Login legal links and landing footer links have bigger tap areas.
- Test: src/v391Perf.test.js.
**Not tested:** logged-in screens, real phones, keyboard open, system font 130–200%, dark mode, app WebView.

# Session 69 / v390 — 31 Oct 2026 (Ravi's screen recording: logout showed "Application Notice … undefined is not an object (D._result.default)")
Deploy **v390** only. **No database change. No locked file changed.**
Cause: after a deploy an open app still points at old hashed chunks. `index.jsx` swallowed Vite's `vite:preloadError` (preventDefault) even when its 10 s
reload guard skipped the reload, so the lazy page resolved to nothing and React crashed. Fix: swallow it only when the page is really reloading (index.jsx);
`lazyWithRetry` (App.jsx) and the landing views (Landing.jsx `lazyView`) treat an empty chunk as a failed load and reload once. Test: src/v390Chunk.test.js.
Google sign-in keeps the v291 one-tap (last account via login_hint) and now has a "Use a different Google account" link (AppContinue.jsx, website only; the Android/iPhone app already shows the phone's account list).

**Also done in this session (outside the zip's code — so the next chat knows):**
- Google sign-in: new web client secret (…IZOf) is in YBEX_ENV (no inline comment on the line); old secret (…Ayd9) to be disabled after a login test (login worked on 31 Oct).
  YBEX_ENV also has `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID`. Google app is published (production), branding saved.
- Cloudflare worker `ybex-proxy`: API timeout 60 s deployed (version 18bbb7be). A stale broken-draft Cloudflare tab may still be open — never Deploy it.
- Supabase buckets content-submissions / live-proofs / ugc-assets set private by Ravi (SQL ran, "Success"). Other DB items (unique index, RLS, test-account delete) are still only in PENDING_DB_CHANGES.md.
- Android **1.0.9 (versionCode 10)** AAB built from the v389 source and signed with the PWABuilder keystore (alias my-key-alias, SHA-1 A5:E0:09:30:97:B2:0D:59:E2:9E:A1:85:C0:82:70:78:CD:54:C1:D7). Needs upload in Play Console → Closed testing.
  Build fix: androidx.browser pinned to 1.8.0 in `android-app/scripts/mac-prepare-android.sh` (the template's Gradle plugin 8.7.2 can't take 1.9.0).
  The new key `ybex-upload-key-2026.jks` / `upload_certificate.pem` / `Ybex-1.0.7-newkey.aab` are NOT registered in Play — do not use.
- iOS: Capacitor project generated on the Mac with `Ybex-iPhone-Setup.command` (it sets com.ybex.app URL scheme, GIDClientID, permissions, push code). Added `App.entitlements`
  (aps-environment=production, Sign in with Apple), version 1.0.0, min iOS 15. Still to do by Ravi in Xcode: pick Team, Archive, Upload; then App Store Connect listing (pack with text + 8 screenshots 1320x2868 is in "PlayStore Data/5-AppStore-iOS"), demo creator + brand accounts for review, APNs key (APNS_KEY / APNS_KEY_ID / APNS_TEAM_ID in YBEX_ENV).
- Mac folder "PlayStore Data" (Downloads) holds keystore + passwords, all AABs, Play assets, source zip, App Store pack. Ravi must back it up to Drive / pen drive.
- Marketing videos (not part of the app code): newspaper/curved-tube teaser 16:9 (+9:16, 4:5 earlier), ₹300-offer edited video. Sources are in the working chat only, not in this zip.
**Still open from the QA report:** invite KYC gate + duplicate-invite limit, useChatThreadMobile race, signingEmail.ts placeholder, release-payout approval check, manual settlement fee, UGC approve dead branch, chat filter @brand tag, OAuth state cookie binding, referral code on quick-join/phone, Android Back overlays, 1000-row paging, index.html OG hosts (needs Ravi OK + pinned test change).

# Session 68 / v389 — 30 Oct 2026 (the SIX locked-file fixes Ravi approved in writing: "Partial refund ke baad double payout, Ek Razorpay payment do baar record hona, Title me ugc …, UGC draft me koi bhi text link maan lena, Counter / sign steps pe notification na jana, Invite email me raw HTML")
Deploy **v389** only (contains v388). **No database change.** Locked files changed with Ravi's OK — logged via `npm run protect:update` in docs/code/PROTECTED_CHANGES.md:
1. campaignGuards.ts `isPartRefundedDeposit` + campaign_lifecycle.ts: a deposit row with a PART refund (₹2,000 of ₹20,000, or only the service fee) is still the deposit, so approve
   no longer inserts a second full payout row; creator net = netAfterPartialRefund. A row with a refund and no paid amount, a full refund, or status REFUNDED is still a refund row.
2. payment_routes.ts: `persistEscrowPayment` is now a per-order-id queue (verify / status poll / webhook run one after the other) + after the insert the oldest row for the order
   stays and a later duplicate deletes itself. The DB unique index is still listed in PENDING_DB_CHANGES.md (needed for several server copies).
3. dealState.js + ChatBox.jsx: the title is never used to decide "UGC order" (type / id only).
4. ugc_routes.ts `isAcceptableDraftRef`: first draft must be our storage path, /api/media link or a web link with a real host (no spaces, no userinfo); else 400 INVALID_DRAFT_LINK.
5. deals_chat_routes.ts `notifyOtherParty` (counter, counter accepted, agreement prepared, signed / both signed) + campaign_lifecycle.ts request-changes notification row.
6. creators_routes.ts invite email: brand-written values HTML-escaped, free text through maskContactDetails, subject single line, link base = publicSiteUrl().
Not part of the six (still open from the QA report): invite KYC gate + duplicate-invite limit, chat-thread switch race (useChatThreadMobile.js), signingEmail.ts placeholder address, release-payout approval check,
manual settlement fee, UGC approve dead branch, contactSecurityFilter @brand tag rule. Tests: backend/v389Locked.test.ts.

# Session 67 / v388 — 30 Oct 2026 (Ybex_v382_Deep_QA_Report.pdf — code fixes that do NOT touch locked files or the database)
Deploy **v388** only. **No database change. No locked file changed.** Tests 2,5xx pass. New dependency: `sanitize-html` (package.json).
Fixed (QA ids by section):
- Sign-up/login: WhatsApp paste "+91 98765 43210" kept the wrong digits (`waClean`, AppContinue.jsx); a Supabase error/timeout while reading the
  session no longer logs everyone out (server.ts → `req._authDbError` → /auth/me 503 SERVER_DOWN); per-IP limit (20 / 5 min) on
  /auth/login-otp + /auth/forgot-password and trimmed forgot-password key; WhatsApp-only accounts (`phone-…@ybex.io`) get "Add your email first"
  instead of a code sent to a dead address (account_routes.ts) and a failed OTP mail now says so (OTP_SEND_FAILED).
- Notifications/email/SEO: push loop no longer stalls after a 200+ burst (cursor = created_at + id, drains up to 5 batches per tick);
  every email / push link uses `publicSiteUrl()` (backend/siteUrl.ts) — never ybexapp.ai.studio / run.app (creators_routes.ts:1605 is locked, left);
  profile nudges skip CSV `unclaimed` ghost profiles; robots.txt no longer hides public /creator/<id> and /brand/<id> pages; sitemap has /offer,
  /explore, /campaigns, /ugc, /terms and drops /apply-creator.
- Security: blog HTML sanitizer = real parser (`sanitize-html`, backend/htmlSanitize.ts) + the reader page cleans the copy it injects;
  fee config keeps the last good row when a read fails (brandFee.ts).
- UI/infra: /offer FAQ ₹50 → ₹300; install banner never in the store apps / Admin, install sheet not on legal/help pages and only after 30 s
  (or 2 s on the 2nd page); public creator page hides the owner-only footer note and empty "Languages"; missing /assets file = 404 and hashed
  assets cached 1 year; Cloudflare worker gives /api 60 s (paste the file into Cloudflare again); YBEX_ENV accepts quoted multi-line values and
  `KEY_B64=` (decoded into KEY); mac-prepare-android.sh → 1.0.9 / code 10; OTA zip skips splash PNGs (−6.6 MB).
- Test edit (Ravi's requirement changed, Play already has code 9): backend/v364Android.test.ts line 151 "VERSION_CODE=5" → "≥ 5".
NOT done (need Ravi's written OK — LOCKED files): partial-refund double payout (campaign_lifecycle.ts / campaignGuards.ts), double-recorded Razorpay payment
(payment_routes.ts), release-payout without approval check, "ugc" in a campaign title (ChatBox.jsx / dealState.js), UGC draft accepts any text (ugc_routes.ts),
no notifications on counter/sign steps (deals_chat_routes.ts), invite email HTML escape + KYC gate (creators_routes.ts), chat filter @brand tag
(contactSecurityFilter.ts is not locked but changes chat behaviour — listed), thread-switch race in useChatThreadMobile.js, signing code to placeholder email
(signingEmail.ts). NOT done (database — see docs/database/PENDING_DB_CHANGES.md, "QA v382"): private buckets, unique indexes, RLS, test-data cleanup, backfills.
NOT done (bigger / design): Layout remount on every route (App.jsx key), Android Back closing overlays, referral code on quick-join/phone sign-up,
OAuth state bound to a browser cookie, /internal/cron routes, 1000-row paging in onboarding reminders / CSV import / Instagram refresh.

# Session 66 / v387 — 30 Oct 2026 (merge of Ravi's AI Studio copy "version-382.zip", which is the version running live and working)
Deploy **v387** only (contains v383–v386). Compared AI Studio's copy with v378: it changed envBundle.ts, oauth_routes.ts, AppOAuthDone.jsx,
auth_routes.ts, ChallengePage.jsx (+ one test, blogSeo.ts / envBundle.ts `VITEST` guards, .env.example, its own .aistudio folder).
Merged into this tree: everything above (v385/v386 already had the same Google fix) PLUS what v386 was missing —
- backend/auth_routes.ts: the old popup Google flow also uses cleanEnvVal for GOOGLE_CLIENT_ID / SECRET.
- backend/envBundle.ts: applyEnvBundle also cleans a key that was set as its own secret with a `# comment` on the end.
- src/pages/ChallengePage.jsx: "remind me" closes the question first, then waits for the request.
- src/pages/app/AppOAuthDone.jsx: reads ?token= / ?error= when the hash is empty; runs once (ref); the token leaves the address bar
  only after the session is confirmed; explicit Authorization header on the first auth/me calls.
NOT merged on purpose: the `process.env.VITEST` guards inside blogSeo.ts / envBundle.ts (test-environment workarounds in production code),
the safeStorage "token_" fallback in readOAuthHash (a stored token would count as a fresh sign-in), the global api.defaults header write,
the regenerated .env.example, .aistudio/ + public/assets/aistudio/ (AI Studio's own files).
Tests 2,493 pass, 975 files. Version label v387.

# Session 66 / v386 — 30 Oct 2026 (v383 + v384 + v385 + v386)
**Google sign-in "didn't finish" — real cause found by Ravi in AI Studio:** the live YBEX_ENV line
`GOOGLE_CLIENT_SECRET=GOCSPX-… # ── Apple sign-in (iPhone) ──` was loaded WITH the comment → Google 401 invalid_client → error=google.
- backend/envBundle.ts: `cleanEnvVal()` strips an unquoted trailing ` # comment` (a # inside a value, or inside quotes, stays);
  parseEnvBundle uses it (also for the one-line-paste case). backend/oauth_routes.ts: GOOGLE_CLIENT_ID / SECRET / APPLE_CLIENT_ID /
  allowed audiences go through cleanEnvVal; the redirect_uri used at authorize time is signed into the state (`u`) and reused
  for the token exchange; Google's own reason (invalid_client / redirect_uri_mismatch / invalid_grant) travels as `reason`.
- src/pages/app/AppOAuthDone.jsx: readOAuthHashOnce (the hash is wiped from the address bar, a second effect run no longer sees
  an empty hash — the StrictMode double-mount Gemini found); per-error messages + small `code:` line.
- Test: backend/v385EnvComment.test.ts. **Ravi must also rotate GOOGLE_CLIENT_SECRET (it was pasted in chat) and delete the comment from that line.**
**v386:** desktop Eva floats OVER the page (no more 552px right padding squeezing the dashboard) — FeedbackBot.jsx, test src/v386EvaOverlap.test.js.
PageErrorBoundary ("This page didn't load", seen on /earnings, /chat, Settings) now shows a small `code: <name> · <message>` line so
the cause can be read from a screenshot. Cause of that crash NOT found yet (needs the code line).

# Session 66 / v384 — 30 Oct 2026 (v383 + OAuth error codes)
- **"Sign-in didn't finish. Please try again or use your email." (Ravi, desktop, 30 Oct)** — the page hid which step failed.
  src/pages/app/AppOAuthDone.jsx now has a message per backend code (google / apple / state / session / lookup / create) and
  shows a small `code: …` line under it. Most likely cause on the live site: the Google `redirect_uri_mismatch` fix from v378
  is not deployed yet (live is still older) → deploy v384 first, then read the code if it still happens.

# Session 66 / v383 — 30 Oct 2026 (Ravi: zip renamed to ybex-v382, so numbering continues from there)
Deploy **v383** (contains v378). **No database change. No locked file changed.** Tests 2,484 pass (new backend/v383DemoLinkLive.test.ts).

**"Demo access (test server)" link still on the live login / app screen (Ravi, 30 Oct)**
- Cause: the live YBEX_ENV still carries DEMO_LOGIN=true, and the v376 live guard (isLiveServer) only fires on a live
  Razorpay key or APP_URL = ybexmedia.in — the live secrets have neither, so /api/auth/demo-enabled answered true.
- Fix 1 (backend/liveServer.ts): Cloud Run always sets K_SERVICE → treated as live → demo / bypass logins off whatever the secrets say.
- Fix 2 (src/lib/useDemoLogin.js isPublicClient): on ybexmedia.in / ybexapp.ai.studio or inside the Capacitor app the link is never asked for.
- Ravi still to remove DEMO_LOGIN=true from YBEX_ENV (defence in depth).

**Marketing (outside the repo)** — Diwali creator ad, Sleeko/HowDo-style motion: `Ybex_Diwali_Ad_9x16.mp4` + `_4x5.mp4`
(24.5 s, 1080×1920 / 1080×1350, Kokoro af_heart "Why-bex" voice, synth beat + SFX, real app screens in phone mockups).
Source: ad.html (Playwright frame capture → ffmpeg), music.py, tts.py.

---

# Session 65 / v378 — full chat (26–30 Oct 2026)
Deploy **v378** only (contains everything up to v377). **No database change. No locked file changed.** Tests 2,481 pass, repo 975 files.
Handoff for the next chat: `CHAT_HANDOFF_v378.md` (outside the repo).

**Sign-up / login**
- WhatsApp OTP sign-up (Fast2SMS Smart OTP) — see the "v378 — WhatsApp OTP" section below.
- Google `redirect_uri_mismatch` fixed: on *.ai.studio / *.run.app hosts the callback always uses https://ybexmedia.in (oauth_routes.ts origin()).
- iPhone home-screen app: Google / Apple login through a popup "handoff" (src/lib/oauthHandoff.js, GET /auth/oauth/handoff,
  ephemeral key oauth:handoff:<h>); AppOAuthDone shows "You're signed in — close this window".
- Native Google account picker: nativeGoogleSignIn() (src/lib/native.js) + @capgo/capacitor-social-login (android-app, ios-app)
  + GET /auth/oauth/google/native-config + POST /auth/oauth/google/native (Google tokeninfo; aud must be GOOGLE_CLIENT_ID /
  GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID). Falls back to the browser login until Ravi creates the Android/iOS OAuth clients.
- Mass logout after a deploy fixed: /auth/me returns 503 SERVER_DOWN (not 401) when the server has no Supabase key.
- Maintenance gate decides by the user's role.

**YBEX_ENV** — one-line paste parsed correctly (backend/envBundle.ts); /api/health shows ybex_env_settings. Live: service role true, 27 settings.

**Diwali offer ₹50 → ₹300 cash, first 300 creators** (Ravi, 28 Oct)
- Public pitch: "complete your profile → ₹300". The reel step (@ybex.in + #Ybex #YbexDiwaliChallenge, added to the portfolio)
  is told only when the profile is 100%: ProfileCompleteCongrats.jsx popup (reel / eligible variants), Eva (OFFER_FOR_EVA). T&C by Ravi.
- Paid to the KYC payout details (no UPI ask).
- Profile reminders ON (backend/profileNudges.ts): max 3 pushes (0 / 48 h / 96 h), 9 am–10 pm IST, first missing part,
  KYC text "Add your payout details 💸"; state in push_log (kind profile-nudge). Tests: backend/profileNudges.test.ts.
- Challenge page pinned bar: 2 lines max.

**Stability** — "New version available" popup gone (quiet update after 2+ min away, calm page). Down page mini game full height;
Cloudflare worker keeps the last good sw.js (deployed b8e28f12) so an offline cold open shows Ybex's page, not a Safari error.

**Android** — 1.0.7 (code 8) status bar fix; **1.0.8 (code 9)** removes the advertising-ID permissions the Facebook SDK
(from the social-login plugin) adds (mac-prepare-android.sh does this too). Signed with the PWABuilder key (SHA-1 A5:E0:…:C1:D7).
Play: 1.0.8 in Closed testing Alpha, privacy URL → ybexmedia.in/privacy-policy, delete-account URL → ybexmedia.in/delete-account,
Ad ID declaration No — sent for review 30 Oct. Production apply ~3–4 Nov (14 days of 12 testers).

**iOS** — mac-prepare.sh uses Swift Package Manager (no CocoaPods) + GOOGLE_IOS_CLIENT_ID URL scheme. Blocked on Ravi's Apple ID reset.

**Brand tutorial videos** (not in the repo) — artifact CtPEy3bz31GydEu3nzEfFq (tutorial), StuCFY6kKeJFQ286Epo3Mk (green screen);
MP4 ybex-walkthrough-greenscreen-voice-HQ.mp4 (1080×1920, female voice, "Why-bex").

**Pending for Ravi** — deploy v378; Google OAuth clients (Android com.ybex.app with App-signing + upload SHA-1, iOS) → env keys;
Apple ID → Xcode archive; FAST2SMS_OTP_ID; Razorpay live check; Play production apply; rotate pasted secrets.

---

# Session 64 / v378 — latest additions (29 Oct 2026)
- **Docs: ONE summary file** (this file). Old session summaries 20–57 removed; CONTRIBUTING / UNIQUE_FEATURES → CODE_MAP.md;
  old SQL prompts → PENDING_DB_CHANGES.md (History); setup guides → setup/SETUP_GUIDES.md; 14 old SQL files →
  scripts/sql/OLD_SQL_already_run.sql (files tests / locked code point to stay). Repo: 975 files.
- **"New version available — Refresh" kept coming back on the website:** phones keep Ybex in the background, so the new
  version waited forever (old builds kept showing the toast). Now when Ybex comes back after 2+ minutes away, on a calm
  page (not paying / typing a code / a form / chat), the new version loads quietly — no popup (src/index.jsx).

---

# Session 64 — v363 → v366 (21 Oct 2026)
(Before this: docs/sessions/SESSIONS_21_to_57.md (Session 59 part) = v337 → v362, plus the detailed v363–v366 notes appended there.)
Deploy **v366** only — it contains v363, v364 and v365.

## Live database changes (all applied, all additive — nothing deleted)
| Migration | What |
|---|---|
| `waitlist_instagram_fetch_columns` | waitlist.ig_followers, instagram_stats, instagram_synced_at, instagram_fetch_error |
| `v364_split_platform_fee` | platform_fee_config.fee_model / creator_fee_pct / brand_fee_pct (live: split, 0, 8); transactions.brand_fee_pct / brand_fee_amount / brand_fee_gst / brand_paid_amount / coupon_code |
| `v365_waitlist_email_optional` | waitlist.email nullable (still unique when present) |
| `v365_coupons_applies_to_brand_fee` | coupons.applies_to allows brand, creator, brand_fee, all |
| `v366_coupon_reservations` | table coupon_reservations + functions claim_coupon / confirm_coupon / release_coupon (row lock, service_role only) |
| `v366_creator_profiles_dob_experience` | creator_profiles.dob, date_of_birth, experience, experience_years |
Old code ignores every new column, so nothing changed live before the deploy.

## 1. Money — fee till Diwali (8 Nov 2026)
- **Creator 0%** (gets the full deal amount), **brand 8% on top**, coupon can lower the brand fee (new %, ₹ off, or 0) —
  campaign deals AND UGC. ₹10,000 deal → brand pays ₹10,800 (₹10,400 with a 4% coupon) → creator ₹10,000 → Ybex ₹800.
- Admin → Fees: "Split / Old tiered" switch, Creator fee % and Brand fee % boxes with a live example (change after Diwali here).
- Admin → Coupons: Applies to → Brand fee; limits, per-brand limit (empty = none), dates, min deal value, active, used count.
- Server decides every amount: POST /payments/quote → create-order charges the quote → payment recorded only if paid ≥ total.
  Instant UGC orders now also priced on the server. Old orders made before v364 still work.
- Coupon use is atomic in the DB (no double use of the last slot); counted once even if verify + webhook both arrive.
- 2% rate-card markup switched off in split mode (no 2% + 8% double). Already-paid deals keep their stamped fee.
- Brand Review & pay = Ravi's new checkout: amount card, UPI app tiles (GPay / PhonePe / Paytm / BHIM / Amazon Pay /
  UPI ID), card / net banking, sticky "Pay ₹X | via PhonePe", Razorpay handoff screen, "Escrow funded" success with
  Razorpay ID + receipt. Razorpay opens on the chosen app (normal sheet if it refuses). Approve-in-app step = Razorpay's own window.
- Refunds (admin, manual amount + reason): shows Brand paid / Service fee / Coupon, quick fills, further refunds up to
  what's left, never more than the brand paid; a fee-only refund never touches the creator's payout. Same in Admin → UGC Refunds.
- Brand invoice (screen + PDF): "Convenience fee (8%)" line + coupon; total = what the brand paid. Not a GST invoice.
- Locked files changed with Ravi's OK, logged via `npm run protect:update` (docs/code/PROTECTED_CHANGES.md).

## 2. Waitlist + CSV
- "Fetch Instagram for everyone" works on Cloud Run now (admin screen drives it step by step, waitlist first; keep the page open).
  Live followers shown next to the form's number ("form said 9,500"); fetch errors shown; approval uses the live numbers.
- CSV import: email optional when there's an Instagram handle; duplicates by handle; re-upload completes rows.
  Approve without email → one unclaimed profile, no "Claim your profile" email, re-approve never duplicates.

## 3. Onboarding, profile, design
- Onboarding never traps anyone: "Exit → Log out" before basics, "Finish later" after; brand screen-1 Back opens it
  (Ankit's bug). Logo upload / publish errors say why; logo + city/state saved by the server.
- Ravi's Instagram auto-fetch design: username → photo, name, numbers (creator + brand; brand also bio + website),
  "Is this you?" confirm before saving (fixes @narendramodi numbers), one Instagram card on Social platforms,
  live strip on the profile hub, new portfolio (Select / Paste / Upload → tag brand → brand stacks, covers copied to our
  storage so previews don't vanish), photo-led public profile with adaptive colour, desktop portfolio covers.
- Home footer: same city art in light grey (Hopr style), smaller, new taglines for creators / brands.
- Real logos everywhere (SocialLogo.jsx, PaymentLogo.jsx from Ravi's logo files).
- Promo popup "Tap opens": every page incl. profile sub-screens + search.
- Eva: bio rule shown (40+ chars), refreshes after any save. Admin creator-edit no longer fails silently.
- Age: 14+ everywhere (sign-up, onboarding, Terms, Privacy). No guardian flow (Ravi). Terms version not bumped.

## 4. Reliability + apps
- Server down / deploying: app shows "Ybex is updating" with saved screens, keeps login; profile-type saves wait on the
  phone and sync later; money / chat / deals never queued.
- Admin speed: session lookup cached 30 s, pending-counts cached 20 s, badge poll 60 s only while visible.
- Android app with screens inside (android-app/, Capacitor 7, version 1.0.4 / code 5, same signing key → Play update),
  live updates via /api/app/android-update, Back never traps, Firebase push ready (backend/fcm.ts, needs FCM_SERVICE_ACCOUNT_JSON).
- Meta Pixel 965515649959745 (loads once, funnel events), Privacy policy mentions Pixel + GA. Version label v366.

## Tests
`npm run verify`: 232 test files / 2282 pass, 0 fail (tsc + crash guard OK). `npm run build` OK. Repo 971 files (< 1,000).
Deep black-box + white-box tests on the money flow: real routers + fake Supabase with the live columns + fake Razorpay.

## Needs Ravi
1. Deploy v366, then one small real test payment (brand sees ₹X + 8%, creator payout = full deal).
2. Admin → Waitlist → "Fetch Instagram for everyone" (page open) → approve the 44; then send the 2,500-creator file.
3. Delete the 3 half-made brand accounts: run the SQL from chat in Supabase → SQL Editor.
4. Make brand-fee coupons in Admin → Coupons.
5. Firebase project (google-services.json + FCM_SERVICE_ACCOUNT_JSON); give Mac access → Claude builds the Android app.
6. Ankit: Chrome → Site settings → ybexapp.ai.studio → Delete data, then log in again.

---

# v367 — Diwali Creator Challenge (21 Oct 2026)
Deploy **v367** only (it contains v363–v366). **No database change** — nothing to run in Supabase.

## How an entry works
Creator posts a reel about Ybex on Instagram (@ybex.in + #YbexDiwaliChallenge) → Ybex app → Profile → Portfolio → Add →
picks the reel → "Tag the brand" = **Ybex** (or any brand, if the caption has the hashtag / mention) → the
**"🪔 Submit to Diwali Challenge"** toggle shows, **ON by default** → saved = entry → "Entry #N is in! 🎉" sheet.
- Server checks every entry: entries open (till **2 Nov 2026, 11:59 PM IST**), creator role, onboarding complete,
  only instagram.com/reel or /p links, **max 3 per creator**, same reel never twice.
- Stored as a **signed stamp inside the portfolio item JSON** (`creator_profiles.portfolio`: challenge, challenge_at,
  challenge_sig). Winners the same way (challenge_rank + signature). A creator can't fake an entry or a prize.
- The locked portfolio save (`creators_routes.ts`) is unchanged. New: `backend/challenge_routes.ts`.

## Screens (brief points)
1. **/challenge** — public, no login (use it in ads + Instagram bio). Saffron hero, prizes, 4 steps, reel ideas, rules,
   live countdown from **server time**, pinned Join: logged out → sign up · onboarding not done → onboarding · done →
   Portfolio → Add opens straight away. From **5 Nov** it shows the winners. Meta Pixel event `ViewChallenge`.
2. **Tag the brand toggle** — default ON, off after 2 Nov; tells why it can't enter (profile not finished, not an
   Instagram reel/post link, 3 entries used).
3. **Entry done sheet** — "Entry #N is in! 🎉", reel thumbnail, "Tell your friends" (share / copy the challenge link).
   Pixel event `ChallengeEntry`.
4. **Creator Home card** — my entry (thumbnail, views, likes, days left) or "Make a reel about Ybex, win big" → /challenge.
   Not on the Profile hub.
5. **Home festive header** — Diwali lights + "Happy Diwali 🪔" (22 Oct → 8 Nov). **Poster banner = Admin → Banners**:
   upload `Diwali_banner_1200x400.jpg`, link `/challenge`.
6. **Launch popup = Admin → Promo popups** (existing system): layout Full screen, upload
   `Diwali_popup_1080x2340.jpg`, link `/challenge`, audience Creators, how often Once, end date 2 Nov 23:59.
7. **"🪔 Entry" ribbon** on the reel in my Portfolio and on the public profile (shows "1st prize" etc. after marking).
8. **Admin → Challenge entries** — creator, @handle, reel + thumbnail, views, likes, date; sort Most views / Most likes /
   Newest / Oldest; search; Winners only; Export CSV; **Mark winner** 1st / 2nd / 3rd / Top 20 (full admin only).

## Change before announcing
`src/lib/diwaliChallenge.ts`: `PRIZES` (all "To be announced" now) and `SPONSORS` (empty = "Powered by" hidden).
Dates are in the same file. All copy is English (app rule).

## Not done (as asked)
No Founding Creator badge, no badge on public profile / Explore, no bio line change, no card on the Profile hub.
Desktop: the challenge flow is the phone Portfolio screen; the old desktop portfolio editor has no toggle.

## Files
New: `src/lib/diwaliChallenge.ts`, `src/lib/challengeApi.js`, `backend/challenge_routes.ts`,
`src/components/challenge/ChallengeUi.jsx`, `src/pages/ChallengePage.jsx`, `src/components/admin/AdminChallengeEntries.jsx`,
`public/challenge-hero.webp`. Removed (unused): `src/unique_features.js`, `src/pages/creator/profileScreens/portfolioLinkInfo.js`.
Tests: `backend/v367Challenge.test.ts`, `src/components/challenge/challengeUi.test.jsx` (packed in dev/tests.tgz).

## Needs Ravi
1. Deploy v367. Open `/challenge` logged out (countdown, Join → sign up).
2. Test entry: post a test reel with #YbexDiwaliChallenge → Portfolio → Add → tag Ybex → toggle ON → "Entry #1".
   Check Admin → Challenge entries. Remove the test reel from your portfolio afterwards (that removes the entry).
3. Upload the banner (Admin → Banners) and the popup (Admin → Promo popups), both link `/challenge`.
4. Send prize / sponsor names when confirmed → I fill `PRIZES` / `SPONSORS`.
5. 5 Nov: Admin → Challenge entries → sort by views → Mark winner. /challenge shows them right away.

# v367 + launch screen fix (22 Oct 2026)
Same version label (v367); this zip replaces the earlier v367 zip. No database change.

## What changed
- **Android app 1.0.4:** opening the app shows only plain #7E00DC purple for a moment (no logo box — that box came
  from the old PWABuilder app 1.0.2), then the app's own animation (camera → flash → "Ybex." → shine) starts.
  A native launch-screen animation was tried and dropped (Ravi: didn't look right).
- **Shine repeat (all installed apps):** if the app is still loading after the intro, the shine sweeps "Ybex."
  again every 1.4 s until the screen is ready (index.html splash script).
- Android build targets API 36; launch images are plain #7E00DC (`android-app/scripts/mac-prepare-android.sh` step 4b).

`npm run verify`: 234 test files / 2301 pass, 0 fail.

## Order
1. Deploy this v367.
2. Test Ybex-1.0.4.apk on a phone, then upload Ybex-1.0.4.aab to Play → Closed testing.

---

# v368 — v367 deep test + fixes, Sponsors & prizes in Admin (22 Oct 2026)
Deploy **v368** only (contains v363–v367 and Ravi's launch-screen v367). **No new table or column.** Uses the
existing server-only table `ybex_ephemeral` (scripts/sql/ybex_ephemeral.sql, Session 22) — if it is missing, saving
sponsors says so and the challenge still works from the portfolio stamps.

## New: Admin → Challenge entries → "Sponsors & prizes"
One place: brand **name + logo upload + reel scripts** (up to 8 brands × 10 scripts) and the **prizes**. "Save everywhere"
→ /challenge "Powered by" logos, "Brand scripts" section (Copy button), Prize cards, the creator Home card
("Powered by …") and the Tag-the-brand toggle (tagging a sponsor brand also shows "Submit to Diwali Challenge").
Logos are shrunk in the browser (max 320×160 WebP). Only a full admin can save. Banner / popup images are pictures:
change those in Admin → Banners / Promo popups.

## Deep test (white-box + black-box) — found and fixed
1. Entry could silently vanish when a later save (old screen, second phone, desktop editor) dropped the stamp →
   server ledger keeps every entry; it counts while the reel is in the portfolio.
2. A marked prize could be wiped by the creator's own save → prizes live in the server ledger.
3. Anyone could type "1st prize" into their portfolio and show it on their public profile → ribbon shows only "🪔 Entry".
4. Rank visible to the creator before 5 Nov → hidden till results.
5. "Entry #…" instead of the number right after saving / on another server instance → own entries read fresh.
6. Desktop "Join" opened the Profile tab (no picker, no toggle) → phone Portfolio opens in a panel; button on desktop Portfolio tab.
7. Desktop edit of a portfolio item dropped its cover, views, likes and stamp (old bug) → fields kept.
8. "Finish later" creators were sent to Portfolio and then blocked → Join sends them to onboarding.
9. No way for existing users to log in from /challenge → "Already on Ybex? Log in" (comes back to /challenge).
10. "Add collabs" reopened on every visit after Join (?add=1 stayed) → cleared on close.
11. Many Home opens at once each scanned all creator profiles → one shared load per instance; only entrants read.
12. Stamp request link length unchecked → max 500 characters.
Checked OK: Ravi's splash shine loop, 2 Nov cut-off, 3-entry limit, forged stamps, sub-admin can't mark winners,
wrong phone clock (countdown uses server time).

Tests added: `backend/v367ChallengeBlackbox.test.ts` (real router over HTTP + fake Supabase), 
`src/components/challenge/challengeFlow.test.jsx` (taps end to end), more in `challengeUi.test.jsx`.

## Needs Ravi
1. Deploy v368. 2. Admin → Challenge entries → Sponsors & prizes → add brands, logos, scripts, prizes → Save everywhere
→ Preview /challenge. If it says "needs the table ybex_ephemeral": Supabase → SQL Editor → run scripts/sql/ybex_ephemeral.sql once.
3. Test entry as in v367. 4. Banner + popup as in v367 (those images don't change by themselves).

## v368 (same zip) — Offer links for banners and popups
- New stable link **`/offer`** = the current offer page (now the Diwali Creator Challenge; `/challenge` still works).
  Link banners / popups / ads to `/offer` and they keep working when the next offer (e.g. Christmas) replaces this one.
- Admin → **Promo popups** page picker: new group **Offers** ("Offer page", "Offer → Add my reel & enter").
- Admin → **Banners**: "Click-Through URL" now has the same page picker (was a typing box only). A pasted
  https://ybexapp.ai.studio/… link is turned into the app page, so it opens inside the app, not a browser tab.
- Next offer (after Diwali): the screens + entry rules are in `src/lib/diwaliChallenge.ts` and `src/pages/ChallengePage.jsx`;
  sponsors / scripts / prizes already come from Admin. A new offer = new look + its id / dates / hashtag (one build).

---

# v369 — Challenge dates set from Admin (22 Oct 2026)
Deploy **v369** only (contains everything up to v368). No database change.
- **Admin → Challenge entries → Sponsors & prizes → Dates:** "Entries close on" (that day, 11:59 PM IST) and
  "Winners shown from" (that day, 12:00 AM), plus quick buttons "Close in 7 / 10 / 14 / 21 days". Shows "N days from today".
  Save everywhere → the server, /challenge (countdown, deadline line, rules, pinned bar), Entry done sheet, creator
  Home card, the Tag-the-brand toggle and the Admin header all follow the new dates within a minute.
- Default until saved: **entries close 15 Nov 2026, 11:59 PM; winners 18 Nov.** Checks: close after the start and within
  120 days; results on/after close. Making the close date earlier removes entries made after the new close time.
- Diwali lights + "Happy Diwali" on Home stay fixed till Diwali (8 Nov); the challenge card / page stay on till a week after results.
- Banner + popup images no longer print a date ("Limited time", "1 reel = 1 entry") — upload the new ones.

---

# v370 — Website uses the app's sign-in (22 Oct 2026)
Deploy **v370** only (contains everything up to v369). No database change. **Deploy after the 23 Oct announce.**
- `/login` and `/signup` (and every "Sign In" / "Get Ybex" / "Sign up" link) now open the app's sign-in on the website:
  role cards (Creator / Brand) → **one email box** → the app checks the account:
  existing + password → password box, "Log in with OTP instead" below, "Forgot password?" · existing without password → email code ·
  other side → offer that side · admin email → "Open admin panel" · **new email → name, mobile, password (required), Terms →
  one email verification code → onboarding.** "Continue with Google" below (iPhone: Apple too) → straight to onboarding.
- Links keep working: `?role=creator|brand` (ads, blog CTAs) skips the role cards; `next` (e.g. /challenge), `utm_*`, `ref`, `email` stay.
  `/login?demo=1` keeps the old form (test server).
- "Not a brand? Continue as a Creator" (and the other way) under the email box — for a creator who taps a brand ad.
- On a computer the screens sit in a phone-sized card in the middle (they were made for phones).
- Meta Pixel `ViewSignupPage` now fires on /app and /app/continue/creator|brand (one view per visit, not two).
- Ads: give every ad link a role + its own UTM, e.g. `/signup?role=brand&utm_source=meta&utm_campaign=brand_diwali_ad1`.
Tests: `src/pages/app/webAuthV370.test.jsx` (links, ?next return, side switch, password required, Google on the web).

---

# v371 — Example reels on the offer page (22 Oct 2026)
Deploy **v371** only (contains everything up to v370). No database change (saved with the sponsors / prizes settings).
- **Admin → Challenge entries → Sponsors & prizes → Example reels:** upload up to **3 videos** (MP4 / MOV, under 30 MB each —
  the server takes about 32 MB per upload). The cover is made from the first frame. Caption (optional), Move, Remove.
  Stored in our own storage (bucket `banners`), full quality as uploaded. **Save everywhere** to show them.
- **/offer:** new "See an example" section (above Reel ideas): vertical reels that play **muted on a loop only while on
  screen** (saves people's data), cover first, tap or the speaker button for sound.
- Best export: vertical 1080×1920, 30–60 s, H.264 MP4, ~8–20 MB.
- **₹1,00,000 prize pool · 50 winners** (default, editable in Admin): 1st ₹20,000 · 2nd ₹12,000 · 3rd ₹8,000 ·
  ranks 4–10 ₹3,000 each · 11–20 ₹1,500 each · 21–50 ₹800 each. "Mark winner" now has 1st / 2nd / 3rd / Ranks 4–10 /
  11–20 / 21–50. Headline chips on /offer: prize pool · 50 winners · No joining fee (texts editable in Admin).
- **"Everyone who enters wins" box** (text editable in Admin — only promise what every valid entry really gets).
- **Trust:** "How you get paid" (bank within 7 working days of results after KYC · winners listed publicly · run by
  the Ybex team, support@ybexmedia.in), a **Questions** section (free? followers? payment? judging? more reels?),
  rules rewritten in plain English incl. "subject to applicable taxes, paid after KYC". ⚠️ Keep the 7-day promise.
- **Social proof:** entry / creator counts show only from 50; until then "No joining fee · Free for Instagram creators".
- **Join → "Is your reel ready?"** — "Yes, add my reel" (Portfolio → Add) or "Not yet — remind me" (saved; Home card
  says "Your reel is waiting"). Admin → Challenge entries → **Reminder list** CSV (name, email, phone, Instagram) of
  people who asked and haven't entered — use it for WhatsApp / email / push before the close date.
- **Entry without full onboarding:** a name + email or phone is enough; if the profile has no Instagram username, the
  toggle asks for it (saved with the entry). No name / contact → onboarding first.
- **Instagram / Facebook in-app browser** (where ads open): "Continue with Google" is hidden there (Google blocks it)
  with a line "tap ⋯ → Open in browser"; email sign-in shown first.

---

# v372 — Bugs from Ravi's screen recording + screenshots (22 Oct 2026)
Deploy **v372** only (contains everything up to v371). **No database change.** Found by watching the 73-sec
recording frame by frame + the live database logs.

## Fixed
| # | What Ravi saw | Cause | Fix |
|---|---|---|---|
| 1 | Admin: "Couldn't create the creator profile: null value in column email…" | live `creator_profiles.email` is NOT NULL; handle-only approvals / e-mail-less accounts sent null | falls back to the never-mailed `…@ybex.io` placeholder (approve + admin edit) |
| 2 | Profile showed "Category not set", "Add your city", no Instagram, Rate cards "Not set" | profile still loading / load failed → empty defaults shown as real | grey loading bars, red "Couldn't load · Retry"; **a save before the profile loads is refused** (every save sends the whole profile — it would have wiped category / city / Instagram) |
| 3 | Brand sheet: closed half-way → "Nothing added — those weren't brand collabs", tagged reel lost | X dropped everything already tagged | X now saves what's tagged |
| 4 | "Saving…" for long, X during save → old portfolio, "1 added" popped on Home later | covers + challenge stamp ran one after another; screen could close mid-save | both at the same time; X disabled while saving |
| 5 | Grid text showing through the tag sheet, the bottom bar ("Re0 selected"), the Entry #1 sheet, the brand sheet | 85–90% see-through + iPhone can't blur inside a blurred layer | sheets solid, bottom bar 95% |
| 6 | Keyboard pushed the tag sheet's top off screen | sheet taller than the space above the keyboard | preview hides while typing, height follows the visible screen |
| 7 | Photo post said "1 selected reel", "Tag 1 reel as Trek", "Instagram reel" | always "reel" | /p/ links say post |
| 8 | "Other work" card with empty purple cover | older onboarding picker saved no brand / cover | cover copied from Instagram once and saved; stack says "Tap to add the brand name", sheet opens straight in rename |
| 9 | Home: "24 days left" cut off under the shortcuts card | Quick Bar's -22px overlap slid over the challenge card | card moved below the Quick Bar |
| 10 | Home challenge card: heart with "—" | likes not given for that reel | unknown numbers hidden |
| 11 | @elite_ravi: "Couldn't find that account" + "Couldn't refresh" | every failure (no internet / server updating) showed "not found" | real reason: "Couldn't reach Ybex…", "not found" only for a real 404 |
| 12 | "Synced 2 days ago · refreshes daily" | hourly timer job doesn't run on Cloud Run (CPU paused between requests) | opening Social platforms refreshes numbers older than a day (≤ 6 s, once per 30 min) |
| 13 | "NOT VERIFIED YET" with no way to verify | DM / Instagram-login verify not switched on | shows "Live from Instagram" then |
| 14 | Bell kept "4" after opening notifications | list never marked seen | opening the list clears the bell (items stay highlighted on screen) |
| 16 | Admin → Waitlist: "Fetch failed" on every row (144) | Meta: "Cannot call API for app 913426198373843 on behalf of user …" — **Ybex's own IG_GRAPH_TOKEN was revoked**, not the creators | message says so; the run stops at once instead of marking every row; list shows "Ybex token expired" |
| 15 | Eva: "Psst… new campaigns are live" / "Your profile could shine more" to everyone | fixed lines | lines offer help instead of claiming |

`npm run verify`: 240 test files, 0 fail. `npm run build` OK. Repo 982 files (< 1,000).

## Not code (Ravi)
- **Renew IG_GRAPH_TOKEN (most important):** Meta stopped accepting Ybex's token (password change / app removed / permission
  revoked). Make a new long-lived token for the Facebook Page linked to Ybex's Instagram (instagram_basic +
  pages_read_engagement), put it in Cloud Run env, redeploy, then Admin → Waitlist → Fetch Instagram for everyone.
  Until then no Instagram fetch works (connect, refresh, portfolio picker, waitlist).
- "Complete your profile — Brands Find You" Home banner shows to complete profiles too: it's an image in Admin → Banners.
- DB session (optional): `alter table creator_profiles alter column email drop not null;` — see PENDING_DB_CHANGES.md.

## Diwali Home + opening poster (Ravi: "design wala Diwali dashboard app mein kyu nahi", "brand panel bhi",
## "Hopr jaisi opening screen", "footer bhi theme ke saath", "banner admin se hi rahe, powered by admin se")
Till Diwali night (8 Nov); after that everything goes back by itself.
- **Creator Home (design 2b) + Brand Home (2n):** saffron → magenta header, light rays, sparkles, string lights,
  "HAPPY DIWALI" + name in white, glass bell; big **"Diwali Dhamaka"** (Rye). Creator line "ZERO COMMISSION · KEEP 100%"
  (true: creators pay 0%). Brand line "FESTIVE COLLABS · VERIFIED CREATORS" — brands pay 8%, so no zero-commission
  promise (if Admin → Fees brand fee = 0, change `BRAND_LINE` in DiwaliHome.jsx).
- **Banner slot = Admin → Banners, unchanged** (nothing hardcoded) — it only gets a yellow festive frame. Upload the
  Diwali banner there (audience Creators / Brands).
- **Powered by** under the creator banner = Admin → Challenge entries → Sponsors & prizes (same list as /challenge):
  logo shown in white on the orange; a sponsor without logo shows its name. Change it in Admin, it changes here.
- Quick actions = cream festive tiles; arch with three diyas into a cream page.
- **Footer** (city art) turns warm: cream → peach ground, saffron city, "🪔 Happy Diwali from Ybex".
- **Opening poster (design 2l, Hopr-style):** right after the Ybex splash, once per app open, creators only, while
  entries are open: "Diwali · Creator Challenge" sign, "Win up to ₹1,00,000", "1st prize: …" (from Admin prizes),
  creators art, bottom panel with live countdown (server dates), Join Challenge → /challenge, Powered by (Admin).
  Closes by itself after 5 s (white time bar on top), or X. Promo popups wait while it shows.
- Files: new `src/components/challenge/DiwaliHome.jsx`, `src/components/challenge/DiwaliEntryScreen.jsx`,
  `public/diwali-entry-group.webp`; `CreatorHomeMobile.jsx`, `BrandHomeMobile.jsx`, `HomeCityFooter.jsx`, `App.jsx`
  (style switches + one mount — no server call changed).
- Not built (needs Ravi): points / +50 bio bonus / Founding badge.

## Portfolio flow (Ravi's "Ybex Portfolio Flow" design 4a / 3b / 3c + "alag alag size, collage jaisa")
- **4a Bento wall:** every piece on one wall. Pinned big = the Diwali entry (else the most viewed), "Pinned · top
  collab"; the rest in a mixed-size collage (tall / wide / small / big, packed dense). Brand chips on top filter the wall
  (All · Ybex media 2 · Sony 1 …). Tiles: "DIWALI ENTRY" pill, ▸ views / ♥ likes, brand initial + name; tap → brand
  sheet (rename / remove) as before. Dashed "Add a collab · N found on @handle" tile. Diwali strip at the bottom
  "Diwali entries · 1 of 3 · Ends <close date> · win up to ₹1,00,000 · Add entry" while entries are open.
  (The old stacks / grid switch is gone — the wall replaces both.)
- **3b Tag sheet:** compact reel row (thumb, "1 reel selected", views · posted date, X), "Which brand is this reel
  for?", search box, pick list (caption brand, "N reels already in your portfolio" ✓, other matches, "Create new brand
  “X”"), marigold Diwali strip "Submit as Diwali entry · Entry 2 of 3 · win up to ₹1,00,000" with an orange toggle,
  then "Not a brand collab" (left) + "Tag & enter" (right).
- **3c Entry confirmed:** festive header (rays, marigolds, sparkles, tilted reel cover, blue "ENTRY #2" badge),
  "You're in, Ravi!", three slots (Entry 1 ✓ In · Entry 2 ✓ In · + Entry 3 1 left), checklist (caption tags, keep
  public), Tell your friends, See prizes & rules.
- Files: `PortfolioViews.jsx` (PortfolioStacks = bento wall), `TagBrandSheet.jsx`, `ChallengeUi.jsx` (EntryDoneSheet),
  new `src/components/challenge/Festive.jsx` (marigolds, diya tile, sparkle), `PortfolioScreen.jsx` (props only).
  No server call changed.

Tests: `src/components/portfolio/v372Portfolio.test.jsx`, `backend/v372ApprovalEmail.test.ts`,
`src/components/challenge/diwaliHome.test.jsx` (packed in dev/tests.tgz).

## Website sign-in on a computer (Ravi: "web app ko app jaisa kaha tha, desktop ko nahi")
v370 put the app's sign-in in a phone-sized card on computers. Now (Ravi's canvas "Ybex Desktop Sign-in"):
- **≥1024px:** a real desktop page — site top bar (Ybex · Live Campaigns · Explore Creators · UGC Orders · Sign In ·
  Get Ybex), the app's purple carousel on the left (same 4 slides, auto-sliding, dots; creator side starts on the creator
  slide), and the same sign-in screens in a big white card on the right. Role screen gets "How will you use Ybex?".
  768–1023px keeps the phone card; phones unchanged. File: new `src/components/app/DesktopAuthFrame.jsx`;
  `AppLoginScreen.jsx` carousel moved into an exported `HeroCarousel` (same slides, same timing, same test ids).
- **Email → password in place (phone + computer):** an account with a password no longer jumps to another screen —
  the email box locks with "✓ Verified · Change", the password box slides open below, "Forgot password?" under it,
  "Log in with password", and right under it "Log in with OTP instead" (for anyone without a password).
  Accounts with no password still go to the code screen. Same server calls as before.

# v372 + Android app fixes (23 Oct 2026)
Same version label (v372); this zip replaces the earlier v372 zip. No database change.

## 1. Web updates never reached the installed apps (server fix — no app release needed)
- The live-update plugin (@capgo/capacitor-updater 7.x) refuses a bundle without its SHA-256 checksum
  ("Checksum required"), and the server didn't send one — so Android (and iPhone) apps stayed on their built-in screens.
- `scripts/ota-bundle.mjs` now writes `checksum` (SHA-256 of the zip) into ota/latest.json; `backend/appUpdate.ts`
  sends it with the update. After this deploy every installed app (1.0.4+) downloads new screens on open and shows them
  on the next open.

## 2. Android 1.0.4 crashed on open ("Ybex closed because this app has a bug")
- On phones where notifications were already allowed, the app asked Firebase for a push token at start; Firebase isn't
  set up yet (no google-services.json) and the push plugin's error closes the whole app.
- `src/lib/nativePush.js`: Android push stays off (`ANDROID_FCM_READY = false`) until Firebase is added — then set it to
  true in the same Android release that carries google-services.json.

## 3. Home-screen icon became the default blue Capacitor icon (Android 8+)
- The adaptive icon layers were never made. Now purple gradient + white "Ybex." (`android-app/icon/`, copied by
  `mac-prepare-android.sh` before `npm run assets`). Script also sets minSdk 24 (Play protection needs it).

## Play Store
- 1.0.4 (code 5) went out with the crash; 1.0.5 (code 6, crash fix) sent for review 22 Oct.
- **1.0.6 (code 7) = crash fix + icon**, built from this zip — upload to Closed testing.
- `mac-prepare-android.sh` still says 1.0.4 / code 5 (a test pins it); the next Mac build must use 1.0.7 / code 8+.

`npm run verify`: 240 test files / 2372 pass, 0 fail (tsc + crash guard OK).

## Needs Ravi
1. Deploy this v372.
2. Open the Android app twice → new screens should show.
3. Play Console → Closed testing → new release → upload Ybex-1.0.6.aab.

# v373 — Deep black-box + white-box test, Diwali Challenge first (23 Oct 2026)
No database change. Ravi: "deep testing, ek ek chij as a user chalao, chote se chota bug fix, Diwali campaign priority".

## How it was tested
- **Black-box on the real server**: `dist/server.cjs` (production build) run against an in-memory Supabase stand-in
  (PostgREST + Storage, 1,000-row page limit like Supabase). 30 API checks over HTTP: logged out / brand / no-name
  creator refused, bad link, duplicate reel, 3-entry limit, forged stamp, stamp dropped by a later save (ledger keeps it),
  winners (full admin only, hidden before results), sponsors/prizes/dates config, reminders. All pass.
- **In a real browser** (Chromium, 360×640, 360×740, 390×844 phones + 1366 desktop), as each user: the whole entry flow
  (/challenge → Join → "Is your reel ready?" → Add collabs → paste link → tag Ybex → Entry #1 sheet), entering a reel
  already in the portfolio, creator + brand Diwali Home, Admin → Challenge entries / mark winner / Sponsors & prizes,
  and a crawl of 70 screens (logged out, creator, brand, every admin tab): no crash, no page error, no 5xx.

## Diwali Challenge fixes
1. **Opening poster popped up over "Add collabs"** right after "Yes, add my reel" on /challenge and sent the creator back
   to /challenge. Not shown any more once the offer page was opened this session, or on an `?add=1` screen.
2. **Poster on small phones**: the creators art covered "Win up to ₹1,00,000" on 360×640. The art now takes only the
   space left (gone on very short screens); text sits above it.
3. **A reel already in the portfolio could never be entered** (added before the challenge, toggle off, or the entry
   failed) — Add collabs hides it as a duplicate. Brand sheet → each such Ybex / sponsor / hashtag reel has **🪔 Enter**
   (asks the Instagram username there if missing). Old items with an id the server refuses get a clean id first.
4. **No username → saved but not entered** (v371 rule kept, a test pins it) was silent; the sheet now says it under the
   username box.
5. **Views / likes were frozen at the day the reel was added** (nothing refreshed them) and winners are picked on them.
   Admin → Challenge entries → **Refresh numbers** (`POST /admin/challenge/refresh-stats`, 5 creators per call, step by
   step) reads each entrant's last 25 Instagram posts: live views / likes into the ledger (by shortcode), plus a
   **Hashtag** column (✓ in caption / ✗ missing / reel not found) and both in the CSV. Needs IG_GRAPH_TOKEN working
   (renew it — v372 note); stops with a clear message on a token / rate-limit error. Creator card no longer says "Views
   update daily". The purple button is now "Reload list" (it sat next to "Refresh numbers").
6. **Ledger past 1,000 rows**: Supabase returns max 1,000 rows per request, so with more entrants + reminders the rest
   (and their prizes) were silently skipped. Read in pages now.
7. **4th entry by double tap / two phones**: two stamp requests at once each saw "2 left". One stamp request at a time
   per creator, and stamps handed out in the last 15 min that aren't saved yet hold their slot.
8. App open asked `/challenge/public` 3× (poster, Home, page) — one shared answer for 20 s (server time kept moving).
9. Removing a Diwali entry now says it leaves the challenge. Entry slots: "2 left" once, then "Open". Poster retries
   if the page changed while the splash was on. Tag sheet: "Pasted link" (not "From your Instagram"), "N already in
   your portfolio" (no "reels" for posts), 1-letter usernames allowed like the server.

## Landing page
The v373 change to the brand fee lines on the landing was **undone** (Ravi: "brands ko 0 hi dikhana hai — fees mere
according kam kar dunga"). The landing is exactly as in v372 again ("Zero platform fee for brands", savings box
"Ybex fee (0%) ₹0"). Ravi sets the brand fee in Admin → Fees so checkout matches.

## Not changed (needs Ravi)
- Logged-out **Join** still opens `/signup?role=creator` (a test pins it). An existing creator who logs in there lands on
  Home, not back on /challenge. Say OK to add `&next=/challenge`.
- Sub-admins see Challenge entries only with the "manage_users" permission (by design, v367).

New tests: backend/v373ChallengeDeep.test.ts, src/components/challenge/v373ChallengeDeep.test.jsx,
src/components/challenge/v373Poster.test.jsx (in dev/tests.tgz).

# v374 — Automatic emails redesigned (23 Oct 2026)
No database change. Ravi: redesign the automatic emails, subjects that say the point first (plain English), keep the
"Wanted to personally reach out" welcome as it is, keep the current sender (noreply), stop the admin email on every
sign-up, and no Diwali Challenge emails in code (he sends them himself).

## What changed
- **New look for every automatic email** (`backend/helpers.ts` → `buildEmailHtml`, same arguments): deep-purple band,
  big heading, dark button, Help / Privacy footer and why the person got it; optional inbox preview line, top label,
  icon, fact rows (`emailFactsHtml`). The old look lives on as `buildLegacyEmailHtml`, used only by the personal
  welcome (text, subject and sender unchanged).
- **Campaign invite button opened "undefined"** (locked creators_routes passes `button.url`): the builder reads
  `url` too, so the button works without touching the locked file.
- **Notice emails** (`activityEmailCopy` in notificationService.ts): a rejected campaign got the "Content revision
  requested" email with a deals button → its own email to My campaigns. Campaign live, payment held, refunds, refund
  account needed, deal settled, admin reminders and messages got "New activity on Ybex Media" + a Home button → each
  has its own subject and the right page (KYC → /kyc, payout → /earnings, profile approved → /profile …). Subjects
  without emoji (admin "💸 Payout request waiting" kept — a test pins it).
- **Support reply sent 2 emails** → one, and its button opens that ticket (/support/tickets/<id>).
- **No admin email per sign-up** (it used the daily email limit OTP codes need). The admin bell notice stays.
- **Waitlist approval** (single + bulk): "Riya, brands in Fashion are waiting. Claim your Ybex profile." — niche from
  the application, Instagram / followers / avg views, button to sign-up with the e-mail already filled in, 3 next
  steps. Reject email: "Your Ybex application: what to fix before you apply again". CSV-imported rows still get no
  email (session 36 rule). Bulk approve waits 550 ms between emails (`BULK_EMAIL_GAP_MS`) — Resend takes ~2 a second.
- **Pitch email**: button used `url` (dead) and the old /auth/register; fallback domain was ybex.club → fixed;
  "<Brand> wants to pay you ₹… for a collab"; typed text escaped.
- Onboarding reminders and UGC deadline emails: new subjects (no emoji, the point first).

## Not changed
Sender addresses; locked files (campaign invite subject, signing email, payment / UGC refund emails keep their text —
they get the new look through the builder); Diwali emails (none in code).
New test: backend/v373Emails.test.ts.

## v374 (same zip) — New tagline (text only)
- Main line **"Influence, without the middleman."** · creators **"Create. Get found. Get paid."** · descriptor
  **"India's 0% fee creator marketplace."**
- Where: page title (index.html + Landing.jsx runtime title, keeps "India's creator marketplace" for search), meta /
  og / twitter title + description, og:image:alt, PWA name + description (short_name stays "Ybex"), landing hero
  heading + line (mobile + desktop, same 3-line spans, no animation change), the "I'm a creator" heading, email footer.
- The OG share picture itself is an image — make a new one if it shows old text.

## v374 (same zip) — Waitlist: live on top, filters, smarter Instagram fetch, sign-up password eye
- **Order** (creators tab): pending + Instagram live (most followers first) → pending not fetched → pending private /
  failed → approved → rejected. Approving moves the row down at once.
- **Filters**: new "Instagram" (live / private-failed / not fetched, with counts) and "Contact" (username only / has
  email / has mobile) next to Status, Platform and Category; all combine.
- **Fetch Instagram for everyone** now fetches only usernames never fetched before (pending waitlist first). Tick
  "Also refresh ones fetched 7+ days ago" for a full refresh.
- **Hourly budget kept for sign-ups**: bulk fetch and auto refresh use at most 100 of the 180 calls an hour
  (`IG_SIGNUP_RESERVE`, default 80 kept) and stop when Meta's usage header says 70 %. So onboarding lookups don't get
  "Instagram is busy" because of a bulk run.
- **Auto refresh** (new usernames first — e.g. sign-ups whose lookup was busy — then anyone fetched 7+ days ago):
  `POST /api/internal/cron/instagram-refresh`, header `x-cron-secret: <CRON_SECRET>`. **Ravi: add a Cloud Scheduler
  job** (Google Cloud → Cloud Scheduler → Create job → every hour `0 * * * *`, Asia/Kolkata → Target HTTP, POST, the
  URL above on the live domain, header `x-cron-secret` = the CRON_SECRET value). Same as the onboarding-reminders job.
- Sign-up password ("Create a password") has the show / hide eye like the login one.
New test: backend/v374Waitlist.test.ts.

# v375 — Search title, brand onboarding "Instagram first", brand names in Admin (23 Oct 2026)
Contains everything up to v374, including the Android fixes (live-update checksum, push crash guard, adaptive icon files).

## Database (applied live 23 Oct, Ravi's OK in chat)
- `alter table brand_profiles add column if not exists instagram_handle text;` (migration
  `v375_brand_instagram_handle`, additive — old code ignores it). Back-filled from onboarding answers (1 brand: Ghost).

## 1. Google title + description
- Title (index.html `<title>`, og:title, twitter:title, landing runtime title):
  **"Ybex | Find Influencers & Get Brand Deals — 0% Fee"**.
- Description (meta / og / twitter): "Brands hire verified Instagram creators directly, creators get paid brand deals.
  India's 0% fee creator marketplace." ("Influence, without the middleman." stays only as the landing hero line.)

## 2. Brand onboarding step 1 — Instagram first (Ravi's design, on ONE page)
- "What's your brand's Instagram?" + one box. The answer shows right under it:
  - found → **"Is this your brand?"** card (photo, name, @handle · followers, bio, last posts) →
    **Yes, that's us** / **Not us, change username** (clears the box);
  - Instagram busy / no answer in 4 s → one small line "Instagram is busy right now. Tap Continue and add your logo and
    name yourself" + **Continue**; retries by itself **once** after 12 s, then a "Try again" link;
  - private / personal / typo → calm line + **Continue without Instagram**;
  - **No Instagram? Set up manually** always works; Instagram fetch switched off → Find my brand goes straight on.
- Details page: logo, company name, agency (+ website only when Instagram gave one). Pre-filled after "Yes, that's us"
  (logo = our stored copy, name only if empty); typed by hand otherwise, as before. No background job for brands.
- The brand's Instagram **username is saved** in `brand_profiles.instagram_handle` (`backend/auth_routes.ts`,
  `brandIgHandle`; a DB without the column still saves the rest).
- The 4 brands stuck on the old step 1 (Deepak Kumar, DEEPAK SHARMA, Ankit tomar, Synkraft) never typed a company name —
  this screen no longer blocks them.
- IgHandleField: new optional props quiet / onResult / fetchSignal / onConfig / autoFocus (other screens unchanged).
- Desktop brand onboarding unchanged.

## 3. Admin → Users → Brands shows the brand's name
- Brand rows show the company name, the person who signed up underneath ("by Ravi"). Not finished setup → the name
  typed in onboarding (from onboarding_progress) or the person's name + a "Setup not finished" tag. Search finds company
  names. (`backend/admin_users_enforcement_routes.ts` → `brand_setup`, `src/components/admin/AdminUsersTab.jsx`)

## 4. One secret instead of many: YBEX_ENV
- New `backend/envBundle.ts`, imported FIRST in `server.ts`: a hosting secret **YBEX_ENV** holding a .env-style block
  (`NAME=value` per line, `#` comments) fills every missing setting at start-up. A setting set on its own always wins;
  values are never logged (only the names). Keys stay out of the code / GitHub.
- Ravi got a ready template (YBEX_ENV_template.txt, NOT in the repo) with every setting the server reads: App, Supabase,
  Razorpay, Resend, Google, VAPID, server secrets, Instagram / Meta, Gemini, FCM. VITE_* stay as build settings.

## 5. Payment screen
- **No UPI (Paytm / PhonePe / UPI ID) in the Play Store app's Razorpay sheet**: UPI IS activated on the Razorpay
  live account (Ravi's screenshots) and the website in phone Chrome shows all UPI apps. Inside the Android app the
  checkout runs in a WebView, where Razorpay hides UPI apps unless `webview_intent: true` is set → added to
  `src/lib/razorpay.js` (LOCKED) with Ravi's written OK ("razorpay.js mein webview_intent OK"), logged. Tapping an app
  opens it through a `upi://` link, which the Capacitor app already hands to Android. Reaches the app with the web
  deploy; if UPI still doesn't open in the app, the next Play build (1.0.7) gets a look. "Enter UPI ID" (collect) is
  being phased out by Razorpay/NPCI, so the box may not come back — the UPI apps are the way.
- **Razorpay header**: the real Ybex logo (`public/pwa-512x512.png`, absolute address so it also works in the Android
  app) instead of the "Y" letter box, no "Ybex" text. `src/lib/razorpay.js` (LOCKED) changed with Ravi's written OK,
  logged via `npm run protect:update`. The person icon top-right is Razorpay's own button (can't show the user's name);
  the "Your campaign starts soon!" strip is not in our code — Razorpay Dashboard checkout settings.
- **"You're offline" on the Play app's pay screen while online**: inside the Android app the WebView's online flag is no
  longer trusted for actions — the request is sent, and only a real network failure shows the offline line
  (`src/lib/api.js`). The payment total (`BrandFeeSummary.jsx`) asks again once online / after 4 s and has a Retry link.

## 6. Earnings page stuck on "Your earnings are safe"
- Live logs: every Earnings open → database 400 on `deals?select=*,campaigns(title),transactions(*)`. `deals.campaign_id`
  has no foreign key to `campaigns`, so the join is refused, `/creator/payout-eligible-deals` answered 503 and the page
  showed the retry card to every creator with a brand-approved deal. Fix in `backend/payment_routes.ts` (LOCKED, Ravi's
  written OK "payment_routes.ts earnings fix OK", logged): deals read with `transactions(*)` only, campaign titles
  looked up separately (a missing title never blocks the page). Money logic unchanged. No DB change.

## Play Store
- 1.0.6 (code 7, crash fix + Ybex icon) sent for review in Closed testing on 23 Oct (built from this code).
- `mac-prepare-android.sh` still says 1.0.4 / code 5 (a test pins it); the next Mac build must use 1.0.7 / code 8+.

New tests: backend/v375BrandIgFirst.test.ts (real page render, fake network), backend/v375EnvBundle.test.ts,
backend/v375PayFixes.test.ts.
`npm run verify`: 248 test files / 2420 pass, 0 fail (tsc + crash guard OK).

## Needs Ravi
1. Optional: Razorpay Dashboard → remove the "Your campaign starts soon!" checkout strip.
2. Optional: AI Studio → Secrets → YBEX_ENV = the filled template (the separate secrets can stay too).
3. Deploy v375.
4. After deploy: open the Android app twice → new screens; testers log in once after the 1.0.6 update.

## Next chat — start here (23 Oct night)
- **Live:** v375 deployed by Ravi (23 Oct). Last zip: `ybex-v375.zip` (folder inside: `ybex-v375`).
- **Play Store (Closed testing / Alpha):** 1.0.4 (code 5) crashed · 1.0.5 (code 6) crash fix · **1.0.6 (code 7)** icon +
  crash fix, sent for review 23 Oct. 12 testers opted in → production apply possible about **4 Nov**.
  Account "Melting Eve Studios", app id 4975973704419362721.
- **Next Android build must be 1.0.7 / code 8 or higher.** Signing key = the one in Ravi's "Ybex - Google Play package"
  zip (alias `my-key-alias`) — never put it in the code zip. minSdk 24, target 36. Web changes reach the app by itself
  (OTA, open the app twice); a new AAB is only needed for native changes.
- **Push in the Android app is off** (`ANDROID_FCM_READY=false`) until Firebase + `google-services.json` exist.
- **Check after deploy:** UPI apps inside the Play app's Razorpay sheet (`webview_intent`); Earnings page opens for
  creators with approved deals.

# v376 — Live test of ybexmedia.in as a real user (24 Oct 2026)
Deploy **v376** only (contains everything up to v375). **No database change.** Tested on the live site in a browser
(phone 375px + desktop 1366px): landing, /offer, sign-up (role → email → new-account form, stopped before creating),
desktop sign-in, Campaigns, Explore creators, a public creator profile, Blog, Help, Terms, Privacy, Refunds,
Delete account, Apply, UGC orders, 404, robots.txt, sitemap.xml, the public APIs.

## Fixed in code
1. **Google saw the wrong domain**: robots.txt, sitemap.xml and every blog canonical said `https://ybexapp.ai.studio`
   (APP_URL). `backend/blogSeo.ts` → `siteUrlFor`: SITE_URL first; an *.ai.studio / *.run.app APP_URL is never the
   public site → `https://ybexmedia.in`.
2. **Header "Sign In" / "Get Ybex" wrapped onto two lines** on 375px phones (Campaigns, Explore, Blog, profiles):
   `whitespace-nowrap` (`Layout.jsx`).
3. **Public creator profile → "Sign in to collaborate"** lost the creator: now `/login?role=brand&next=/creator/<id>`.
4. /offer screen-reader line read a raw ISO date → "15 Nov, 11:59 PM (IST)".
Version label v376. Test: `backend/v376SiteUrl.test.ts` (in dev/tests.tgz). `npm run verify`: 248 files / 2420 pass.

## Needs Ravi (not code)
1. 🔴 **DEMO_LOGIN is ON on the live server** (`/api/auth/demo-enabled` → true, "Demo access (test server)" link on
   the sign-in page). With it on, the token `dev_bypass_admin` is a Super Admin with no password. AI Studio →
   Secrets (and inside YBEX_ENV if pasted there): remove DEMO_LOGIN or set it to `false`. Also check
   PAYMENTS_TEST_MODE is `false` and OTP_ECHO / DEMO_SEED are empty (local.env has the Mac test values — never paste it).
2. Optional: SITE_URL = `https://ybexmedia.in` (same result as fix 1).
3. index.html og:image / og:url still say ybexapp.ai.studio (a test pins it — say OK to change).
4. Landing claims to check: testimonials from boAt / Noise / Nykaa with numbers, "All reviews are from active creators
   and brands registered on Ybex", "Available on the Play Store and the App Store" (both buttons open /signup), brand
   logos (Titan, cult.fit, Fevicol, Beardo…) on sign-in / apply pages. Keep only what is true.
5. Landing / Terms say ₹0 fee for brands while checkout adds the Admin brand fee (8% unless changed) — set it to 0 in
   Admin → Fees or show it.
6. 0 live campaigns and 0 UGC briefs right now — "Live Campaigns" link shows an empty page to ad traffic.
7. Challenge results date is 16 Nov 00:00 (1 second after close) — fine if winners are marked fast, else move it.

## v376 (same zip) — Easy sign-up + demo login off on live (24 Oct 2026)
Ravi: "ads se 111 log signup page pe aaye, sirf 3 ne account banaya — signup easy karo". No database change
(checked live: users.phone is `+91XXXXXXXXXX`, no unique index → the code looks the number up first).

1. **Sign-up screen** (`src/pages/app/AppContinue.jsx`): big **Continue with Google** on top → "or" → creators:
   **Instagram username + mobile → "Get OTP on SMS"** → 6-digit code → done. "Use email instead" below.
   Inside the Instagram / Facebook app browser (where ads open) Google is refused by Google: Android opens the page
   in Chrome, iPhone shows "tap ⋯ → Open in browser" and the mobile option.
2. **Mobile + SMS code** (`backend/auth_routes.ts` → /auth/phone/config|send|verify, `backend/smsOtp.ts`): new account
   with a never-mailed `phone-91XXXXXXXXXX@ybex.io` email, no password, name = @instagram; same number later = log
   in; a waitlist "unclaimed" profile with that number is claimed; admin / banned / other-side refused. Codes in
   ybex_ephemeral (10 min, 3 SMS / 15 min per number, 10 per IP). **Hidden until an SMS key is set** (see Needs Ravi).
3. **No password at sign-up**: a new email gets the code at once (no name / mobile / password form). Password later
   in Settings → Account → Password (already there, emailed code).
4. **Creators skip onboarding**: after any sign-in a creator lands on Home (same switch as "Finish later");
   "Complete your profile" on Home brings them back. The Instagram username from sign-up pre-fills onboarding and the
   challenge username box. Brands still go to brand onboarding (company details).
5. **Offer page → sign-up → back to /challenge?joined=1** with an "Add your reel" card on top (new creators who
   opened /offer or /challenge on that phone in the last 3 days). Logged-in creators' button says "Add your reel".
6. **Meta CompleteRegistration** fires the moment the account is made (email code, SMS code, Google / Apple), once per
   account (`src/lib/signupSource.js` → `trackRegistration`); the old one-hour check stays as a fallback.
7. **Demo login / OTP echo can't be on on the live server** (`backend/liveServer.ts`): live Razorpay key, or
   APP_URL / SITE_URL = ybexmedia.in / ybexapp.ai.studio → DEMO_LOGIN and OTP echo are off whatever the secrets say.
Tests: `backend/v376EasySignup.test.ts` (phone sign-up over HTTP with a fake SMS provider). Old tests that pinned
"password required at sign-up" (v291 / v370 / v374) updated to Ravi's new rule. `npm run verify`: 250 files, 2435 pass.

### Needs Ravi
1. Deploy v376.
2. **SMS for the mobile option** — pick one, put the key in AI Studio → Secrets (or YBEX_ENV), redeploy:
   - Fast2SMS (fastest): fast2sms.com → sign up → recharge (₹100+) → Dev API → copy key → `FAST2SMS_API_KEY`.
     The OTP route needs "website verification" once in their dashboard (ybexmedia.in).
   - or MSG91: `MSG91_AUTH_KEY` + `MSG91_OTP_TEMPLATE_ID` (needs a DLT-approved OTP template).
   Until then the screen shows Google + email (no password) — already much shorter.
3. Still remove DEMO_LOGIN from the secrets (the code now blocks it on live anyway) and check PAYMENTS_TEST_MODE=false.

## v376 (same zip) — Creators join on ONE screen, no code / no password; one YBEX_ENV secret (24 Oct 2026)
Ravi: "Join Now pe sirf ek screen … saare creators ke liye, brands ka purana". No database change.
- **Creator sign-up screen** (`AppContinue.jsx`, creator side): big Continue with Google → or → **Instagram username +
  Email + WhatsApp number → "Join Ybex"** → in straight away (POST `/auth/quick-join`: account + session, no password,
  email `verified=false`). "Already on Ybex? Log in" opens the usual email-code / password login. An email that already
  has an account is NEVER opened without proof: the app moves to the email-code (or password) login; a waitlist /
  unfinished email gets the 6-digit code. Brands: unchanged email-code sign-up (v376 part 2).
- **Email confirmed later by a link**: "Confirm your email for Ybex" (signed link → `GET /api/auth/verify-link` →
  verified, opens /dashboard). Until then a password login is refused (old rule) and full onboarding asks the email code.
- **Google / Apple sign-up**: new creators see "One last step" (`/app/details`, `AppQuickDetails.jsx`): Instagram +
  WhatsApp → `POST /auth/quick-profile` → Home (or the challenge). "Skip for now" below.
- **Instagram numbers fetched at once** (followers / reach / photo, same as the waitlist — `/creator/instagram/lookup`
  on the new profile row). Needs IG_GRAPH_TOKEN working (renew it — v372 note); if not, the profile just has the username.
- Offer-page creators → `/challenge?joined=1` ("Add your reel"); everyone else → Home with "Complete your profile";
  the onboarding reminder emails (1 and 3 days) already run from Cloud Scheduler. Pixel CompleteRegistration on join.
- **One secret**: `.env.example` (what AI Studio asks for) now lists only `YBEX_ENV` (+ GEMINI_API_KEY, which AI Studio
  gives). Full fill-in list: `docs/setup/YBEX_ENV_template.txt` (Supabase, Razorpay, Google client id + secret,
  Cloudflare PROXY_SHARED_SECRET, VAPID, Resend, Instagram, Firebase, Apple, …). The website build also reads its
  VITE_* lines from YBEX_ENV (`vite.config.js`).
Tests: + creators' join over HTTP in `backend/v376EasySignup.test.ts`. `npm run verify`: 250 files / 2440 pass.

### Needs Ravi (replaces the list above)
1. AI Studio → Secrets → `YBEX_ENV` = `docs/setup/YBEX_ENV_template.txt` with your values (copy them from the old
   separate secrets once). Remove `DEMO_LOGIN`. Then deploy v376.
2. After deploy: open ybexmedia.in/offer on a phone → Join → fill the 3 boxes → you should land on the challenge page.
3. Renew IG_GRAPH_TOKEN (Instagram numbers on sign-up need it).

## v376 (same zip) — FINAL creator join: email code first, then Instagram + WhatsApp; offer page tweaks (24 Oct 2026)
Ravi: "account bina email verify ke mat banao … email daalte hi neeche OTP khule, verify ke baad username + mobile, phir
dashboard. Google ke baad username + WhatsApp zaroor poocho." This REPLACES the "no code" join above.
- Creator screen: Continue with Google on top → or → **email → Continue → the 6-digit code box opens under the email**
  (email locks, "Change") → code right → "✓ Verified" → **Instagram username + WhatsApp open under it** → **Join Ybex**
  → account made (verified) → Home / challenge. `POST /auth/join/send-code`, `/auth/join/verify-code` (30-min signed
  proof), `/auth/quick-join` (refuses without the proof). No account exists until the last step. Existing email →
  normal login (password slides open / email code). Waitlist email → claimed after the code.
- Google: "One last step" (Instagram + WhatsApp) is REQUIRED now (no skip).
- Offer page: "Reel ideas" section removed. Admin → Sponsors & prizes: scripts can be saved with NO name / logo
  (they show as "Reel scripts" / under the brand scripts without a brand line; `config.scripts`). Small line at the top of
  the scripts: "✨ Or make your own reel about Ybex, your way. If it's good, it can win too." (above "T&C Apply*").
  Tip: the sponsor you named "T&C Apply*" can now have an empty name.
`npm run verify`: 250 files / 2441 pass.

### v376 last change (Ravi's screenshot): join screen layout
Email + Instagram username + WhatsApp are all on the screen from the start. The email code goes out BY ITSELF (when the
email box is left, or 1.5 s after typing stops). ONE simple code box drops down under the email (like the password box,
with "Resend" inside it); the right code folds it back up and the email shows "✓ Verified". Then "Join Ybex".

---

## v377: Diwali Challenge v2 "Easy Entry" (handoff md)

**New rule (shown everywhere):** post ANY reel of your own → tag @ybex.in + #Ybex #YbexDiwaliChallenge → add it to the
Ybex Portfolio with the Diwali toggle ON = entry. Entries close 15 Nov 11:59 PM, winners 18 Nov.
Live config `challengecfg:diwali2026` → `results_at` set to 2026-11-17T18:30:00Z (= 18 Nov 00:00 IST) directly in Supabase.

**₹50 recharge:** first 300 creators (one per creator, earliest non-rejected entry, rejected ones drop out and free a slot).
Admin ticks "Sent" only after Approve. Counter on /offer: "₹50 recharge: X of 300 left · N creators entered".

**Files changed**
- `src/lib/diwaliChallenge.ts`: TAGS_LINE, RECHARGE_* constants, captionChecks(), qualifies() always true (any reel), share text.
- `backend/challenge_routes.ts`: caption/tag + posted-after-start checks, review status, recharge order; new admin routes
  `POST /admin/challenge/review`, `POST /admin/challenge/recharge`, `GET /admin/challenge/no-reel`; public counts + recharge_left.
- `backend/instagramAutofill.ts`: caption kept up to 800 chars (to read hashtags).
- `src/lib/challengeApi.js`, `src/components/admin/AdminChallengeEntries.jsx`: status filter, Approve/Reject, CHECKS column,
  ₹50 RECHARGE place + Sent checkbox, "No reel yet" list with WhatsApp nudge links, CSV (whatsapp, email, status, recharge).
- `src/components/portfolio/AddCollabsScreen.jsx` + `PortfolioScreen.jsx`: `?diwali=1` opens "Add your Diwali reel" with toggle ON,
  no upload tab / brand sheet, "Submit entry".
- `src/components/challenge/ChallengeUi.jsx`: Entry done sheet (Results 18 Nov, ₹50 line, Share on WhatsApp, Go to dashboard),
  Home card "Add your Diwali reel to enter".
- `src/pages/ChallengePage.jsx`: new hero/subline/badge/counters/3 steps/FAQ/rules; Reel ideas gone.
- `backend/oauth_routes.ts`: Google redirect_uri uses ybexmedia.in when the request came through ybexmedia.in (x-forwarded-host).
- `src/index.jsx`: "new version ready" popup removed, service worker updates silently.
- `AdminPromoPopups.jsx`: offer link → Diwali add screen. `appVersion.js` → v377.
- Tests: new `backend/v377ChallengeV2.test.ts`, `src/components/portfolio/v377Diwali.test.jsx`; older challenge tests updated
  only where Ravi's new rule replaced the old one. 252 files / 2450 tests pass. No locked files touched, no new tables.

**Not built:** automatic push/email reminders for "no reel yet" creators. Use the admin "No reel yet" list (WhatsApp links + CSV).

**Ravi to do:** deploy v377 (one deploy). Update the admin brand scripts (they still say "reel for Ybex", now any reel works).
Run the handoff test checklist on a fresh mobile browser.

### v377 later changes
- /offer hero tidied: one prize pill + "50 winners · No joining fee" line, one green ₹50 card with the live counter, a "T&C Apply*" sponsor shows as a small note under the logos.
- Ravi: the ₹50 is now **UPI cash** (not a mobile recharge). All screens say "₹50 UPI cash" / "₹50 on UPI"; admin column "₹50 UPI". Pay it by UPI to the creator's WhatsApp number, then tick "Sent". (Internal names still say recharge.)
- Mac local run: save YBEX_ENV as YBEX_ENV.txt in the folder; `scripts/mac-local.sh` copies it to .env, switches off live Razorpay keys, uses the project's own tsx.
- /offer hero rebuilt from Ravi's "Diwali Challenge v3" design (screen 3a): small Diwali badge, "Apni reel me #Ybex use karo & @ybex.in tag karo, jeeto", big ₹1,00,000, "₹50 FREE CASH" card (UPI / GPay / PhonePe / Paytm logos, live "Only N left", falling-cash coin), big "Free me register karo" button, live "N creators already joined", T&C line; sponsors moved under the hero. Logos live in one file `src/components/challenge/payLogos.js`. The rest of the page (countdown, prizes, scripts, FAQ, rules) is unchanged. "Instant / Paid instantly" from the design is left out: the ₹50 is sent by hand after approval.
- Ravi: the ₹50 is paid only after Approve **and a complete profile** (photo, niche & bio, Instagram, rate card, past work — the same 5 parts as Home's profile strength). Admin → Challenge entries shows "Profile complete" or "Profile 60% · needs …" under each ₹50 place; the Sent tick unlocks only when both are true. FAQ, rules and the entry-done text say "with a complete profile" (Ravi: not in the hero line).
- Android app (Ravi's screenshots): headers sat under the clock (the app drew under the status bar and Android's web view reports no safe-area gap). `src/lib/native.js` now calls `StatusBar.setOverlaysWebView({overlay:false})` on Android, and `StatusBarSync` colours the bar from the page's top colour with dark/light icons. Ships with the web deploy (live update); the app must be closed and opened once to pick it up. Home's Diwali header: string of lights removed.
- App-open 5-second screen (DiwaliEntryScreen): "1st prize" line replaced by the v3 "₹50 FREE CASH · First 300 creators · Paid to UPI" card (UPI / GPay / PhonePe / Paytm), text "Use #Ybex & tag @ybex.in in your reel, then add it in your Ybex portfolio." Profile entry card (3f) not wanted (Ravi).
- App-open screen now follows Ravi's "Diwali Entry Animated" design: animated coin + "₹50 FREE CASH · on completing profile · First 300 creators · Paid to UPI" card (CashRain now lives in ChallengeUi.jsx, shared with /offer). "Instant" and "We pick it up on our own" left out (not true yet).
- Play Store app status bar (Ravi: overlaps there, fine in the website-installed app): besides `setOverlaysWebView(false)`, an Android-15+ fallback — if the page is still as tall as the whole screen (drawn under the clock), `html.yb-sb-fallback` moves the app down 28px and StatusBarSync reads the strip colour below that gap, so strip and header match. Next Play Store build: `android-app/capacitor.config.json` now has `overlaysWebView:false`, `adjustMarginsForEdgeToEdge:"force"`.

---

# v378 — WhatsApp OTP sign-up (Fast2SMS Smart OTP) (26 Oct 2026)
Deploy **v378** only (contains everything up to v377). **No database change.** No locked files touched.

Ravi: "OTP vala system Ybex mai, taki easy ho jaye" — Fast2SMS Quick SMS is ₹7/SMS + manual approval, and SMS OTP
needs DLT (Gutargoo's entity has no sender ID), so the code goes on **WhatsApp** (₹0.25 each, Fast2SMS Smart OTP).
- `backend/smsOtp.ts`: new provider `fast2sms_smart` = `FAST2SMS_API_KEY` + `FAST2SMS_OTP_ID` → POST
  `https://www.fast2sms.com/dev/otp/send` { mobile, otp_id, otp (our own code), otp_length 6, otp_expiry 10 }.
  `FAST2SMS_OTP_CHANNEL` = whatsapp (default) | sms — only changes the wording. `otpChannel()` helper.
  Without FAST2SMS_OTP_ID the old providers work as before.
- `GET /auth/phone/config` also returns `channel`. Server messages say "on WhatsApp" / "by SMS".
- `AppContinue.jsx`: when the code goes on WhatsApp, **creators join with Instagram username + WhatsApp number →
  "Get OTP on WhatsApp" → 6-digit code → in** (same /auth/phone/send + /auth/phone/verify as v376; existing number =
  log in, waitlist number = claimed). "Use email instead" → the v376 email join; the email join shows
  "Join with WhatsApp OTP instead". Brands: unchanged (mobile option shown as before when on).
- Version label v378. New test `backend/v378SmartOtp.test.ts` (in dev/tests.tgz). `npm run verify`: 254 files / 2459 pass.

## Ravi to do
1. Fast2SMS → WhatsApp Manager: template **ybex_login_otp** (Authentication, copy code, 10 min) was submitted 26 Oct →
   wait for **Approved**. The Ybex WhatsApp number also shows "Pending / Unverified" — finish Meta's display-name /
   business verification if asked.
2. Fast2SMS → Smart OTP → WhatsApp Channel → **Add OTP Template** → pick ybex_login_otp → copy the **OTP template ID**.
3. YBEX_ENV: `FAST2SMS_API_KEY=` (Dev API key), `FAST2SMS_OTP_ID=` (that ID), `FAST2SMS_OTP_CHANNEL=whatsapp` → deploy v378.
4. Recharge the Fast2SMS wallet (₹50 now ≈ 200 codes).

## v378 (same zip) — Ravi's AI Studio edits merged + QA report fixes (27 Oct 2026)
**From Ravi's AI Studio version-377 (merged):** real Ybex logo (YbexLogo SVG, landing header, links home), new landing
hero "Connect Directly With India's Top Creators & Brands" + "Free to join" pill, landing menu links open real pages,
Campaigns page for guests (6 cards, rest blurred, guest modal), "Delete account" links removed from footers / login
screen (the /delete-account page still exists for the stores). **Not taken:** AI Studio's `.env.example` (brought back
DEMO_LOGIN / OTP_ECHO and separate keys — kept the one-secret YBEX_ENV file) and removing the demo link code from
AppWelcome (a test pins it; the live server never shows it). `.aistudio/`, screenshots, bun.lock left out (repo limit).

**QA report v377 — fixed** (locked files with Ravi's written OK 27 Oct, logged in docs/code/PROTECTED_CHANGES.md):
- H1 quick-admin PIN: global lock (20 wrong in 15 min → off for everyone 15 min), map never wiped, live needs a 32+ char PIN.
  ⚠️ If ADMIN_QUICK_PIN is shorter than 32 characters, /admin/ybx stops working on the live site — set a long one.
- H2 headers: nosniff, Referrer-Policy, no X-Powered-By; on the live server also X-Frame-Options SAMEORIGIN,
  CSP frame-ancestors 'self', HSTS.
- H3 login: 30 tries a minute per IP (any email) + at most 4 bcrypt checks at once.
- M1 UGC brief: non-owners get it without private fields (ugcGuards.briefForOutsider) 🔒ugc_routes.
- M2/M4 LIKE wildcards escaped everywhere user text meets ilike (coupons, emails, handles, brand names); signup's
  duplicate-key path never touches a verified account. M3 creator coupon used_count +1 by compare-and-set.
- M5 /admin/users/:id/kyc-action needs manage_kyc. M6 campaign detail: real_views / applicants / *_by only for the
  brand 🔒. M7 track-view: one per IP per campaign per 6 h, 60/min per IP 🔒. M8 budget: negative, NaN, min>max refused,
  ₹1 crore default ceiling. M9 onboarding-update can't self-set kyc_verified. M10 onboarding "complete" only with an
  Instagram (or YouTube) username. M11 the Instagram-numbers guard now covers PATCH /creators/me too (mobile save).
- M12 maintenance: Supabase row = one source; auto-off time in ybex_ephemeral; /system-status + the API gate apply it.
- M13 Explore: one shared read when the cache is empty 🔒creators_routes; error handler keeps 4xx, logs one line, no
  internal text on 500.
- L1 blog sanitizer: allow-list + raw-text tags removed + re-parse check. L2 internal / private-sounding columns hidden.
  L3 no raw DB text in campaign apply / browser-db saves. L4 offline download 11 MB → 7.2 MB (admin + PDF makers cached
  on first open instead). L5 uploads: 100 MB, first bytes must match the type. L6 referral rewards 0–₹1,00,000, cap
  0–1,000. L7 coupon status only active/paused/inactive/expired. L8 brand PAN / GSTIN format. L9 brand + creator profile
  field checks. L10 maintenance message max 500. L11 apply to a missing campaign → "Campaign not found" 🔒. L12 browse
  payout estimate from Admin → Fees. L13 referral claim says if it worked. L14 chat: 4,000 chars, 30 msgs/min 🔒.
- Not changed: L15 (top bar + skeletons already there), L16 (already fixed, check on fresh build). Creator KYC format
  check (creatorKyc.ts is locked — next time).
- Still for Ravi's team: Supabase RLS check, real Razorpay end-to-end, real phones.
Tests: `backend/v378Qa.test.ts`. `npm run verify`: 255 files / 2468 pass, 0 fail. Build OK.
- **Creator KYC + admin documents (Ravi: "PAN card mangta hai, admin mein 4 dummy photos"):** creator KYC submit now
  checks PAN (ABCDE1234F), IFSC and GSTIN format (guard in creatorReviewGate.ts in front of the locked route). Admin
  KYC screens no longer fill the Aadhaar front / back / UPI QR boxes from `uploaded_files[1..3]` (that put other
  files — or nothing real — in those boxes); Aadhaar and UPI QR boxes show only when that file was really uploaded.
  `npm run verify`: 255 files / 2470 pass.
- **Quick admin login removed (Ravi: "app public hai, quick login complete hata do"):** no ADMIN_QUICK_PIN / "dev_bypass_admin|<pin>"
  path on the server, AdminQuickEntry page deleted, /admin/ybx → /admin-login. Old tests for it replaced by "removed" checks.
- **Ravi's screenshots:** landing hero sizes small → bigger → biggest again (mobile 24 / 31 / 38 px, desktop clamp 26–42 /
  32–56 / 40–72); logo "e" only tilted (−25°), its bar no longer pokes out (read as "ø"); Explore cards fixed size —
  desktop 330 px wide 3:4 (fewer per row on smaller screens, never stretched), phones 156×208 portrait (smaller phone =
  fewer per row, same size); app-open Diwali poster: the art is placed from the measured panel / top block, so it never
  covers "Entries close in …"; Eva no longer hops to other spots on the screen (EVA_STAYS_PUT in FeedbackBot.jsx) — she stays at
  her first place, still peeks and rotates her lines; bubble unchanged.
- QA report v377 re-checked item by item against the code: all H / M / L items present (see list above). `npm run verify`:
  254 files / 2464 pass, 0 fail.
- **Eva stays put (Ravi: "Eva baar baar jagah badalta hai, wo nahi"):** `EVA_STAYS_PUT = true` in FeedbackBot.jsx — no
  hops between spots; she still peeks and rotates lines; bubble size unchanged. Home "Meet our top creators" cards untouched.
- **No internet = clear screen (Ravi: "showing offline data kyu bolta hai"):** that pill came from ANY failed request
  (slow network / timeout / server blip) and stayed until the phone went offline and back. Now a failed request is
  checked: Ybex answers → nothing shown; Ybex down but internet OK → "Ybex is updating" pill; no internet → full screen
  "Connection lost… / Looks like you have no internet connection. / Try again" (Ravi's reference), closes by itself
  when the net is back. Test: src/components/common/v378Offline.test.jsx. `npm run verify`: 255 files / 2466 pass.

## v378 (same zip) — Maintenance / offline page from Ravi's design (27 Oct 2026)
- **One self-contained page** `src/components/common/ybexDownPage.html` (Ravi's "Ybex Offline Page"): animated
  illustrations (monitor + robot for maintenance, guy on a pole for offline), "Ybex is under maintenance / Back …",
  "You seem to be offline / Try again / You're back online · Open Ybex", and the mini game — Deal Drop (creators) and
  Creator Drop (brands), 3 lives, 2x power-up, best score on the phone. Nothing loaded from outside — works with no
  server and no internet. Shown in the app through `YbexDownPage` (OfflineBanner.jsx, iframe srcdoc, bundled in the JS).
- **When it shows:** (1) Admin → Maintenance on for that side (not for admins / admin pages / landing, login, blog);
  (2) Ybex server not answering but internet OK → maintenance page "Back in some time", closes + reloads when the
  server is back; (3) no internet → the offline page (replaces the plug screen above).
- **Admin switch really controls it now:** App.jsx re-reads /api/system-status every 30 s, when the app comes to the
  front, and at once when an API answers 503 `under_maintenance` (src/lib/api.js → "ybex:maintenance"). Before, it was
  read only once when the app opened.
- **"Back …" line:** auto-off set → "Back by 4:30 PM IST" (system-status returns creator_until / brand_until); no time
  → 1 hour after it was switched on; after that (still on, to be switched off by hand) → "Back in some time".
- **Website down:** cloudflare/ybex-proxy-worker.js carries a copy of the page; server not answering in 20 s or a 5xx
  gateway page → page visitors get the maintenance page (reloads itself every 60 s), /api gets JSON 503 SERVER_DOWN.
  **Ravi: paste the new worker file into Cloudflare once.**
- Old "App Upgrade" / "Quick Update" screens removed from App.jsx.
- Real-browser check (production build, 390 px + 1366 px): landing, /offer, explore, campaigns, sign-in, blog, help,
  terms, privacy, UGC orders, /admin/ybx → admin login, 404 — no page errors, no sideways scroll.
- Tests: src/components/common/v378Offline.test.jsx. `npm run verify`: 255 files / 2470 pass, 0 fail. Build OK.

- **Explore cards (Ravi's check, 27 Oct):** desktop 250 px wide (3:4) — 5 per row on a 1440 laptop, 3 on 1024, never
  stretched; phones 156×208. Card text: "Avg Reach" sits on the Followers line, niche + city get their own row (the
  city ran into "AVERAGE REACH" before). Website header fits 360 px phones (the ☰ was pushed out).
- db_mock.json is the shipped empty file again (a local test run had written into it). `npm run verify`: 255 files /
  2470 pass, 0 fail.
- **Explore, Ravi's final call:** desktop always **5 cards per row** (4 on tablets), cards stretch to fill the row at
  3:4 (`--yb-explore-cols` in index.css); narrow cards (small laptop) get compact text via a container query so name /
  followers / reach never overlap. Phones: **2 per row filling the width**, 3:4 portrait (no side space).

## v378 (same zip) — "Get the app" popup + landing download bar (27 Oct 2026)
Ravi: "website pe aate hi 1-2 sec baad popup, seedha Install / Add to Home Screen, lambi instructions nahi; landing pe
scroll karte waqt 'Download now' ki patti". Both in src/components/common/PWAInstallPrompt.jsx (InstallPopup,
LandingInstallBar), mounted in App.jsx.
- **Popup** (phones only, 2 s after opening a public page: landing, offer, explore, campaigns, blog, help …; never in
  the installed app / store app, admin, sign-in; "Not now" → hidden 3 days):
  Android Chrome → big **Install Ybex** button = the phone's own one-tap install box (fallback: the short guide).
  iPhone → one line "Tap [Share icon] then Add to Home Screen" + an arrow bouncing at Safari's Share bar — Apple
  doesn't let any website add itself, so this is the shortest possible. Instagram / Facebook browser → "open in browser".
- **Landing bar:** dark floating pill "Download the Ybex app · Install / Get app" after scrolling ~500 px (the phone
  landing scrolls inside its own box — handled), × hides it.
- **Store apps later:** fill `INSTALL_STORE_URL = { android: "…play.google.com…", ios: "…apps.apple.com…" }` and both
  popup and bar open the store instead.
- Install buttons (popup + landing bar) have a glossy finish with a light shine sweeping across every 3 s; bar and popup
  texts are one line each.

## v378 (same zip) — ₹50 offer: Eva, link picker, profile popup, reminder pushes (27 Oct 2026)
- **Eva knows the offer:** `OFFER_FOR_EVA` in src/lib/diwaliChallenge.ts goes into Eva's creator knowledge
  (backend/assist_routes.ts); she brings it up when a creator greets her or asks about money / profile. Peek line
  "₹50 cash on a complete profile — want help?". `OFFER_NEEDS_REEL` = true (reel + profile) / false (profile only).
- **Page picker instead of typing links:** `AppPagePicker` (AdminPromoPopups.jsx) — search + list of app pages + "Other
  link". Used in Banners, Push notifications and Admin → user → Send notification ("Tap opens", saved as redirect_path).
- **100% profile popup:** src/components/challenge/ProfileCompleteCongrats.jsx (App.jsx). Checks photo, niche & bio,
  Instagram/YouTube, rate card, past work + KYC submitted after every save. At 100% while the offer is open:
  "Congratulations! … You are eligible for the ₹50 offer. Ybex's finance team will send it to your KYC payout (UPI /
  bank) within 1–2 days." No UPI asked. Once per creator. If a reel is required and none added: "Profile complete! One
  last step… Add my reel".
- **Reminder pushes:** backend/profileNudges.ts — max 3 per creator (now, +2 days, +4 days), 9 am–10 pm IST, only while
  the offer is open, each names the first missing part and opens that screen; bell + phone push; state in push_log.
  **OFF** until Ravi approves the texts (`PROFILE_NUDGES_ON` or env PROFILE_NUDGES=on).
- **Maintenance:** a signed-in brand browsing Explore (/creators/*) was blocked when only the creator side was in
  maintenance (and vice-versa) — now only the visitor's own side is paused. Live row checked: both sides off.
- Tests: backend/profileNudges.test.ts.
- **28 Oct, Ravi's answers:** offer is now **₹300 cash for the first 300** (`RECHARGE_AMOUNT`; every screen, Eva, pushes,
  share text). Public line = "complete your profile → ₹300"; the reel step (reel with @ybex.in + #Ybex
  #YbexDiwaliChallenge added to the portfolio) is told in the 100% popup ("Congratulations! … Last step to get your
  ₹300 …" → opens Add reel) and by Eva only when the profile is complete or the creator asks about terms (T&C on the
  offer page unchanged — Ravi added the terms). Reminder pushes **ON**; the KYC one now reads "Add your payout details
  💸 — add where we should send your ₹300". Test amounts updated ₹50 → ₹300 (challengeFlow, challengeUi) on Ravi's change.
- 28 Oct: /offer bottom bar — the ₹300 line wraps to 2 lines on 360 px phones instead of cutting off with "…". Real-browser check of /offer + /challenge (360/390/1440, no sideways scroll, no errors), opening poster and both 100% popups.
- 28 Oct live fix: YBEX_ENV saved by the hosting secret box as ONE line (new lines → spaces / literal \n) gave only its first key, so the live server had no SUPABASE_SERVICE_ROLE_KEY (login/sign-up unavailable). parseEnvBundle now splits a one-line bundle before every KEY=. /api/health also shows ybex_env_settings (how many settings YBEX_ENV filled — a number only).
- 28 Oct (Ravi's phone test after deploy):
  - **Mini game half screen on iPhone:** the canvas stayed half-height inside the game box, so "YOUR INBOX" sat in the
    middle. Canvas is now absolutely filling the board (ybexDownPage.html + the worker copy).
  - **Opening the app with no internet showed Safari's "not connected" page:** live check found the hosting answering
    /sw.js with a Google 404 for a while (during the deploy). A phone that checks for an update then deletes its
    offline copy. The Cloudflare Worker now keeps the last good copy of sw.js / push-sw.js / workbox files and serves it
    instead of a 404 (or a 503 if it has none — never a 404). **Ravi: paste the new worker file into Cloudflare.**
    On the iPhone: delete the Home Screen icon, open ybexmedia.in in Safari once online, Share → Add to Home Screen
    (Open as Web App on), open it and wait ~30 s so the offline files download.
- 28 Oct: everyone was logged out after the deploy — same cause (no service key → saved logins unreadable → /auth/me said 'not logged in'). /auth/me now answers 503 SERVER_DOWN in that case, so phones keep the login and wait instead of signing out.
- 29 Oct (Ravi's video: Google sign-in in the apps):
  - **redirect_uri_mismatch in the apps:** the Android / iPhone apps call the hosting address (ybexapp.ai.studio)
    directly, so Google got that address. The server now always gives Google ybexmedia.in (same server via Cloudflare).
  - **iPhone Home Screen app ran the website inside Google's sheet and stayed logged out:** one-time hand-off —
    the app sends a random id, the server keeps the login for it (ybex_ephemeral, 10 min), the app (still open under
    the sheet) asks GET /api/auth/oauth/handoff every 2 s and signs itself in; the sheet shows "You're signed in —
    close this window". src/lib/oauthHandoff.js, AppContinue.jsx, AppleSignInButton.jsx, AppOAuthDone.jsx.
  - **iPhone setup without CocoaPods:** mac-prepare.sh creates the Xcode project with Swift Package Manager.
  - Tests: backend/v378OAuthHandoff.test.ts.
- **Phone's own Google accounts (Android / iPhone app):** new app builds include @capgo/capacitor-social-login; "Continue
  with Google" shows the phone's account list, the ID token is checked with Google (POST /api/auth/oauth/google/native,
  aud must be GOOGLE_CLIENT_ID / GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID). Older builds / not set up → the
  browser sign-in as before. Ravi (Google Cloud → Credentials): Android OAuth client (package com.ybex.app + SHA-1 from
  Play Console → App integrity → App signing key), iOS OAuth client (bundle com.ybex.app) → put its id in YBEX_ENV as
  GOOGLE_IOS_CLIENT_ID. Needs a new Play / App Store build (native plugin).
- Play Store app live updates checked live: /api/app/android-update offers the new bundle, the zip downloads and its
  checksum matches — the app applies it the next time it is opened after being closed (Android: swipe it away, open again).

---

# Handoff v377

# Ybex v377 — chat handoff (25 Oct 2026)

Give this file + `ybex-v377.zip` to the next chat. Full detail of every change: `docs/sessions/SESSION_64_SUMMARY.md` (v376 + v377 sections at the end).

## 1. What v377 contains (on top of v376)

**Diwali Challenge v2 "Easy Entry" (handoff md)**
- New rule everywhere: post ANY reel of your own → tag @ybex.in + #Ybex #YbexDiwaliChallenge → add it to the Ybex Portfolio (Diwali toggle ON) = entry.
- Entries close 15 Nov 11:59 PM IST, winners 18 Nov. Live config `challengecfg:diwali2026` → `results_at` set to 18 Nov 00:00 IST in Supabase (done).
- ₹50 **UPI cash** (not mobile recharge) for the first 300 creators with an approved entry **and a complete profile** (photo, niche & bio, Instagram, rate card, past work). One per creator.
- After signup from /offer the creator lands on "Add your Diwali reel" (toggle ON). Entry done screen: "Entry done! 🎉", results date, ₹50 line, Share on WhatsApp, Go to dashboard.
- Home card "Add your Diwali reel to enter". Pixel: CompleteRegistration on signup, ChallengeEntry on entry. One entry per reel.
- Admin → Challenge entries: Pending / Approved / Rejected, caption + date checks, ₹50 UPI place (#1–#300) with a "Sent" tick that unlocks only after Approve + 100% profile ("Profile 60% · needs …" shown), "No reel yet" list with WhatsApp nudge links, CSV (WhatsApp, email, status, ₹50 place / sent).

**Offer page /offer**
- Hero rebuilt from Ravi's "Diwali Challenge v3" design (screen 3a): small Diwali badge, "Apni reel me #Ybex use karo & @ybex.in tag karo, jeeto", big ₹1,00,000, "Prize pool · 50 winners · Free entry", ₹50 FREE CASH card (UPI / GPay / PhonePe / Paytm logos, live "Only N left", animated coin), big "Free me register karo" button, live "N creators already joined" (or "Be one of the first 300"), "*T&C apply · ₹50 for the first 300 approved creators". Sponsors moved under the hero.
- "complete profile" condition is NOT in the hero (Ravi), but it is in FAQ, Rules and the Entry done screen.
- Rest of the page (countdown, prizes, scripts, FAQ, rules) unchanged.

**App-open 5-second screen** — Ravi's "Diwali Entry Animated" design: animated "₹50 FREE CASH · on completing profile · First 300 creators · Paid to UPI" card.
Left out on purpose (not true yet): "Instant", "We pick it up on our own".

**Fixes**
- Google sign-in redirect stays on ybexmedia.in (x-forwarded-host).
- "A new version of Ybex is ready – Refresh" popup removed (silent update).
- Android Play Store app: header under the clock / status bar fixed (page starts below the bar; Android 15+ fallback moves the app down 28px; bar colour = page top colour). Ships by live update — close & reopen the app.
- Home: Diwali string of lights removed.
- Mac local run: put `YBEX_ENV.txt` in the project folder, double-click `Run Ybex.command` (or `bash scripts/mac-local.sh`) → http://localhost:3000. Live Razorpay keys are switched off locally.
- Version label v377. Tests: 253 files / 2,455 pass. Repo: 998 files (limit 1,000). No locked files touched, no database changes.

## 2. Deploy (one deploy)
1. Upload `ybex-v377.zip` to AI Studio.
2. Secrets: only **YBEX_ENV** (paste the whole `YBEX_ENV.txt` — it has GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET too) + GEMINI_API_KEY. Delete **DEMO_LOGIN**.
3. Google Cloud Console must have redirect URI `https://ybexmedia.in/api/auth/oauth/google/callback`.

## 3. Test after deploy
- Fresh phone browser: ybexmedia.in/offer → Free me register karo → signup → lands on "Add your Diwali reel" → add reel → entry shows in Admin.
- Skip adding a reel → Home card shows + creator is in "No reel yet".
- Meta Events Manager → Test events: CompleteRegistration + ChallengeEntry.
- Google login stays on ybexmedia.in. No "new version" popup on first visit.
- Play Store app: open, wait 30 s, close fully, reopen → status bar not over the header, new 5-second screen, "Diwali Dhamaka" Home header. Send screenshots of Home / Campaigns / Inbox.

## 4. Ravi to do
- Admin → Sponsors & prizes: update the "T&C Apply*" scripts (they still say "make a reel for Ybex"; Script 1 says winners on 15 November → 18 November).
- Creatives text: "Koi bhi reel daalo, ₹50 UPI cash jeeto" · "First 300 approved creators · Top creators win up to ₹1 lakh" · "Caption me @ybex.in + #Ybex #YbexDiwaliChallenge" · "Join free → ybexmedia.in/offer" · "T&C apply".
- Paying the ₹50: Admin → Challenge entries → Approve → when the profile shows complete, pay ₹50 by UPI (PhonePe / GPay / Paytm) to the creator's WhatsApp number → tick "Sent". Within 7 days of approval.
- Rotate every secret that was pasted in chat (Razorpay, Supabase service key, Google secret, Resend, VAPID, IG tokens, server secrets) and change the admin password.
- Renew IG_GRAPH_TOKEN if it is old (views / likes refresh and Instagram auto-fetch need it).

## 5. Open decisions / not built
- Entries close date: v3 design says 8 Nov, live is 15 Nov (winners 18 Nov). Change in Admin → Sponsors & prizes → Dates if 8 Nov is wanted.
- Not built: automatic push/email reminders for "no reel yet"; auto-detecting reels from Instagram (v3 screen 3d); asking for a UPI ID (3e — needs a database change, blocked by the "no DB changes" rule); Diwali launch popup (3c). Profile entry card (3f) not wanted.
- Next Play Store build: `android-app/capacitor.config.json` already set (`overlaysWebView: false`, `adjustMarginsForEdgeToEdge: "force"`).

## 6. Rules for the next chat (AGENTS.md)
No new Supabase tables / columns / SQL. Locked logic files (scripts/protectedFlows.mjs) — not one character. Never edit a test just to pass. Tests live in `dev/tests.tgz` (`npm run tests:unpack` / `tests:pack`). Keep the repo under 1,000 files. Bump the version label, send zip + summary. App copy in English (offer hero is Hinglish by Ravi's choice).

---

# Session 59

# Session 59 — v337
(Before this: docs/sessions/SESSION_58_SUMMARY.md = v309 → v336.)

## 1. App server address = ybexapp.ai.studio (Ravi: "ye kr do")
Why: v335/v336 sent the iPhone app and its live update to https://ybexmedia.in, which doesn't serve the app yet
(AI Studio free hosting can only take a custom domain through Cloud Run + billing) → login / data / updates would fail.
- `src/lib/native.js`: DEFAULT_ORIGIN `https://ybexapp.ai.studio`; only `VITE_API_ORIGIN` changes it (the old
  fallback to VITE_PUBLIC_SITE_URL is gone — that's the share-link address and could name a dead domain).
- At start the app calls `CapacitorUpdater.setUpdateUrl(<API_ORIGIN>/api/app/ios-update)`; config has
  `allowModifyUrl` + `persistModifyUrl`. So later moving to ybexmedia.in = set VITE_API_ORIGIN (or one line) and
  deploy → iPhones move by live update, update check follows. **No App Store release needed.** Keep ai.studio alive a
  few weeks for phones that haven't opened the app.
- `ios-app/capacitor.config.json`: updateUrl ai.studio; allowNavigation ai.studio + ybexmedia.in (+ razorpay).
  `ios-app/package.json` web build default ai.studio. README updated.
- Android (Play/TWA): host stays ybexapp.ai.studio (no change). Moving Android to the new domain later = one Play
  update (new APK with new host + assetlinks) — any time, not urgent.
- `.env.example` / docs/setup/ENV_KEYS.md: APP_URL / SITE_URL / VITE_PUBLIC_SITE_URL = ai.studio until the domain
  opens the app (emails, Google sign-in return, share links would otherwise point at a dead address). New keys:
  VITE_API_ORIGIN (optional), PROXY_SHARED_SECRET.
- CORS already allowed ybexapp.ai.studio + capacitor://localhost — no change.

## 2. ybexmedia.in via Cloudflare (free jugad) — Ravi does the clicks
- Guide (Hinglish, step-by-step): `docs/setup/DOMAIN_CLOUDFLARE.md` — Cloudflare free account → check / copy email
  (Resend MX/TXT) records → GoDaddy nameservers → secret → Worker → custom domains → test → switch APP_URL etc. + Google
  redirect URI.
- Worker code: `cloudflare/ybex-proxy-worker.js` — forwards everything to ybexapp.ai.studio (websocket too),
  www → apex, rewrites ai.studio redirects, sends visitor IP + PROXY_SHARED_SECRET.
- Server: new `backend/domainProxy.ts` (first middleware in backend/server.ts). Only with the right secret (20+ chars)
  the visitor's real IP is appended to X-Forwarded-For, so the existing login / OTP rate limits see each person
  (otherwise everyone behind the Worker shares one IP and one lock). Wrong / missing secret → headers dropped.
- Cost: ₹0 up to 1,00,000 requests/day; then Workers Paid $5/mo or own hosting (Hostinger VPS KVM 1 ≈ ₹599–999/mo).

## 3. Block a user (Apple 1.2) — DB change OK'd ("hn kr do")
- Live migration `session59_blocked_users` (scripts/sql/OLD_SQL_already_run.sql (session59_blocked_users part)): `blocked_users`
  (blocker_id, blocked_id, created_at; pk both; blocker ≠ blocked; index on blocked_id), RLS on, no policies (server only).
  docs/database/PENDING_DB_CHANGES.md marked DONE.
- `backend/blockUsers.ts` (not locked), registered before chat / creators / campaign routes:
  `GET /blocks`, `GET|POST|DELETE /users/:id/block`. Brand team members block for the parent brand. Admins can't be
  blocked. Each block also writes a `reports` row (`target_type user_block`, optional reason) → Admin → System reports.
- Both directions: chat send → 403 BLOCKED ("You blocked X. Unblock them from their profile…" / blocked side just
  "You can't send messages in this chat."); brand invite → refused; creator apply → refused.
- Lists filtered on the way out (locked handlers untouched): inbox hides blocked chats — a chat with payment already
  held stays (marked `blocked`) so the deal can finish, messages stay off; creator invitations; campaign applicants.
- UI: new `src/components/safety/BlockUserButton.jsx` — "Block" next to "Report this profile" on public creator and
  brand pages, "Block <name>" in the chat ☰ menu (BurgerMenuSupport.jsx, not locked; all API calls in the new
  component, so screen call groups unchanged), confirm sheet with what happens + optional reason, Unblock toggle.
  `BlockedPeopleList` under every Help & support card (phone Help screens, desktop settings, /help when logged in).
  Report sheet now points to Block. docs/setup/APP_STORE_CHECKLIST.md Part D updated (reviewer note).
- Not filtered (small, later if wanted): /chat/v2/threads/count badge, Explore lists, notifications already sent.

## 4. Files organised + clean-up (Ravi: "kachre ko saaf kro")
- Root now: README.md (folder map), AGENTS.md + GEMINI.md (AI agent rules — must stay in root), config files.
- `docs/` (index `docs/README.md`): `setup/` (ENV_KEYS, DOMAIN_CLOUDFLARE, APP_STORE_CHECKLIST, OFFLINE_AND_APP_STORE),
  `code/` (CODE_MAP, ARCHITECTURE, PROTECTED_CHANGES, CONTRIBUTING, UNIQUE_FEATURES), `database/` (PENDING_DB_CHANGES +
  all Supabase prompts), `sessions/` (58, 59) + `sessions/archive/` (21–57; merged into one file in v338), `archive/` (old brand mobile audit).
- All references updated (code comments, tests, scripts/protectedFlows.mjs now logs to docs/code/PROTECTED_CHANGES.md).
  Test path pins moved (requirement change): loadingStates, session49, session43V290Invite. Locked files untouched
  (one comment rewrite in directInvites.ts was put back).
- Deleted: 7 unused code files (nothing imported them: backend/services/deliveredMetrics.ts, TrustBadge, ActivityFeed,
  PaymentMethodCard, shared/GeminiIcon, lib/typography.ts, platformTools/ReferralSettingsCard), empty bun.lock,
  docs/eva_part1_preview.jpg, empty docs/prompts/.
- Kept on purpose: db_mock.json (server's local fallback DB), metadata.json + firebase-applet-config.json + .aistudio/
  (AI Studio platform files), scripts/sql history.
- Zip folder is now `ybex-v337` (was still named ybex-v296).

## Tests
New `backend/v337BlocksDomain.test.ts` (10 pass). Full suite (bun, no npm here): 795 pass; the failures are the same
106 as the v336 baseline in this environment (missing packages), 0 new. protectedFlows 9/9. Every changed file compiles;
whole web app bundles (only the usual /landing/fonts URL notes). npm still blocked → run `npm run verify` + `npm run build`
once on the deploy machine.

## Needs Ravi
- Deploy v337, then follow docs/setup/DOMAIN_CLOUDFLARE.md (secret in BOTH AI Studio + Worker).
- Hosting secrets: keep APP_URL / SITE_URL / VITE_PUBLIC_SITE_URL = https://ybexapp.ai.studio until ybexmedia.in opens the app.
- APNs .p8 key + Key ID + Team ID on the server; Mac iPhone build (ios-app/README.md).
- Test Block: block from a profile and from the chat menu, try messaging / inviting / applying from both accounts,
  check Help → Blocked people → Unblock, check Admin → System reports shows the block.

---
# v338 (same session) — AI Studio GitHub import: "1000 files imported, 130 skipped"
AI Studio imports at most 1,000 files from GitHub; v337 had 1,133, so 130+ files were silently missing (broken deploy).
- All 187 test files packed into ONE file `dev/tests.tgz` (same paths inside). `npm run tests:unpack` puts them back,
  `npm run tests:pack` packs them again and removes the loose copies; `npm run verify` / `protect:check` unpack first.
  Loose `*.test.*` / `*.spec.*` are in .gitignore. New `scripts/tests-archive.mjs`. AGENTS.md + GEMINI.md explain it.
- Old summaries 21–57 merged into `docs/sessions/SESSIONS_21_to_57.md` (text unchanged); session49 test pin moved
  (requirement change, commented).
- Repo now **913 files** (87 under the limit). No app code changed.
- Tests: unpacked → bun suite 796 pass / same 106 environment failures as before, 0 new; packed again.
- Ravi: the GitHub repo must be REPLACED (old files deleted), not uploaded on top — otherwise the old test files stay
  and the count is still over 1,000. Keep new files under ~950 in future (big file sets → one archive).

---
# v339 (same session) — no app code change; notes from the deploy / Mac / APK / teaser work
Deploy (AI Studio secrets) — what Ravi fills now:
- Required: SUPABASE_URL + VITE_SUPABASE_URL (https://mzcovvzkwzjvzskjqwwy.supabase.co), SUPABASE_ANON_KEY + VITE_SUPABASE_ANON_KEY
  (legacy anon JWT), SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, RESEND_API_KEY, ADMIN_EMAIL / ADMIN_ALERT_EMAIL, RAZORPAY_KEY_ID /
  _KEY_SECRET / _WEBHOOK_SECRET, GOOGLE_CLIENT_ID / _SECRET, VAPID pair (keep old values if they already exist),
  APP_URL / SITE_URL / VITE_PUBLIC_SITE_URL = https://ybexapp.ai.studio, PAYMENTS_TEST_MODE=false, OTP_ECHO=off, NODE_ENV=production.
- Must stay EMPTY: DEMO_LOGIN, DEMO_SEED, SEO_NOINDEX, YBEX_SYNC_BLOB, RESEND_ALLOW_FALLBACK, IOS_OTA_OFF, IOS_OTA_MIN_BUILD,
  VITE_API_ORIGIN, CORS_ORIGINS, ADMIN_QUICK_PIN.
- Later: SESSION/OAUTH_STATE/MEDIA_KEY/EMAIL_LINK/CRON secrets (code falls back to the service key), PROXY_SHARED_SECRET
  (Cloudflare step), APNS_* + APPLE_CLIENT_ID (iPhone), VITE_PLAY_STORE_URL (after Play is live), WhatsApp, limits.
Razorpay webhook (Live mode): URL https://ybexapp.ai.studio/api/payments/razorpay/webhook, own secret (= RAZORPAY_WEBHOOK_SECRET),
  events payment.captured + order.paid only (the server reads just these two).
GitHub → AI Studio: replace the repo with v338/v339 (delete old files) — the 1,000-file import limit.
Mac (linked): Xcode is NOT installed → iPhone build waits. Ravi installs Xcode from the App Store (~15 GB), then double-clicks
  Desktop/Ybex-Mac-Check.command (read-only check → Desktop/ybex-mac-check.txt). Claude can't type in Terminal/Xcode (click only),
  so setup will be double-click .command files + Ravi's Apple ID steps. APNs .p8 key: developer.apple.com → Keys.
Android APK: not live on Play yet → new signing key is fine. Plan: PWABuilder (Ravi in Chrome; the built-in browser blocked it):
  package com.ybex.app, host ybexapp.ai.studio, start /app, version 1.0.2 / code 3, colours #7E00DC, new key. Then send the zip →
  Claude puts the new SHA-256 into public/.well-known/assetlinks.json (+ Play App Signing fingerprint after upload).
  Keep signing.keystore + signing-key-info.txt safe (Drive + pen drive). Plain-purple Android 12 splash needs a Bubblewrap build.
Teaser video (separate file: ybex-teaser-kit.zip — not inside the app repo):
- Final: Ybex_ComingSoon_16x9_v4.mp4, 20 s, 1080p, no sound. Light lavender + purple glows, Eva part mint/lime, fast kinetic
  text (Zelios-style reference), straight iPhone mockup (Ravi's), screens rebuilt from the real app UI (brand home, creator home,
  Eva chat, deal chat offer → signed, Review & pay → success), Instagram/YouTube/Facebook tiles, Razorpay at payment, original
  ₹ notes, ends on iPhone home screen (Ybex icon shine) + "Coming soon." + App Store / Google Play badges.
- Logo = real app icon (white "Ybex." incl. white dot — no lime on the logo). Lime only for Eva.
- Not done: Reel 9:16 render, sound/voiceover (Ravi adds in CapCut or sends SFX/music to sync), separate longer intro video.

---
# v340 (same session) — Android package from PWABuilder
- PWABuilder (Google Play): package com.ybex.app, host ybexapp.ai.studio, start /app, version 1.0.2 / code 3, all colours
  #7E00DC, NEW signing key (alias my-key-alias, CN Ybex Admin, C=IN). Report: 0 errors.
- `public/.well-known/assetlinks.json`: old fingerprint (14:6D:…:18:A9) replaced with the new key
  32:66:47:E9:44:3A:74:13:9F:41:D9:8A:72:0E:4C:52:89:9D:EE:B2:70:BC:36:44:FC:14:F2:32:45:E6:C6:41 (checked against the APK cert).
- After the first AAB upload, add Play Console → App integrity → App signing key SHA-256 as a 2nd fingerprint
  (Play re-signs installs from the store; without it the app shows a browser bar).
- signing.keystore + signing-key-info.txt are NOT in the repo — Ravi keeps them (Drive + pen drive).
- No app code change.

---
# v341 (same session) — Google Play: app created, all forms done, closed test sent for review
App code: no change. Only `public/.well-known/assetlinks.json` + this summary changed.

## assetlinks.json (needs deploy)
Both SHA-256 fingerprints for com.ybex.app:
- Play App Signing key (installs from Play): 65:B7:E6:F3:7C:02:0F:E5:BA:ED:AA:7E:C1:21:8F:FA:DE:5F:92:AC:38:09:5F:E1:DB:48:2D:17:A7:DB:1B:FA
- Upload key (PWABuilder, signing.keystore): 32:66:47:E9:44:3A:74:13:9F:41:D9:8A:72:0E:4C:52:89:9D:EE:B2:70:BC:36:44:FC:14:F2:32:45:E6:C6:41
Live site still had only the upload key on Oct 17 → deploy v341, else the Play-installed app shows a browser bar.

## Android package (PWABuilder)
com.ybex.app, host ybexapp.ai.studio, start /app, version 1.0.2 / code 3, colours #7E00DC, new key (alias my-key-alias,
CN Ybex Admin, C=IN). Ravi keeps signing.keystore + signing-key-info.txt (NOT in repo). Next update = version code 4+.

## Play Console
- Account: "Melting Eve Studios" (personal, same as Gutargoo+), Chrome profile u/1. App "Ybex", Free, App.
- Internal testing: release 3 (1.0.2) live, no testers.
- Closed testing - Alpha: release 3 (1.0.2), India only, email list "Ybex testers" (15 Gmail IDs), feedback admin@ybexmedia.in.
  SENT FOR REVIEW 17 Oct 2026 (14 changes, managed publishing OFF → goes live to testers as soon as approved).
- Personal account rule: 12+ testers opted-in for 14 days in a row → then "Apply for production" on the Dashboard.
- App content (all done): privacy policy https://ybexapp.ai.studio/privacy-policy; Ads No; Sign-in details = 2 reviewer
  accounts (review.creator@ / review.brand@ybexmedia.in, password login, no OTP — password with Ravi); Content rating:
  All other app types, UGC + chat + block + report Yes, cash rewards Yes (referral UPI cash), wagering No → mostly 18+;
  Target audience 18+; Data safety per docs/setup/APP_STORE_CHECKLIST.md (16 types, encrypted, delete URL
  https://ybexapp.ai.studio/delete-account); Advertising ID No (AAB has no AD_ID permission); Government No; Financial
  features "none" (Razorpay handles money — change if CA says otherwise); Health none.
- Store listing: name Ybex; short "Brands & creators: campaigns, UGC, chat and safe payments in one app"; full description
  (brands / creators / Eva / safety / 18+); icon = pwa-maskable-512; feature graphic 1024x500 (labelled AI-made);
  8 phone screenshots 1080x1920 (Claude Design, real app screens, Android frame, fictional brand "Nova Tech"; not AI-labelled);
  category Business; contact admin@ybexmedia.in, website https://ybexapp.ai.studio.
- Store assets are in the separate zip ybex-play-store-assets.zip (not in the repo — file limit).

## Server secrets (AI Studio)
Filled Oct 17: ADMIN_ALERT_EMAIL, SESSION/OAUTH_STATE/MEDIA_KEY/EMAIL_LINK/CRON secrets (new random values, Ravi has them).
Pending: RAZORPAY_WEBHOOK_SECRET (after Live webhook), PROXY_SHARED_SECRET (with Cloudflare, same value in Worker + AI Studio).
Must stay empty: DEMO_LOGIN, DEMO_SEED, SEO_NOINDEX, YBEX_SYNC_BLOB, RESEND_ALLOW_FALLBACK, IOS_OTA_OFF, IOS_OTA_MIN_BUILD,
VITE_API_ORIGIN, CORS_ORIGINS, ADMIN_QUICK_PIN.

## Cloudflare (ybexmedia.in) — not started
Ravi: Cloudflare account (admin@ybexmedia.in) → add ybexmedia.in (Free) → send DNS screenshot (keep Resend MX/TXT!) →
GoDaddy nameservers. Then Worker (cloudflare/ybex-proxy-worker.js) + custom domains — docs/setup/DOMAIN_CLOUDFLARE.md.
Claude in Chrome can't drive dash.cloudflare.com or claude.ai pages (extension blocked there).

## Next
1. Deploy v341 (replace GitHub repo, then Republish) + PROXY_SHARED_SECRET when Cloudflare is ready.
2. When closed test is approved: copy the opt-in link (Closed testing → Testers → "How testers join") → send to all 15.
3. After 14 days with 12+ testers: Dashboard → Apply for production (answers about the test) → production release.
4. Later: VITE_PLAY_STORE_URL after Play is live; Razorpay Live webhook secret; iPhone build (Xcode, APNs).

---
# v342 (Session 60, 18 Oct 2026) — Cloudflare done + landing fixes
## Cloudflare (ybexmedia.in) — Cloudflare side DONE (Ravi + Cloudflare's own dashboard agent)
- Account: Google login ravimarketing.com@gmail.com. Zone ybexmedia.in, Free plan.
  Nameservers: hunts.ns.cloudflare.com + tori.ns.cloudflare.com — Ravi changed them in GoDaddy on 18 Oct.
- DNS (15 records, all DNS only / grey): Google MX ×5, SPF on @ + `dc-aa8e722993._spfm` TXT (GoDaddy SPF macro, was
  missing from the quick scan — added), 2 google-site-verification, zoho-verification, resend._domainkey,
  google._domainkey, _dmarc, Resend `send` MX + TXT. Deleted: GoDaddy parking A ×2 (15.197.148.33 / 3.33.130.190),
  www CNAME, _domainconnect CNAME.
- Worker `ybex-proxy` = cloudflare/ybex-proxy-worker.js; custom domains ybexmedia.in + www.ybexmedia.in;
  secret PROXY_SHARED_SECRET set in the Worker (NEW value, Ravi has it — use THIS one in AI Studio, not the older one).
- Still to do: PROXY_SHARED_SECRET in AI Studio (with the v342 deploy) → wait for "active" → test /api/health, /app,
  www redirect → then DOMAIN_CLOUDFLARE.md step 8 (APP_URL / SITE_URL / VITE_PUBLIC_SITE_URL = https://ybexmedia.in,
  Google OAuth redirect URI).
## Blogs / SEO (Ravi asked)
- Already built in v295 (backend/blogSeo.ts): robots.txt, sitemap.xml, per-post title/description/OG/JSON-LD + text,
  real 404. Advice: write drafts now; publish + Google Search Console (DNS TXT in Cloudflare) + submit sitemap AFTER
  SITE_URL = ybexmedia.in, so Google indexes the final address. SEO_NOINDEX must stay empty.
## Landing page fixes (Ravi: "fat raha hai", screenshots of the Eva tools row and the newspaper)
- Desktop "Ask in plain words. Eva opens the right screen.": the 6 dashed lines to Eva were invisible — the design
  export wrote `<lineargradient>` (lowercase); SVG needs `<linearGradient>`, so `stroke="url(#evaLine)"` painted nothing
  and left a big empty gap. Fixed (LandingDesktopView.jsx).
- Newspaper (desktop + mobile): its headline/columns/stamp looped every 10 s and emptied the page for ~3–4 s each cycle
  ("UGC \" half-typed in Ravi's screenshot). Now it waits (paused at the first frame) until 25 % of it is on screen,
  prints once (~4 s) and then stays complete. 8 keyframes in landingDesktop.css / landingMobile.css end on the full page;
  `.np-wait` pauses until an IntersectionObserver sets `npPlay`.
- Checked against Ravi's design HTML (Ybex_Landing_Desktop/Mobile_offline): all other sections match. Not a bug: the
  "Loved by Creators" reviews section shows only when Admin has reviews (v333 rule — no sample quotes).
- No horizontal overflow at 360–1920 px.
## Tests
New backend/v342LandingFix.test.ts (2 pass); session55Landing + protectedFlows pass; `vite build` OK.
## Deploy note
v342 = v341 (assetlinks) + landing fixes — one deploy covers both. Add PROXY_SHARED_SECRET in the same deploy.

---
# v343 (Session 61, 19 Oct 2026) — UI bug hunt from Ravi's phone screenshots + landing fixes
## Deploy of v342 (done 19 Oct)
- Live: assetlinks.json has BOTH keys (Play 65:B7:… + upload 32:66:…) → Play-installed app opens full screen after
  friends clear app data / reinstall. Site went "Page not found" for a few minutes during the redeploy, then came back.
- Closed test (Alpha) was approved + published 17 Oct. Opt-in links: https://play.google.com/apps/testing/com.ybex.app
  (web, this one opts in) + https://play.google.com/store/apps/details?id=com.ybex.app (install).
## Popups under the bottom bar / page text (brand "Schedule Call" screenshot)
- Root cause: the route wrapper <Page> (App.jsx) faded in with framer-motion; its leftover inline opacity / will-change
  made every page one stacking layer, so popups inside a page (z 9999) stayed UNDER the page footer headline (z 10),
  the bottom nav (z 50) and the Eva bubble. Now the same fade is plain CSS (`.yb-page-in`, fill-mode backwards) →
  nothing stays on the wrapper. Fixes every in-page sheet at once (Explore, campaign detail, UGC explainer…).
- ScheduleCallModal also portals to <body>; its date box no longer runs off the right edge (iPhone). Global CSS: date /
  time inputs min-width 0. Footer headline lost its own z-10.
## Wrong footer copy
- /dashboard is the brand home too → brand now sees "Where Brands Meet Exceptional Creators." (was "Built For Creators.").
- Brand on a creator profile: phone = no footer (the page has its own Save / Invite bar); desktop = "Find Creators Who Fit
  Your Brand." (was "This is how brands see you."). /creators (brand search) copy now talks to brands. /campaigns for a
  brand → brand campaigns copy.
## Creator profile (brand view, phone): the big empty gap under the price list is gone (min-h-screen + pb-32 + pb-28).
## Promo popup ("Meet Ybex Eva" poster)
- Only for signed-in people (it showed on the login screen). Centre card: ✕ now floats above the card's corner instead
  of covering the poster (it hid the "BETA" tag).
## Creators on home screen (Ravi: "kitne bhi select kar sakta hu")
- backend/creatorHomePicks.ts: no "Only 4… Untick one first" limit any more. GET /creators/home-picks returns up to 30.
- NEW public GET /landing-creators: the creators the admin ticked ("Show on creator home"), approved + with a photo, card
  fields only (name, photo, category, city). Nobody ticked → the best approved creators. Cached 5 min.
- Landing creator wall (phone + desktop) shows those creators; the grey "Creator · Fashion · Mumbai" placeholder tiles are
  gone. Fewer than 9 → the list repeats, never the same face side by side / above each other. Admin label:
  "Show on creator home + landing page". Brand home "Meet our top creators" still uses the Explore list (not changed).
## Landing page (phone)
- Newspaper "hand phat raha hai": the photo's right hand was a broken cut-out (see-through fingers, faded palm) plus a
  separate low-res hand PNG on top. New image public/landing/np-reader-v343.webp: hand removed, clean straight paper
  edge (phone + desktop use it). Old c3cbd7c6.webp / 9dcc5c66.webp / 57832b0e.png deleted.
- "Edges smooth": the Payment-hold card's green / purple glows showed square corners on iPhone → glows now in their own
  layer clipped to the 30px rounded corners.
- Scroll "stuck, screen moves up": the page box was 100vh (taller than the visible iPhone screen) so the browser page
  scrolled too and the two fought (also the white strip under the hero). Now: box = visible height, browser page locked
  (html/body overflow hidden while the landing is open), the scroll box has overscroll-behavior contain, and the
  ticker / steps / Eva-demo timers pause while a swipe is happening (they re-rendered the whole page every 0.65–3.5 s).
## Tests
- New backend/v343UiFixes.test.ts (15 pass). Full vitest (node_modules installed this time with bun): 1668 pass, the same
  7 failures as untouched v342 (checked side by side), 0 new. protectedFlows pass. tsc: only the old session58Launch
  test-file errors. `vite build` OK. Screenshots of the landing at iPhone size checked (newspaper, payment card, wall).
## Needs Ravi
- Deploy v343 (one deploy). Then: friends with the Play app → clear Ybex data once.
- Admin → Users → creator → tick "Show on creator home" for the best creators (any number) — they show on the creator
  home AND the landing wall. Only creators with a profile photo appear on the landing.
- Not from Ybex: the "BARTER CAMPAIGN ALERT – WowNews" banner in the screenshot is another app's notification.

---
# v344 (Session 61, 19 Oct 2026) — full-app bug hunt (Ravi: "find more bugs and glitches in complete app")
Three read-only audits (creator side, brand side, shared/backend) → ~50 verified bugs → fixed. Every fix has a `// v344:` comment.
No locked LOGIC_FILE changed; screen files' server calls unchanged (protectedFlows pass).
## Creator side
- Mobile Creator info lost added languages ("English, Hindi" was one chip; only the first was saved) → chips + saved as "a, b".
- Every profile save wrote made-up sub-categories "Reels, Stories" → only real ones.
- Rate card: typing then Back used to get saved later with any other save → local draft, only Save saves.
- Earnings "In hold" counted payments that never went through (FAILED / INITIATED / CANCELLED) → excluded.
- "% match" on Campaigns list / detail showed 100%/0% from one data point → shown only with 2+ parts (same as Home).
- Home: expired campaigns in "Best matches"; profile % wrong when there were no campaigns; KYC "pending" while Profile said
  "Under review" (SUBMITTED / ESCALATED); "My orders" badge (UGC) opened campaign deals; active-deal rows now open that chat.
- Deals tabs keep the URL (Back returns to the right tab). Onboarding 18+ gate can't be skipped with a blank / impossible DOB.
- UGC: a failed KYC load no longer sends approved creators to fill KYC again; "Sign it on desktop" copy fixed; content no
  longer under the submit bar on notched iPhones. Platforms Back loop fixed. Location + portfolio fields 16px (no iPhone zoom);
  dead call to /api/locations/save removed. Closed tab: "Your quote". "1 day" plural. No fake "Instagram" platform row.
- Brands opening /campaigns/:id (mobile + desktop) no longer get the creator Apply / creator KYC prompt; owner → Manage applicants.
## Brand side
- Editing a LIVE campaign: "Save draft" silently took it offline → hidden for live campaigns; edit publish says "Changes sent
  for review"; header "Edit campaign"; no fake "0 Applications".
- Budget: negative / zero / min > max blocked with clear messages (no silent ₹1000). Creators needed 1–500 (no silent 0→10).
- UGC: payout release asked twice → once; "Manage Orders" filter now visible + clearable; Back from post form at /brand/ugc/post
  restores the bottom nav; cancelled / expired / refunded orders show "Closed" (no SLA timer, no "Payment Hold").
- Applicants: a failed load shows "Couldn't load · Retry" (not "No pitches yet"); no fake "Draft" chip.
- Brand home: "N new applicants pitched" was a lifetime total stuck in Needs-your-action → neutral "N applicants so far" row;
  using a template asks before replacing a half-written draft.
- Invite sheets: failed campaigns load → "Couldn't load your campaigns · Retry" (not "no live campaigns"). "(1 review)".
- Page behind sheets no longer scrolls (campaign create sheets, UGC preview / applicants, pitch player). Campaigns "New" menu
  above the bottom nav. KYC "Edit & resubmit" opens the form. Brand profile campaigns via campaigns?mine=true (team members).
  Onboarding "Skip niches & publish" really skips.
## Shared / backend
- Uploads (KYC photos, UGC videos, profile photos) and Eva / AI calls died at 30 s — the longer timeouts never applied (api.js).
- The user object was replaced every 60 s → ~24 screens refetched and the KYC form reset what the creator was typing → kept
  when nothing changed. Login now stores media_key (iPhone app: private images / videos worked only after a reload).
- Creator red "pending work" dot flickered (two pollers overwrote each other) → two states.
- Admin "send to all" / role broadcasts never showed live → accepted. iPhone crash in the popup when `Notification` is missing.
  Toast cooldown timer leak; bell guard before listeners.
- Notifications read / ack now return an error if the DB write fails. POST /tags/create needs login + clean 40-char tags.
  Promo view / click events need login. Profile banner cache per account. Nav photo retries after a new upload.
## Tests
- 7 stale tests updated (the app was right; files had been split / copy changed), 2 more stale assertions (confirm moved,
  link regex), duplicate imports in session58Launch.test.ts (tsc). New: backend/v344Creator / v344Brand / v344Shared tests.
- Full vitest: 1715 pass, 0 fail. tsc: clean. check-crashes: clean. vite build OK. Smoke test of /, /app, /login, /signup,
  /privacy-policy, /help at iPhone size: no runtime errors.
## Needs Ravi
- Deploy v344 (includes v343). Quick phone test: campaign create (budget), edit a live campaign, UGC payout approve (one
  confirm), creator profile languages + rates, Earnings "In hold".

---
# v345 (Session 61, 19 Oct 2026) — Eva fixes from tester Ankit's feedback
- "I need to know about UGC" started the UGC brief builder → questions ("know about / what is / kya hai / samjhao / tell me
  about / how does … work") are now ANSWERED (brand + creator Eva), unless the person also says make / post / order or gives an
  amount. assistKnowledge QUESTION also counts "know about / learn about / info / samjhao / jaanna" — before, that sentence
  was saved as a ticket for the team ("Got it — this just went to the Ybex team").
- "Show it again" on an old chat re-sent the last answer ("Skip") → "Could you tell me a little more?". Brief cards now
  come back from the saved draft (currentDraft); other cards re-ask only when that message was a real request (2+ words).
- A UGC brief finished with Eva is saved as the UGC draft right away (never over a brief written by hand), and UGC → My
  briefs now shows a "Draft · not posted yet · made with Eva" card with Resume / Discard (before: only behind the + button,
  and only if "Review & Pay now" was tapped). Cleared after payment.
- Tests: backend/v345Eva.test.ts (7). Full suite green; build OK.
- Open: Ankit's payment message was cut off ("Google Pay selected tha to …") — need the rest / a screenshot.

---
# v346 (Session 61, 19 Oct 2026) — black-box + white-box testing (Ravi: "blackbox and white box testing")
## How it was tested
- BLACK BOX: the app ran here (dev server + a fake Supabase in memory — there is no offline DB mode; Razorpay / Google /
  push not reachable) at iPhone 13 size. Journeys: creator signup → onboarding → profile → campaigns → apply → UGC →
  earnings → KYC → help; brand signup → onboarding → campaign create / edit → applicants → explore → invite → UGC brief to
  payment (test mode) → profile / KYC; creator ↔ brand apply → shortlist → chat; admin "Show on creator home". Live site
  NOT tested this time (the Chrome connection was down).
- WHITE BOX: code coverage with vitest v8 + 170 new tests on money / state logic (backend/wb*.test.ts).
  Branch coverage 62.5% → 65.3%; feeCalculator 100%, dealState 100% (statements), ugcOrderStage / dealFlow ~100%.
## Fixed (unlocked files)
- HIGH: Edit Profile wiped the bio (and cover photo) on save. HIGH: creator phone was public inside rate_card.extras
  (privacy strip now recursive). HIGH: campaign pitch showed email / phone to the brand → masked on screen (new
  src/utils/maskContact.js; the server apply route is locked).
- Chat filter now catches mixed numbers ("nine eight 76 5…"). Finish-later creators get the bottom nav. A published
  campaign no longer comes back as a local "draft". Rates: whole ₹0–10,00,000 only. Home picks: only approved creators
  with a photo, never yourself; admin gets a warning when a ticked creator can't show yet. Landing ticker = true product
  statements (no "Ananya selected for Nykaa"). No sample boAt / Nike / Mamaearth banners. Emoji names → correct initials.
  Quick-action sheet: once per session after ✕. Brand name / website / UGC sample URL checks; UGC budget below minimum
  shows an error (no silent ₹1). ?role=brand on signup, long titles clamped, logout → clean /login, creator KYC says why
  Submit is off. Landing content loaded in dev (StrictMode).
- Money: referral monthly cap now really stops over-cap rewards; a free deal is charged to the block live at that time;
  free deals fail CLOSED if the DB read fails; a creator can request the rest of a payout after a part refund; admin
  Escrow / Release modal show + pay "after ₹X refund" (not the full net). IST age (18th birthday early morning),
  "N/A" → "—", deadline reminders ("1 minute", no "Invalid Date", no crash on a bad deadline).
- NOT changed on purpose: creators' generated campaign "views / N+ applied" (Ravi's Session 38 decision) — ask Ravi.
## Bugs found in LOCKED files — need Ravi's OK (npm run protect:update) before fixing
 1. chat_routes.ts:523 — any user can post lifecycle messages (payout_released, payment_funded, content_approved,
    order_cancelled…) that the app trusts → fake "paid / completed / cancelled". Fix: non-staff may send only text / file
    types. (SECURITY — most important)
 2. directInvites.ts:20 + invitationUtils.js:27 — invite budget "15000 + 18% GST" becomes ₹15,00,018 and goes into the deal.
 3. payment_routes.ts:691 / 815 — escrow overview + payout record use the full net after a part refund (UI now corrected;
    server record can still say "Payout ₹19,000" when ₹0 is owed).
 4. payment_routes.ts:1391/1413 — unknown amount + Razorpay fetch failure → payment recorded as funded for ₹1.
 5. deals_chat_routes.ts:390/421 — UGC pay callback accepts refunded rows; falls back to an invented ₹5,000.
 6. feeCalculator.ts:63 — an "offer" fee can be HIGHER than the normal fee; :83 negative / non-numeric coupon → higher fee / NaN.
 7. agreementTerms.js:68 — UGC agreement doesn't mention the convenience fee that is deducted.
 8. creators_routes.ts:1604 — "Invite to campaign" after the creator applied → two deal threads (brand could pay twice).
 9. campaigns_routes.ts (apply) — pitch text not filtered on the server (masked on screen now).
 Product decision: adminMoney.netAfterPartialRefund takes the whole refund from the creator while Ybex keeps the full fee.
## Also open (not fixed): Eva bubble can cover "Finish" / "View all" on creator home; Earnings asks for a payout
  account even after KYC UPI; brand KYC form lost on refresh; editing a live campaign sends it back to review.
## Tests: 200 files, 1933 pass, 0 fail (9 it.fails document the locked bugs above). tsc clean, crash guard clean, build OK,
  public pages smoke-tested at iPhone size with no errors.

---
# v347 (Session 61, 19 Oct 2026) — locked-file bugs fixed (Ravi: "Haan, locked bugs fix karo") + 2 owner bugs
Re-signed with protect:update (reason logged in docs/code/PROTECTED_CHANGES.md): 9 logic files + invite screen calls.
1. chat_routes.ts — SECURITY: non-staff may post only text / attachment / file / image / video; anything else (payout_released,
   payment_funded, content_approved, order_cancelled…) is saved as plain "text". Staff unchanged. Lifecycle cards come
   from the server directly, so no real flow changes.
2. directInvites.ts + invitationUtils.js — invite budget takes the first number ("15000 + 18% GST" → ₹15,000; ranges shown
   "₹10,000 – ₹15,000").
3. payment_routes.ts — escrow overview has payable_net (after part refund); releasing a payout with nothing left after a
   refund → 400 NOTHING_LEFT_AFTER_REFUND (no more "Payout ₹19,000" when ₹0 is owed).
4. payment_routes.ts — unknown amount + Razorpay fetch failure → unconfirmed (retry), never recorded as funded for ₹1.
5. deals_chat_routes.ts — UGC pay callback ignores refunded rows; no invented ₹5,000 (409 AMOUNT_UNCONFIRMED).
6. feeCalculator.ts — offer fee can never be higher than the normal fee; flat coupon ≥ 0, fee never below 0.
7. agreementTerms.js — UGC agreement discloses the convenience fee (+GST) & TDS deducted from the payout.
8. creators_routes.ts + directInvites.ts + InviteToCampaignModal — invite to a creator who already applied / is in an open
   deal for that campaign → 409 ALREADY_IN_CAMPAIGN; the sheet shows "Already applied / in a deal" + Open chat.
9. campaigns_routes.ts /campaigns/apply — pitch contact details masked on the server ("[hidden]"); never rejected.
## Owner bugs
- KYC UPI now counts as the payout account: new backend/kycPayoutMethod.ts + GET /creator/payment-methods/kyc (masked UPI,
  bank last-4, never PAN); Earnings / payout request / Eva use it when no method is saved (a saved method wins).
- Brand KYC (mobile + desktop) keeps typed text fields after refresh (per-user draft, no files / OTPs), "Draft restored"
  note, cleared after submit; a pending / approved KYC always loads from the server.
## Still waiting for Ravi: (a) creators' generated "views / N+ applied" (Session 38 choice) keep or remove? (b) part refund:
  recompute the fee on the amount left (creator gets ₹4,250 not ₹3,500 on ₹10k with ₹5k refunded)? — 1 it.fails documents it.
## Tests: 202 files, 1976 pass, 0 fail. tsc / crash guard clean, web build + server bundle OK.

---
# v348 (Session 62, 19 Oct 2026) — manual settle / refund, promo fixes, desktop OTP login, phone UI bugs
## 1. Settle / Refund by hand (Ravi: "kisko kitna dena hai wo mere upar — tu decide mat kar")
- New `backend/manualSettlement.ts` (not locked) + `src/components/admin/SettleDealModal.jsx`.
  GET / POST `/admin/settlements/:txId` (sub-admins need manage_escrow). Campaign / invite deal payments only (UGC keeps
  Admin → Escrow → UGC Refunds).
- Admin picks Ybex convenience fee (No fee / 1% / 2% / 5% / other %) and who gets the rest (All to brand / All to creator /
  Half–half) or types the 3 amounts. Nothing pre-chosen. Must add up to what the brand paid. Reason (list + text), note
  (brand + creator see it). For each side that gets money: its UPI QR with the amount filled in (or bank details), then the UTR.
  Review → Confirm & save. Brand + creator get a notification. Admin log `MANUAL_SETTLEMENT`.
- Where: phone Admin → Payouts → "Settle / Refund" on in-production deals + in the Pay sheet (was the dead "Refund brand");
  desktop Escrow → "Settle" next to Refund.
- Saved on the payment row (no DB change): refund_* = brand part, payout_* = creator part (PAID), platform_fee_amount =
  correct_fee_amount = Ybex part, gst_amount 0, creator_net_amount = creator part, `notes` = JSON of the split + the ORIGINAL
  fee / GST / net. The locked release-payout route then refuses any second payout (tests prove each case).
- Creator part needs approved KYC + payouts not frozen (same rules as normal payouts).
## 2. Promo popups
- Eva poster / any popup + desktop Eva: only for signed-in people on app pages — never landing, login, signup, legal,
  share links, blog, admin (`src/lib/inAppPage.js`).
- Popups take turns: same priority → alternate each app open; a "once" popup already seen no longer blocks the next.
  Profile banner (My Profile strip) is separate and always shows. Live DB check: Ravi's "invite" promo is saved as a
  BOTTOM SHEET popup (not Profile banner), same priority 100 as the Eva card → it was always losing; now they alternate.
- "Tap opens" = page list (Home, Chat with Ybex Eva `/dashboard?assist=new`, Refer & Earn `/refer`, Inbox, KYC, Earnings,
  Explore, New campaign, UGC…) + "Other link". A pasted https://ybexapp.ai.studio/… or ybexmedia.in link becomes the app page.
## 3. Login
- Desktop /login: "Login with OTP (email code)" (same endpoints + limits as the phone). Wrong password / no-password account →
  "Login with OTP instead" (sends the code to the typed email). No-password account message says so.
- Google: website button asks `prompt=select_account consent`. iPhone app shows the empty email page because
  SFSafariViewController (@capacitor/browser) has its own cookies — fixing it needs ASWebAuthenticationSession or native
  Google Sign-In = new iOS build.
## 4. Phone UI (Ravi's screenshots)
- Chat: no empty gap above the keyboard (home-bar padding dropped while the keyboard is open).
- Stuck unread "1" on finished deals: the admin "Payout Disbursed" card has no sender; open-chat marks read only
  `sender <> me` (NULL never matches) → never cleared. Counts now skip no-sender rows (inboxLean.ts, server.ts) + the phone
  remembers when each chat was opened (`src/lib/threadSeen.js`); home "unread" rows use the same count.
- Quick action sheet drawn on <body> above the bottom nav. Bottom nav: solid background, 58px + safe area (was 84px).
## Tests
- New backend/v348Settlement.test.ts, backend/v348UiFixes.test.ts, src/pages/auth/desktopOtpLogin.test.jsx.
  Full vitest: 205 files, 2002 pass, 0 fail. tsc clean, crash guard clean, web build + server bundle OK.
## Needs Ravi
- Deploy v348. Then Admin → Promo popups: edit the Eva card → Tap opens "Chat with Ybex Eva". If the invite poster should
  be the My Profile strip, edit it → Layout "Profile banner" + a 1080×200 poster.
- Phone check: chat keyboard gap, quick action sheet, nav bar, inbox badge; desktop OTP login; one test settlement.
- Option (b) part-refund fee question is now covered by the manual Settle tool (admin decides the fee each time).

---
# v349 (Session 62, 19 Oct 2026) — hide a creator from Explore + real Instagram numbers
DB change approved by Ravi ("Haan, kar do") and APPLIED live: scripts/sql/OLD_SQL_already_run.sql (session62_explore_instagram part)
(creator_profiles.hidden_from_explore / instagram_verified_at / instagram_verify_method / instagram_synced_at / instagram_stats,
table instagram_connections — RLS on, server only). Browser can't write these columns (browserDbRoutes STAFF_ONLY).
## 1. Hide from Explore (Ravi: "delete / ban ke alawa sirf hatane ka option")
- Admin → Users → creator → "Hide from Explore & Meet the Creators" (POST /admin/creators/:id/explore-hide, logged).
  Hidden = not on Explore, Meet the Creators, top creators, landing wall, home picks, Eva search. Profile link, deals,
  chats keep working. Admin list shows a "Hidden from Explore" chip.
- Logged-out Explore preview fills complete rows (no 2 empty slots before "Sign in to see more").
## 2. Instagram real data (backend/instagramConnect.ts, src/components/instagram/InstagramConnectCard.jsx)
- Username → followers, posts, avg likes / comments / reel views, engagement via Meta's official Business Discovery
  (asked by Ybex's own Instagram). Creator / Business accounts only (personal → "switch to Creator" message).
- Verify (creator picks): DM code YBX-XXXXXX to Ybex's Instagram (webhook /api/webhooks/instagram, signed) OR
  Log in with Instagram (OAuth, adds 28-day reach / views; token AES-sealed in instagram_connections, auto-refreshed).
- Daily refresh by itself (hourly job, ≤60 creators/hour). Admin → Users → creator → "Refresh from Instagram".
- Guard before the locked POST /creators/profile: synced numbers can't be typed over; a new username drops old sync.
- One Instagram can be verified by only one Ybex account.
- Shows nothing new until secrets are set → docs/setup/INSTAGRAM_SETUP.md (Ravi's Meta steps). DM code + Instagram
  Login reach the public only after Meta App Review (testers work before).
## Tests
New backend/v349Instagram.test.ts (14), backend/v349ExploreHide.test.ts (12). Full vitest 207 files / 2028 pass, 0 fail.
tsc clean, crash guard clean, web build + server bundle OK.
## Needs Ravi
- Deploy v349 (includes v348). Admin → Users → creator → Hide toggle to test.
- Instagram: follow docs/setup/INSTAGRAM_SETUP.md part A first (username fetch), then B (DM) / C (login) + App Review.

---
# v350 (Session 62, 19 Oct 2026) — landing page from Ravi's new design files
Compared Ybex_Landing_Mobile/Desktop_offline (new) with the live landing, section by section at 390 px and 1440 px
(screenshots side by side) and text / data / images programmatically.
- New: the newspaper photo `public/landing/np-reader-v350.webp` (designer's version with a clean right hand holding the
  paper). Old np-reader-v343.webp deleted (v343 test pin moved — requirement change, commented).
- Bug found while comparing: the app's global `img { max-width: 100% }` squeezed that photo by ~13 % (paper looked tilted,
  hand slid under the print) → `maxWidth: "none"` on it (phone + desktop).
- Bug: the app's global `* { font-family: DM Sans }` beat inheritance, so the newspaper headline ("UGC VIDEOS DELIVERED IN
  24 HOURS") showed in DM Sans instead of Oswald → `.ybl-root *{font-family:inherit}` in both landing CSS files.
- Kept on purpose (earlier decisions, not reverted to the design file): ticker = true product statements (v346, no
  "Ananya selected for Nykaa"); trust strip "Agreements signed with Email OTP" (Ybex doesn't use Leegality); reviews only
  from Admin (v333, the design's sample quotes never show); creator wall = admin-picked creators (v343).
- Everything else (layout, copy, other images) already matched.
- Tests: full vitest 207 files / 2028 pass. Build OK.

---
# v351 (Session 62, 19 Oct 2026) — Instagram username fetch set up live on Meta
Meta app **Ybex** (ID 913426198373843, Business type, Development mode). Instagram = **ybex.in** (IG business id
17841480473392276, 8,777 followers), linked to Facebook Page **YBEX MEDIA** (1391240684081902).
- Business Discovery kept failing with "(#10) Application does not have permission". Real cause (Meta docs): the token
  also needs **instagram_manage_insights** and **ads_read** (Page sits in Business Manager). Added both → test
  `business_discovery.username(bluebottle)` returned 518,555 followers ✅.
- Made a never-expiring **Page token** (Extend Access Token → me/accounts → YBEX MEDIA access_token). Debugger: Type Page,
  Expires Never, all 8 scopes. Data-access expiry ~3 months renews while Ravi stays active on Facebook.
- Code: `backend/instagramConnect.ts` default Graph version v21.0 → **v26.0** (Explorer only offers v26.0 now).
  ENV_KEYS.md + docs/setup/INSTAGRAM_SETUP.md part A rewritten with the exact steps that worked.
- Claude in Chrome failed on developers.facebook.com again (screenshot / find / page text) → Ravi did the clicks.
## Needs Ravi
- AI Studio secrets: `IG_GRAPH_TOKEN` (the Page token — never share it), `IG_BUSINESS_ID` = 17841480473392276,
  `IG_GRAPH_VERSION` = v26.0. Then deploy **v351** (includes v348–v350).
- Test: creator → Profile / Settings → "Live Instagram numbers" → username → Fetch.
- Next: DM-code (webhook + App Review), Instagram Login (IG_APP_ID/SECRET + App Review), System User token.

---
# v352 (Session 63, 20 Oct 2026) — "Fetch from Instagram" next to every Instagram username box
Ravi: "pure code mein jaha jaha username daalte hain wahan fetch lagao — creator form, profile settings, sab jagah".
- New `src/components/instagram/InstagramFetchButton.jsx`: one small row under a username box →
  **[⟳ Fetch from Instagram] ✅ 15,234 followers fetched**. Fills that form's own boxes (followers, avg reach/views,
  avg likes, avg comments). Hidden until the IG secrets are set, so nothing changes on screen before that.
- Placed in: public creator apply form (desktop + mobile; also fills the name if empty) · creator onboarding desktop
  (Step 1 both layouts, Step 3 Instagram details) · creator onboarding mobile (handle screen + Instagram details sheet) ·
  creator settings desktop (PlatformsPanel) · creator profile mobile (InstagramStatsForm) · Admin → creator edit ·
  Admin → waitlist edit · brand onboarding desktop (brand Instagram).
- Settings (logged-in creator) use the existing `POST /creator/instagram/lookup` → saved as live numbers, update daily.
  All other forms use new **`POST /api/instagram/preview`** → numbers only, nothing saved; the form saves as usual.
- `/instagram/preview` limits (Meta gives ~200 calls/hour): 6-hour cache per username, 6/hour per logged-out visitor
  (IP), 15/hour per user, 60/hour admin, max 80 non-admin previews/hour total. New `GET /api/instagram/config`
  tells the forms whether to show the button. Code in `backend/instagramConnect.ts` (not a locked file).
- No locked file touched. Tests: new `backend/v352InstagramFetchEverywhere.test.ts`; full vitest 208 files / 2032 pass.
  tsc + crash guard + vite build OK.
## Needs Ravi
- Same as v351: IG secrets → deploy **v352** (includes v343–v351). After deploy test Fetch in: apply form, onboarding,
  Settings → Platforms, Admin → creator edit.

---
# v353 (Session 63, 20 Oct 2026) — creator-side UI/UX bug hunt (phone first)
Ravi: "deep jaake UI/UX bugs aur glitches dhundo aur fix karo — UX easy hona chahiye". Ran the app locally at 390px with fake
data (no real server/DB touched), screenshotted every creator screen, plus a code audit of home, campaigns/UGC, chat and
profile/onboarding. Fixed (screen files only — no LOGIC_FILES, no server call added/removed):
- **Layout:** "Showcase What Makes You Different. This is how brands see you." showed under the creator's own
  Notifications / Deals pages → only on a creator's public page now.
- **Campaigns:** "based in Pan India" → "anywhere in India"; "Brand Name" placeholder → "Brand"; Apply no longer crashes
  (niche saved as a list / account with no name); no-niche creators get "Add your niche in Profile to apply" + button;
  "Pending" everywhere for a pending application.
- **Deals:** tabs showed "Ongoing0"; Completed count no longer includes rejected/declined (tab → "Past" when it has them).
- **Instant UGC:** upload box / Submit only while filming or fixing changes; delivered/completed orders show "Delivered",
  not red OVERDUE; "Upload before…" (not Re-upload) on first upload; 50 MB check right away; edited filter, pill counts,
  no made-up "30–60s"/"Authentic UGC…" text.
- **Home:** Active deals leave out finished deals; specific badges (IN REVIEW / AWAITING PAYMENT / OFFER / PENDING);
  "KYC needs a fix" / "Complete KYC"; less empty space at the bottom; no "Brand Partner" placeholder.
- **Earnings:** receipts show the real brand + creator name; unpaid payout no longer says "successfully transferred";
  rejected KYC shown right; one KYC prompt; fake "View proof" box removed; In-hold sheet labels fixed.
- **Refer:** back button + "Invite & earn" title on phone; ₹0 reward lines hidden; wallet chip = wallet balance.
- **Notifications:** proper titles (Payment update / New offer / New message); "Reupload draft" only where it belongs;
  server error now shows "Couldn't load · Retry" (was "all caught up"); welcome says "Ybex" and opens Home.
- **Chat (creator):** Accept on the first offer in "Respond to offer" opens the contract (was "no counter offer waiting");
  a second Send while sending no longer loses the text; keyboard open scrolls to newest message; status popup labels for
  real states, no "money held" claim before payment, ₹0 fee row removed; approved draft stays approved after live link;
  upload button only when due; payout card "Approved · payout next" until UTR; pinned brief cards don't squash.
- **Profile/KYC/onboarding:** typed edits no longer wiped by inline saves; picking a city keeps the state; rejected /
  "more info needed" KYC states with reason + resubmit; KYC card doesn't flash while loading; photo "saved" only on
  success; one toast per save; all languages selectable; portfolio delete asks first; 36px tap targets; barter labels;
  heart only for brands; onboarding back chevron; pasted Instagram links → handle; autosave failure toast;
  avatars use local initials (no ui-avatars.com); "KYC compliance" → "KYC verification"; "Chat with support" → "Contact support".
## Needs Ravi (LOCKED — chatStageMap.js / useChatThreadMobile.js, not changed)
- Inbox chip says "Offer received" when agreement is ready to sign; "In production" when creator must upload;
  declined-changes states say "Your turn"; ₹ in chip is gross not net; raw error text in chat toasts; brand who signed sees
  "Waiting on brand". Say OK to unlock and fix these.
- Skipped: UGC "Open brief & sign" button for unsigned orders (needs a server check), X/Threads on profile platforms.
- Tests: full vitest 208 files / 2032 pass; tsc + crash guard + vite build OK. Deploy v353 (includes v343–v352).

---
# v354 (Session 63, 20 Oct 2026) — Instagram: username once → photo, numbers, reels; smart refresh; admin bulk fetch
Ravi: "onboarding mein ek baar username maanga — photo, followers, reach, engagement sab apne aap; manual photo ho to
wahi rahe; inactive ko baar-baar fetch mat karo; admin se ek button sab creators + unclaimed + waitlist ke liye;
creator form mein 'Fetching your data' popup; portfolio mein Instagram se sirf brand-promotion reels select karo".
- **Auto fetch everywhere** (`InstagramFetchButton`): ~1 s after a new valid username is typed → popup "Fetching your
  Instagram data…" → boxes fill. A username already there when the screen opens is not re-fetched. Button = Refresh.
- **Photo:** server copies the Instagram picture to `avatars/ig/<username>` (existing bucket, no DB change). Used when
  there's no photo / Google / placeholder / our older copy (weekly refresh). Uploaded photos are never replaced (tested).
- **Apply form:** also fills photo, name (if empty) and an e-mail found in the bio (if the box is empty). Meta never
  gives the real login e-mail — not possible via any Meta setting.
- **Onboarding (mobile):** Instagram handle moved above the name; fetch fills photo, name, numbers and marks Instagram
  linked, so the Instagram-numbers sheet is skipped. Last step: "Pick from Instagram" (posts grid, "Collab" tag for
  #ad / #collab / paid partnership / use code, max 6) or "Upload manually". Picks go to the profile portfolio (what
  brands see). Fixed: the manual onboarding item went only to creator_portfolio_items, which the public profile never
  shows — it now goes to the profile portfolio too. On submit the numbers are marked "live" (cached, no extra call).
- **Onboarding (desktop) Step 4:** same picker / manual tabs. **Profile → Portfolio:** "Import brand collabs from Instagram".
- **Smart refresh:** used app in last 24 h → daily; 1–7 days → every 3 days; 7+ days / never logged in → every 10 days
  (last use read from login renewals, which are stored once a day). Max 60/hour.
- **One Meta budget** (180/hour) + 6-hour cache per username shared by preview, lookup, refresh, bulk.
- **Admin bulk:** Admin → Users (All/Creators/Unclaimed) and Waitlist → "Fetch Instagram for everyone" (all creator
  profiles + pending waitlist: numbers + photo where none uploaded). Background job, progress bar, waits for Meta's
  hourly limit. Skips profiles fetched in the last 20 h unless "Also ones updated today" is ticked. Today ≈ 32 profiles
  + 44 pending waitlist ≈ 76 calls (fits in one hour).
- Fix: mobile apply form — the Avg. reach box was pushed off the right edge.
- Tests: new `v354InstagramAutofill.test.ts` (helpers, schedule, field fallback) + `v354InstagramRoutes.test.ts`
  (preview / lookup / bulk with fake DB + Meta). Full vitest 210 files / 2046 pass; tsc + crash guard + build OK.
## Needs Ravi
- IG secrets (IG_GRAPH_TOKEN, IG_BUSINESS_ID, IG_GRAPH_VERSION=v26.0) → deploy **v354** → Admin → Waitlist →
  "Fetch Instagram for everyone" → Fetch now. Then check a few photos / numbers and approve.
- Not verified live yet: whether Business Discovery returns `thumbnail_url`/`permalink` for other accounts' posts.
  If not, numbers still work (automatic fallback) but the reel picker shows "couldn't find posts" → tell Claude.

---
# v355 (Session 63, 20 Oct 2026) — locked chat files fixed (Ravi approved: "ok h in pr bhi kaam kro")
Unlocked + logged via `npm run protect:update` (docs/code/PROTECTED_CHANGES.md). No server call changed.
- `chatStageMap.js` (inbox chips + "Needs action" quick actions):
  - Price agreed, nobody signed → "Sign contract" (was "Offer received" while the chat said SIGN AGREEMENT).
  - Later states never fall back to "Negotiating" just because a signature flag is missing.
  - Payment held → creator chip "Your turn · upload draft" (needs action); brand "In production".
  - Creator declined the changes (REVISION_DECLINED / _LINKS) → own "changes_declined" stage: creator "Waiting on brand",
    brand "Creator declined changes"; no upload action; no longer shown as a declined deal.
  - Creator's own application price → "Offer sent · waiting" (brand sees "Offer received").
  - Brand who signed → "Waiting on creator" (was "Waiting on brand").
  - Creator money chip has no gross amount ("Approved · payout next" / "Payment received"); brand keeps the amount.
    Old test pin on "₹15,000 received" moved — requirement change, commented in the test.
- `useChatThreadMobile.js`: every error toast goes through `calmError` (no "timeout of 45000ms exceeded" /
  "Network Error"); Razorpay cancel → "Payment cancelled."; accept / counter return false on failure →
  `MobileRespondOfferSheet` stays open.
- `ChatBoxMobile.jsx`: "REVISIONS DECLINED" bar → calm amber "CHANGES DECLINED · WAITING FOR BRAND", no pulse, doesn't
  open the Upload sheet.
- Tests: 5 new chip tests in chatStageMapUgc.test.js. Full vitest 210 files / 2051 pass; tsc + crash guard + build OK.

---
# v356 (Session 63, 20 Oct 2026) — new footers from Ravi's "Settings & Home" design (phone + desktop)
Ravi: "ye footer designs banaye h new, inko implement kro creator home, brand home aur settings pr, desktop + mobile dono".
- **Homes** (`src/components/footer/HomeCityFooter.jsx`, used by Layout for /dashboard + /brand/dashboard, replaces the old
  grey "Built For Creators." / "Where Brands Meet…" headline there):
  - Creator home → "From The Corner Shop To **The Tallest Tower.**" + "Brands of every size, from every city, lane and
    mohalla." with the colour city art (`public/img/footer/city-brands.svg`).
  - Brand home → "Every Kind Of Creator. From **Every Town.**" + "Metro influencers to tier 3 storytellers, every niche."
    with the creators-in-the-city art (`public/img/footer/city-creators.svg`).
  - Phone = design 1:1 (300px, text top-left, art on the right, road sits on the bottom nav; a CSS road continues the
    art's road to the left edge, dashes in step). Desktop = same art 360px high on the right, 32–46px headline on the left,
    road across the full page width.
- **Settings** (`src/components/footer/FounderNote.jsx`):
  - Phone (creator My Profile hub + brand Company Profile hub): white "Log out" card (same action; brand still asks in the
    confirm sheet — moved out of the list into its own card like the design), "Ybex v356 · © 2026 Ybex Media. All rights
    reserved.", then the founder note — "Why I built Ybex", line, signature, Ravi Sharma / Founder, Ybex, @ybex.in,
    "Crafted with ♥ in Jaipur", 3D Ravi on the right with the purple glow — ending on the bottom nav.
  - Desktop (creator + brand Settings Hub): the same note as a wide soft card under the panels + version line.
  - Phone /brand/profile no longer adds the old "Tell Creators What…" footer under the hub.
- Version label: new `src/lib/appVersion.js` (VITE_APP_VERSION wins, else "v356").
- Images from the design file: SVG metadata stripped (~25 KB each), founder + signature as WebP (24 KB / 12 KB).
- No server call, locked file or DB change. Repo +7 files.
- Checked at 390 / 360 px phone and 1024 / 1440 px desktop with fake data (screenshots).
- Tests: new `backend/v356Footers.test.ts` (4). Full vitest 211 files / 2055 pass; tsc + crash guard + vite build OK.
## Needs Ravi
- Deploy v356 (includes v343–v355) with the IG secrets from the v354/v355 notes.

---
# v357 (Session 63, 20 Oct 2026) — new sign-ups go to the waitlist, Explore only after admin approval
Ravi: "creator register karte hi Explore pe show ho jaata hai, waitlist mein nahi jaata. Pehle jaisa karo: register →
'under review' + waitlist; jisko main approve karunga wahi Explore pe."
## Cause (live DB, read only)
- `creator_profiles.profile_status` has DB default **'approved'**. A creator's first profile save (locked POST
  /creators/profile autosave, GET /creators/:id auto-create, /auth/onboard) makes the row without a status → "approved"
  at once → Explore. Only the phone onboarding's final Submit set "under_review", so anyone who hadn't finished (or had
  autosaved earlier) sat on Explore. Waitlist lists only "under_review" rows → these never showed there.
- Live on 20 Oct: 5 such profiles (approved, never reviewed): Sakshi Matta, Tanuj Sharma, jatin sharma, Babu bhaiya
  (onboarding not finished) and "Review Creator" (Play reviewer test account).
## Fix (no locked file, no DB change)
- `backend/exploreGate.ts`: `approvedByAdmin(row)` — a self-registered (claimed) profile created after 10 Oct counts as
  approved only with `reviewed_at` (set by Waitlist approve / reject and now by Admin → creator edit). Unclaimed form
  profiles and older creators unchanged. `awaitingReview(row)` = needs review. Used by: /creators/explore filter,
  landing / misc list, home picks + Eva search (`isShowableCreator`), frontend `visibleCreators` + Explore (desktop).
- Admin → Waitlist (`admin_waitlist_routes.ts`): also lists `awaitingReview` creators as Pending (approve → Explore).
- New `backend/creatorReviewGate.ts` (before the locked creators routes): a creator's FIRST POST /creators/profile →
  row set to "under_review" after the save. `/auth/onboard` new creator rows → "under_review".
- `/auth/me`: such a creator sees "under_review" (not "approved").
- Admin → creator edit: shows "Under Review" for these (saving other fields no longer approves by accident); picking
  Approved / Rejected sets reviewed_at.
- Optional DB default change noted in docs/database/PENDING_DB_CHANGES.md (needs Ravi's OK).
## Tests
New `backend/v357ReviewGate.test.ts` (6). session43Batch3 pin updated (requirement change, commented). Full vitest
212 files / 2061 pass; tsc + crash guard + vite build + server bundle OK; protectedFlows 9/9.
## Needs Ravi
- Deploy v357 (includes v343–v356). Then Admin → Waitlist: the 5 above show as Pending → approve the real ones
  (Review Creator = Play reviewer account; approve it if reviewers should see it on Explore).
- Test: new creator signs up → not on Explore, shows in Waitlist → Approve → on Explore (cache up to a few minutes).

---
# v358 (Session 63, 20 Oct 2026) — brand-side UI/UX bug hunt (phone first, then desktop)
Ravi: "creator side ho gaya, ab brand side pe deep jaake UI/UX bugs + glitches find and fix". Ran the app locally at
390 px and 1440 px with fake data (no real server / DB) + 3 read-only code audits (home/explore/profile, campaigns/
payments/KYC, Instant UGC/inbox) → ~125 findings, each checked in code → fixed in 63 screen files. Every change has a
`// v358:` comment. No LOGIC_FILE, no server call (method + path), no DB change.
## Home / Explore / profile / onboarding
- No admin banner → built-in banners are now purple TEXT cards (title, line, CTA) — they were unrelated stock photos with
  no words (empty box when the photo didn't load); no "4K footage in 48 hours" promise. Admin banner badge = its tag only
  (was the internal "Dashboard Hero Carousel").
- A failed load no longer makes an active brand look new ("Welcome / Post your first brief"); UGC-brief-only brands count
  as active; KYC "APPROVED" in capitals counts; "more info needed" KYC = amber "Action needed" + admin note + "Update KYC";
  failed KYC check = "Couldn't check · Retry" (not "KYC not done"). "Payouts" → "Payments" (brands pay).
- Explore: niche pill showed "Fashion & Lifest" cut mid-word → short name + ellipsis; filter-sheet count includes the search;
  no raw server text in toasts. Desktop multi-invite: "Sent to X of Y", failed ones stay selected, plurals, initials.
- Brand on a phone now sees a creator's "Past work"; review count = real reviews. Invite sheet inputs 16 px (iPhone zoom);
  desktop invite gets a campaign picker (same POST), ₹ icon, optional fields.
- Profile hub: phone Back no longer loops into sub-screens; a failed profile load blocks Save (no wiping real data); saved
  preferences light the right chips (alias map); logo / cover saved right after upload; Share uses the real brand page;
  public preview lists live campaigns only. Brand public page: in-review / paused campaigns no longer "Open".
- Desktop home: invented rising mini-charts → flat; ₹ amounts with L / Cr. Tour: no "4M+ creators". Invented claims removed
  (3x applications, 80+ creators, "dedicated Campaign Manager"); onboarding preview shows the real city.
- "Contact Us" makes max one support ticket per session.
## Campaigns
- Editing a LIVE campaign: no "Save as Draft" (desktop + KYC notice) — it used to take it offline; button "Send changes
  for review" + note; true toasts ("sent for review"). Edit keeps creator reach, creators-needed and all deliverables
  (were reset to Micro / 50 / first item). Desktop draft keeps its deadline. "New campaign" with a saved draft starts fresh
  (`?fresh=1`); KYC wall removed from "New" (publish still needs KYC). No pre-filled example budgets.
- Publish re-checks step 1 (brief ≥15 chars, niche) and blocks a past close date. Preview: tick only if KYC approved,
  badge "Preview". Success screen: pitches show in Campaigns (not inbox). 32 px remove buttons.
- Phone campaign page (applicants): cards touched the screen edges → padded; "Review N new applicant(s)" / "See all";
  Shortlisted stat = tab; one clear toast after shortlist + per-card busy; no "@creator" / "India" placeholders.
- Lists: "Not approved" tab, Launch busy state, end-of-day IST deadline, full budget range. Desktop header shows
  Paused / Closed; owner sees "Your campaign" (not "Apply"); owner bar works with campaign_id.
## Payments / KYC
- Approved brand resubmitting KYC gets a warning first (it goes back to review). Desktop KYC no longer resets typed fields
  every minute; failed read = Retry banner. "Reviewed by Ybex · usually within a day" (was "automated"). Solo = PAN needed.
- Held / active totals count only money really held (not pending / refunded / failed). "Released this year" (IST year).
  Escrow sheet says "Waiting for creator" until delivery. Receipt: no "Verified Brand" / "ITC eligible". "Creator Pro" → "Creator".
## Instant UGC / inbox
- Phone order screen: live-post card with "Open post ↗", declined reason, revision notes; closed orders say "Order closed"
  (no red timer / "held"); revision-requested = waiting state; 3-step bar for raw UGC; Back closes the order / wizard.
- No "Past deadline" on a draft waiting for the brand; new "Creator declined" / "Changes asked" badges; no "auto release
  if SLA runs out" promise; 24–72 h (not 24 h) everywhere; "Uploaded in the app" (not Google Drive).
- "Order help" now sends the real order (was "ORD-PENDING" + creator reasons). Pay buttons busy ("Opening checkout…");
  calm payment errors. AI Assist keeps the chosen format. "Creators (N)".
- Approved downloads open through the media link (were broken); "Paid" only after UTR; "Ybex pays the creator's bank".
- Desktop: closed orders grey "Closed"; no frozen "24h 00m 00s"; no "Product Item" / "Verified UGC Creator"; brief cards no
  fake "Admin Alerted / Expired"; total held + per-video price; header "UGC Orders".
- Chat (unlocked cards): no master download before the order is final; raw UGC "Approve & release ₹X"; escrow sheet no
  "full refund if deadline missed". Cancel brief: refund in 1–2 working days, number keypad.
- Inbox: local initials (no dicebear image); desktop empty right panel = "Select a chat" (was "No activity yet");
  brand Inbox unread badge on desktop sidebar + drawer; Back from a chat returns to the list; ?creator= links.
## Not changed (need Ravi / server)
- LOCKED chatStageMap.js: brand chips for declined UGC links / revisions and CANCELLED orders; useChatThreadMobile release
  confirm without ₹ / name; BurgerMenuSupport "system scanners" text; ChatBox.jsx copy.
- Server (locked): budget 0 → ₹2,000–5,000; edit skips the past-deadline check (screens block it now); payment_routes
  "Creator Pro" default (screens hide it). Desktop campaign Pause / Close (new calls).
## Tests
New `backend/v358BrandUx.test.ts` (7). Pins moved (requirement change, commented): v344Brand, v344Creator,
session43Batch4, brandUgcMobileSmoke, brandCampaignDetailMobile, directBrandInviteFlow. Full vitest 213 files / 2068 pass;
tsc + crash guard + vite build OK; protectedFlows pass. Screens re-checked at 390 / 1440 px.
## Needs Ravi
- Deploy v358 (includes v343–v357). Phone check: brand home banner, campaign edit (reach / creators kept, "Send changes for
  review"), applicants page, UGC order (live link card, closed order), Payments totals, KYC resubmit warning.
- Say OK if the locked chat chips (declined / cancelled UGC) should be fixed next.

---
# v359 (Session 63, 20 Oct 2026) — locked chat chips fixed (Ravi OK: "HNN")
Re-signed with protect:update (logged in docs/code/PROTECTED_CHANGES.md): dealState.js, chatStageMap.js,
useChatThreadMobile.js; ChatBoxMobile.jsx (screen group, no server call changed).
- Creator declined UGC changes / a live-link change, or declined campaign changes → the BRAND's chip is now
  "Creator declined · your call" and the chat shows in "Needs action" + quick actions (was no action, never listed).
- Cancelled deals and closed UGC orders (cancelled / expired / refunded): grey chip "Cancelled" / "Expired" / "Refunded"
  (was "In production"), never "Needs action"; chat bar "ORDER CANCELLED" / "ORDER CLOSED · …" / "DEAL CANCELLED"
  (brand saw "PAYMENT SECURED"); creator's "+" no longer offers upload. New dealState `isThreadCancelled`, `isCancelled`.
- Raw UGC "Approve" confirm now says the amount and the creator: "releases ₹4,000 … to Kabir Singh. Ybex pays it to
  their bank in 1–2 working days." Toast matches.
- Tests: new src/components/chat/mobile/v359ChatChips.test.js (4); mobileChatActions pin moved (requirement change).
  Full vitest 214 files / 2072 pass; tsc + crash guard + vite build OK; protectedFlows 9/9.
## Needs Ravi
- Deploy v359 (includes v343–v358). Check: a cancelled UGC order in Inbox (grey chip) and inside the chat (grey bar).

---
# v360 (Session 63, 20 Oct 2026) — campaign page, popups under the bottom bar, footer spacing (Ravi's phone screenshots)
Ravi: "caimpaign ka UI UX fix kro bhot bekar hai, ye popup, aur purane footers mein bahut khaali space — is baar nahi hona chahiye".
## Brand campaign page (phone, BrandCampaignDetailMobile)
- Stats ("1 Applicants · 0 New · 1 Shortlisted") and tabs ("Under review · 0 … Hired · 1") were two rows with different
  numbers, and the page opened on an empty tab ("No applicants in this category." while the only creator was hired).
  Now ONE row of tappable tiles = tabs: New · Shortlisted · Hired · Passed (selected tile black). Opens on the first tab
  that has people. Purple "Review N new pitches" only when there are new ones (and you're on another tab).
- Empty tab says what it means ("No one hired yet — a creator shows here once the payment is held", "No new pitches —
  share the brief" + Share). Predict ROI + Download report moved into one "tools" card under the list. Less bottom gap.
## Popups hidden under the bottom bar ("Cancel Brief & Request Refund" buttons)
- Phone bottom nav is z-50 = most full-screen popups → the nav painted over their buttons. `PopupBackdrop` now lifts any
  `fixed inset-0` backdrop asking for z-40/z-50 to z 1000 (all such popups app-wide).
- Cancel brief: drawn on <body>, bottom sheet on phone, buttons pinned at the bottom with safe area, equal size
  ("Keep brief" / "Cancel & refund ₹X").
## Old footers ("Built For Creators…", "Find Creators…", etc.)
- PremiumFooter on phone: 8px above (was 32+32), 12px below (was 40), headline 28px, Instagram row without the extra
  divider / padding. Pages under it no longer take a full screen height or leave 110–160px at the bottom (Layout already
  clears the bottom bar): Explore, brand Campaigns, creator Campaigns, Deals/Collabs, Payments, Earnings, campaign detail.
- Brand home's live "Built For Creators." footer is the v356 city footer once v356+ is deployed (live is still v342).
- UGC brief card "24h SLA Guarantee" → "Delivery in 24h".
## Tests
New backend/v360Footers.test.ts (3); pins moved (requirement change): brandCampaignDetailMobile.test, v358BrandUx.
Full vitest 215 files / 2075 pass; tsc + crash guard + vite build OK. Screens checked at 390 px (brand + creator).
## Needs Ravi
- Deploy v360 (includes v343–v359) — the live app is still v342, so most of what's in the screenshots is already fixed there.

---
# v361 (Session 63, 20 Oct 2026) — creator home footer line
Ravi: "mohalla Hindi ka word hai, line achhe se likho". `src/components/footer/HomeCityFooter.jsx` creator line:
"Brands of every size, from every city, lane and mohalla." → "Brands of every size, from big cities to small towns."
No other change. Deploy v361 (includes v343–v360).
## v361 also — Android (needs a NEW Android build, not a website deploy)
- Ravi's Android screenshots: (1) a purple logo box when the app opens, (2) a purple strip behind the phone's
  back/home buttons. Both are inside the APK. `twa-manifest.json`: navigation bar #FFFFFF + divider #E5E5EA (was
  #7E00DC), version 1.0.3 / code 4. The box needs the v334 `android-overrides/` files → Bubblewrap build (the PWABuilder
  website can't add them). README in android-overrides/ updated. Signing key (signing.keystore) stays with Ravi.

---

# v362 (Session 64, 21 Oct 2026) — Meta Pixel + sign-up funnel (Ravi: "kisne dekha, register kiya ya nahi, kahan break point hai")

v361 is live (Ravi, 21 Oct) with the Instagram secrets in.

## What changed (no locked file, no DB change)
- New `src/lib/metaPixel.js`: Meta Pixel loader + `trackFunnel()`. Same events also go to Google Analytics (G-YQXC5TWFS0)
  as snake_case events. Only counts — no name / email / phone / handle is sent.
- **`META_PIXEL_ID` is still empty** → Meta part does nothing until Ravi's Pixel ID is filled in (it is a public number,
  not a secret, so it lives in the code like the GA id). Fill it, then deploy.
- Funnel events: `PageView` (every page) → `ViewSignupPage` (/signup, /register) / `ViewApplyForm` (/apply-creator)
  → `Lead` (apply form submitted) → `CompleteRegistration` (new account < 1 hour old, email / Google / Apple, via
  `sendSignupSource`) → `OnboardingStep` {step, flow} → `OnboardingComplete` {flow}.
- Hooked in: `GoogleAnalytics.jsx` (route changes), `signupSource.js`, `PublicCreatorApply.jsx`,
  `CreatorOnboardingMobile.jsx` (done = screen 11), `CreatorOnboarding.tsx` (done = step 5), `BrandOnboardingMobile.jsx` (done = screen 8).
- `appVersion.js` label fixed: was still "v356", now "v362".
- `vite build` OK.

## Needs Ravi
- Make the Pixel in Meta Events Manager (together, 22 Oct) → give the Pixel ID → Claude fills `META_PIXEL_ID` → deploy.
- Privacy policy: add a line that Meta Pixel / Google Analytics are used to measure ads.
- Play Store is still a closed test → ads point to the website sign-up until production is approved (14 days from 17 Oct = 31 Oct).
- Desktop brand onboarding has no step events yet (creators first).

---
# v363 (Session 64, 21 Oct 2026) — waitlist fetch, brand onboarding exit, footer, Instagram auto-fetch design, speed
Ravi's list from 21 Oct (screenshots, reviewer video + message, design file Ybex_Instagram_Auto_Fetch_offline.html).

## 1. Waitlist "Fetch Instagram for everyone" (Ravi: "waitlist mai fetch hi nahi kar raha")
- Cause: the v354 job ran in the background after the reply; Cloud Run pauses CPU between requests and keeps restarting
  copies, so it stalled after the creators (logs: 20 Oct 14:34, creators only) and the 44 pending never got numbers.
- Now the admin screen drives it: `POST /admin/creators/instagram-bulk/step` {force, since, skip} fetches up to 6 per
  request (18 s budget), reads what's left from the DB each time (works on any server copy), waitlist first. Keep the
  page open; it waits by itself when Meta's hourly budget is used. Old start route answers harmlessly.
- Waitlist rows get `ig_followers`, `instagram_stats` (compact), `instagram_synced_at`, `instagram_fetch_error`
  (DB columns added today, Ravi OK). The form's own followers stay as typed (`form_followers` in the list).
- Waitlist list: "✓ Instagram" / "Fetch failed" / "Followers · form" under the number; detail card shows live numbers +
  "form said 9,500"; "PunjabPunjab" location bug fixed.
- Approval (single + batch) uses the fetched numbers and stores them as live stats on the new profile.
- Test pin moved in v354InstagramRoutes.test.ts (requirement change, commented).

## 2. Saves that silently failed (DB logs, 19–21 Oct)
- Most "column does not exist" errors are harmless fallbacks (inboxLean selectColumns, adminTargetGuard, growth grab).
- Admin → creator edit on a creator with no profile: insert had no name ("null value in column name", 7×) and the
  admin saw "saved" → name/email from the account, and both insert + update now return the real error.
- Ravi's bio: DB bio is empty; the save itself works. Eva needs 40+ characters for "bio done" — the item now says
  "Bio is too short (n/40)", the Creator info screen shows a 0/40 counter, and Eva's 60 s cache clears on any save
  (`ybex:data-changed` event from src/lib/api.js).
- Brand profile save (`/brands/profile`): server now also writes city / state / YouTube / LinkedIn / Twitter (only the
  browser copy wrote them; 0 of 4 brands had a city).
- Locked creators_routes.ts writes dob/experience columns that don't exist → harmless 400 per save (see PENDING_DB_CHANGES).

## 3. Brand onboarding (reviewer video: stuck on logo/name page, Back did nothing, logo + publish failed)
- Onboarding headers always show an exit: "Exit" before the basics are saved (sheet "Leave setup? · Log out"),
  "Finish later" after. Brand screen-1 Back opens that sheet; creator screen-1 Back = Finish later (was navigate(-1)).
- Logo upload errors say why (login expired / too big / server message). Publish sends `logo_url` to the server, the
  extra browser-side brand_profiles write and the agency write are no longer fatal, consent save can't hang Publish,
  offline / expired-login messages. Server saves city/state on onboarding.
- Why the app opened in Chrome and Clear data didn't help: the login lives in Chrome's site data (TWA falls back to
  Chrome when assetlinks don't verify). Reviewer fix: Chrome → Settings → Site settings → ybexapp.ai.studio → Delete data.
- The 3 half-made brand accounts from 19 Oct were NOT deleted (the delete needs Ravi's confirm; it timed out).

## 4. Home footer (Ravi: "Hopr jaisa light grey, illustration chhota, line fix")
- Same city art, greyscale + faded, ~⅓ smaller (phone 200 px tall), grey text, road strip matched.
- Creator: "From local shops to big brands — your next collab is here." Brand: "From corner shops to big companies —
  find the right creators for you." + "🇮🇳 Made for Indian creators/brands" / "💜 Crafted in India". Eva bot keeps colour.
- Test pin moved in v356Footers.test.ts (requirement change, commented).

## 5. Admin speed ("Slowest APIs" ~2 s each)
- DB queries take 0.1–16 ms; the time is server (US/Asia, per Supabase logs) ↔ DB (Mumbai) round trips.
- Login session lookup kept 30 s (was 5 s), `/admin/pending-counts` answer reused 20 s per server copy (?fresh=1
  skips), admin badge poll every 60 s and only while the tab is visible.

## 6. Promo popup "Tap opens" — every page + search
- APP_PAGES lists all pages incl. profile sub-screens (/settings?section=portfolio, platforms, rates, kyc …) and brand
  profile sections (/brand/profile?section=…), with a search box. "Other link" still takes any https:// address.

## 7. Ravi's design "Instagram auto-fetch" (Ybex_Instagram_Auto_Fetch_offline.html)
- Onboarding (01/01b/01c, 03/03b, Brand 01): new `src/components/instagram/IgHandleField.jsx` — fetch on blur / 600 ms,
  spinner + "Fetching your profile from Meta…", Next disabled, green tick + 3 stats, error + Retry, one call per
  username. Creator: photo pulled ("Change"), channels step "Instagram's done. Add others?". Brand: handle fills logo,
  name, description (bio — `/instagram/preview` now returns `bio`), followers preview card.
- Profile hub 1a: `HubInstagramStrip.jsx` live strip + row chips (IG live / Not set / N collabs / Verified).
- Social platforms 1c: one Instagram card (`InstagramConnectCard.jsx` redesigned) — no second Instagram in "Added";
  Refresh only re-fetches the saved account; Update username → 1b `ConnectInstagramSheet.jsx` (preview → "Yes, that's
  me — connect" → save). This is the fix for @narendramodi's numbers showing under elite_ravi. Disconnect at the bottom
  (existing route: stops sync, drops verification).
- Portfolio 1h/1d/1g/1e: `src/components/portfolio/*` + new PortfolioScreen — empty state, Select / Paste link /
  Upload, tag-the-brand sheet with live preview, brand stacks / grid. Previews: new server routes
  `POST /creator/portfolio/ig-media`, `/link-preview`, `/covers` copy Instagram covers into our storage
  (avatars/portfolio/<user>/<id>) — IG cover links expire, which is why previews were blank. Meta gives no views for
  some reels and no paid-partnership flag: likes shown instead, "Collab" only from caption, creator confirms.
- Public profile 1f (phone): `src/components/publicProfile/*` — photo-led header with adaptive colour (bottom 15% of
  the photo, light/dark theme, cached), stats panel ("Live from Instagram · verified by Ybex" only when synced),
  CTA by viewer (brand: Send collab request → existing invite sheet; owner: Edit profile; logged out: Sign in),
  tabs Portfolio · Rate card · Stats · Reviews · Match · About, cover grid by brand. Desktop unchanged.

## 8. Other
- Meta Pixel ID 965515649959745 filled in (`src/lib/metaPixel.js`). Privacy policy section 7 mentions Google
  Analytics + Meta Pixel (no version bump, so nobody is asked to re-accept).
- appVersion label v363.

## Tests
- npm run verify: tsc + crash guard OK; vitest 219 files / 2100 pass, 1 fail = `session58Launch.test.ts` Android
  navigationColor (twa-manifest.json says #FFFFFF, test wants #7E00DC) — that file wasn't touched in v363 (already
  different in the v362 zip). New tests: v363Portfolio, v363PublicProfile, v363SocialHub, v363OnboardingFetch (packed in
  dev/tests.tgz). npm run build OK.

## Needs Ravi
- Deploy v363 (one deploy: Pixel + all of the above). Then Admin → Waitlist → "Fetch Instagram for everyone" (keep the
  page open) → check numbers → approve the 44.
- Upload the 2,500-creator CSVs only after v363 is live.
- 3 half-made brand accounts (19 Oct): approve the delete when asked, or Admin → Users → delete.
- twa-manifest navigationColor (#FFFFFF vs #7E00DC) — say which one is right.
- Offline app (Capacitor) = separate phase. Age 14+: tell whether it's only the Play rating or 14–17 users too.

---
# v364 (Session 64, 21 Oct 2026) — split fee (creator 0% / brand 8%), server-down mode + outbox, Android Capacitor app, real social logos
## 1. Fee change till Diwali (Ravi's summary; OK for locked files: "haan, locked files mein ye fee change kar do")
- DB (applied live, migration v364_split_platform_fee): platform_fee_config.fee_model ('legacy' | 'split', live = split),
  creator_fee_pct (live 0), brand_fee_pct (live 8); transactions.brand_fee_pct / brand_fee_amount / brand_fee_gst /
  brand_paid_amount / coupon_code. Old code ignores them, so nothing changed live before this deploy.
- ₹10,000 deal → brand pays ₹10,800 (₹10,400 with a 4% coupon) → creator gets ₹10,000 → Ybex ₹800.
- src/utils/feeCalculator.ts (locked): split model; platform_fee_amount stays the CREATOR fee (0), so stampedFee / payouts
  and already-paid deals are unchanged. Brand side returned separately (brandFee, brandFeeGst, brandPayable).
- backend/brandFee.ts: config (30 s cache), server-side coupon check (applies_to 'brand_fee': new %, ₹ off, or 0 — only
  lowers; dates, limits, per-brand limit, min value), quote, redemption. POST /payments/quote; create-order charges the
  quote total (notes carry the quote); persist requires paid ≥ total (old orders without notes: deal amount); payment rows
  stamped with the brand fee + coupon. UGC briefs: same. markupForRole = 0 in split (no 2% + 8% double).
- Brand UI: BrandFeeSummary (Deal amount · Service fee 8% · coupon box · Coupon applied · Total you pay · "creator gets
  the full ₹X · 0% platform fee") on mobile Review & pay, desktop chat payment, UGC brief review, PayNow; brand payments
  list shows what was paid. Creator screens show 0% (no deduction).
- Admin: Fees card — "Split / Old tiered" switch, Creator fee % and Brand fee % boxes + live example. Coupons — "Applies to
  → Brand fee" (new %, ₹ off, 0%), limits, dates, min value, active, used count. Ravi names the codes.
- Locked changes logged with npm run protect:update (payment_routes, feeCalculator, ugc_routes, useChatThreadMobile,
  razorpay.js). Pins moved (Ravi's fee decision): session57Money (onPay with couponCode), session58Launch (onPay(method, fee.couponCode)).
- Not done: refunds still return the deal amount (Ravi: refund the 8% too or not?); brand GST invoice has no service-fee line.
## 2. Server down / updating (no Play update needed)
- src/lib/serverStatus.js + api.js: HTML / 502–504 / unreachable server = "Ybex is updating": screens show saved data, pill
  at the top, login kept. src/lib/outbox.js: profile / brand profile / onboarding progress / Eva settings / read marks are
  saved on the phone and synced when the server is back; money, chat, deals, KYC, OTP, uploads are refused calmly.
## 3. Android app with the screens inside (android-app/)
- Capacitor 7 project generated on Ravi's Mac by `cd android-app && bash scripts/mac-prepare-android.sh` (1.0.4 / code 5,
  same signing.keystore → Play update). Live updates via /api/app/android-update. Back button never traps. Push via
  Firebase (backend/fcm.ts, env FCM_SERVICE_ACCOUNT_JSON + google-services.json) — needs Ravi's Firebase project.
## 4. Real social logos
- src/components/common/SocialLogo.jsx (Instagram, Facebook, WhatsApp, YouTube, Meta from Ravi's file; LinkedIn, X,
  Snapchat, Threads, Google, Apple added) on ~32 screens; public/assets platform images replaced with the real marks.
## 5. Other
- Twa-manifest navigationColor test pin moved to #FFFFFF (v361 change). appVersion v364 (old VITE_APP_VERSION can't override).
## Tests
- npm run verify: 223 files / 2146 pass, 0 fail. npm run build OK.
## Needs Ravi
- Deploy v364. Check one test deal: brand sees ₹10,800 (or with coupon), creator payout ₹10,000.
- Make coupons in Admin → Coupons → Applies to: Brand fee.
- Firebase for Android push; then build the Android app on the Mac.

---
# v365 (Session 64, 21 Oct 2026) — CSV without email, refund view, invoice convenience fee, 14+, deep money tests
- CSV waitlist import: email optional when there's an Instagram handle; duplicates by handle (in file, already on Ybex);
  re-upload completes handle-only rows. DB: waitlist.email NOT NULL dropped (migration v365_waitlist_email_optional; unique
  when present). Approval without email: one unclaimed profile (login email unclaimed_<id>@ybex.io, profile email null),
  reused on re-approve / same handle; a claimed profile with that handle is linked; no "Claim your profile" email.
  ilike exact-match escaping for "_" / "%" (likeExact). Edit modal: email optional with a handle; reject toast says why no email.
- Refund modal: Brand paid / Service fee % / Coupon + quick fills (everything / deal only / fee only); refund cap =
  brand_paid_amount; a service-fee-only refund never touches the creator's payout.
- Brand invoice (screen + PDF): "Convenience fee (8%)" line + coupon, total = what the brand paid. Creator receipt shows ₹0.00 (no "-").
- Age: 14+ everywhere (src/lib/age.js MIN_AGE, onboarding, sign-up / apply checkboxes, Terms + Privacy). No guardian flow
  (Ravi). TERMS_VERSION not bumped (no re-accept popup).
- Deep testing (black-box + white-box): 60 new tests (real routers + fake Supabase with live columns + fake Razorpay,
  outbox money guard, fee UI). 8 bugs fixed incl. coupons.applies_to CHECK (live migration
  v365_coupons_applies_to_brand_fee), refund cap, team-member coupon id on UGC briefs, coupon code wildcard, silent admin save errors.
- npm run verify: 227 files / 2217 pass. Build OK.
## Needs Ravi
- Run the 3-account delete SQL in Supabase (popup never reached the chat).
- Decide: after a fee-only refund, should a deal refund still be allowed on the same payment (now blocked)?
- Instant UGC (ugcord_) orders still take the amount from the browser (pre-v364).

---
# v366 (Session 64, 21 Oct 2026) — money hardening, pending items, new checkout
- Instant UGC orders: amount from the server (order + brand fee + coupon), never the browser; owner checks; order id on the Razorpay order.
- Coupon race fixed in the DB: `coupon_reservations` + `claim_coupon` / `confirm_coupon` / `release_coupon` (row lock,
  service_role only, migration v366_coupon_reservations); safe fallback if missing.
- Refunds: more refunds allowed up to brand paid − already refunded ("Already refunded ₹800 · can still refund ₹10,000").
  Test-mode payments stamp brand fee + count coupons. Admin → UGC Refunds shows brand paid / fee / coupon + "Refund
  service fee". Brief deposits by team members saved under the parent brand. Coupon per-brand limit: empty = no limit.
- Instagram: hub refreshes at once after connect/refresh/disconnect; Disconnect fully clears the Instagram link.
  Desktop portfolio shows covers by brand. Brand onboarding fills the website from Instagram (safe fallback).
- DB: creator_profiles dob / date_of_birth / experience / experience_years (stops the 400 after every profile save).
- Checkout (Ravi's Checkout.dc.html): new Review & pay with UPI app tiles (GPay, PhonePe, Paytm, BHIM, Amazon Pay,
  UPI ID), card / net banking, sticky "Pay ₹X | via PhonePe", Razorpay handoff screen, "Escrow funded" success with
  Razorpay ID + receipt. Razorpay opens on the chosen app (config.display block; normal sheet if refused). Screen 03
  (approve-in-app timer) is Razorpay's own window with Standard Checkout. PaymentLogo.jsx (11 marks from Ravi's
  logo file), newer Instagram mark.
- npm run verify: 232 files / 2282 pass. Build OK.

---

# Session 58

# Session 58 — v309

## 1. Sign-in security hole (critical, fixed)
- `POST /auth/verify-email` used to hand a login session to an **already-verified** account without checking any code
  (anyone's email + any 6 digits = their account). Now it answers `409 ALREADY_VERIFIED` and gives no session.
- `PreStep_EmailVerify.tsx`: on `ALREADY_VERIFIED` → toast "already verified, please log in" → `/login?email=…`.

## 2. Launch: straight into our animation (Android + iPhone)
- Android (Play app / TWA): the native launch screen is now plain `#7E00DC` with **no logo**
  (`public/twa-splash-512.png` = solid purple; old wordmark kept as `public/notification-icon-512.png` → `monochromeIconUrl`).
  Bottom navigation bar is purple (`navigationColor*`). `appVersionCode` 3 / `appVersionName` 1.0.2.
- `index.html`: Android gets class `yb-android`; the splash starts on the same flat `#7E00DC` and the gradient fades in
  (480 ms), so there is no colour jump. theme-color follows (#7E00DC on Android).
- iPhone: `html.yb-splash-active body` is purple from the first frame (the strip behind the clock was grey for a frame).
- Shine now 340 ms (ends ~1.24 s) so it is never cut by the 1.25 s exit. `INTRO`/`HOLD` unchanged.
- **Needs one new APK** (bubblewrap build from `twa-manifest.json`, versionCode 3) — the launch image and nav colour live inside the APK.
- Not changeable: Chrome-installed (non-Play) Android PWA splash is drawn by Chrome (icon + name). Android 12+ may flash the launcher icon briefly (system rule).

## 3. Fewer emails (in-app bell + phone push unchanged)
- No user email for warning / suspend / ban (`notificationService.ts`, both paths). Super-admin alert stays.
- No email for `CAMPAIGN_UNDER_REVIEW` and the `verification` fraud-review note.
- UGC (`ugcDeadlineService.ts`, `UGC_IN_APP_ONLY`): the 3-hourly repeat reminder, brief relisted, refund queued, creator stepped away → in-app + push only.
  First + final reminders, order expired/cancelled, refund sent still email.
- Phone push: every row in `notifications` is pushed by `push_routes.ts` (if the user allowed notifications), so all of the above still reach the phone.

## 4. Admin delete / wipe was blocked for every admin (fixed)
- `adminTargetGuard.countFullAdmins` asked Supabase for a `users.is_admin` column that does not exist on the live DB,
  the query failed, the count fell back to the local copy (≤1) and every admin bin / wipe said "This is the last full admin".
  Now it retries with the columns that exist (`role`, `team_role`, `is_deleted`, `banned`). Rules unchanged:
  only a full admin can remove an admin, never yourself, never the last full admin.

## 5. Signup source tracking (DB change — Ravi OK "han kro")
- Migration `session58_signup_source` applied on the live DB (`scripts/sql/OLD_SQL_already_run.sql (session58_signup_source part)`):
  `users.signup_source`, `utm_source`, `utm_medium`, `utm_campaign` (nullable text).
- `src/lib/signupSource.js`: first link a visitor lands on (utm tags, gclid/fbclid, referrer, Play app) kept in localStorage;
  sent once after sign-in (`AuthContext`) → `POST /auth/signup-source` (`backend/signupSource.ts`), saved only on a new
  account (≤ 2 days old) with no source yet. Sign-up / login code untouched.
- Growth → "Where signups come from" now splits by Instagram / Google / Meta ads / Direct / Android app …; the
  "Signup source is not tracked yet" alert is gone. Older accounts show as "joined before tracking started".
- Tip for ads: add `?utm_source=instagram&utm_medium=paid&utm_campaign=<name>` to ad links.

## Open (sign-in audit, not changed yet)
- Google login on an unverified account keeps the old password (`oauth_routes.ts`).
- Web login shows "Use OTP instead" with no OTP option.
- Password reset does not mark the email verified.
- Google on `/login` defaults a brand to creator.
- Medium/low UX items listed in chat.

## Tests
- New `backend/session58Launch.test.ts` (37 pass). Full suite identical to v308 baseline otherwise. No locked files touched.

---
# v310 (same session, Ravi's phone test round)

## Payout counted twice (fixed in code; one data row waits for Ravi's OK)
- Cause: the live `transactions` table defaults `refund_status = 'NONE'`, `refund_amount = 0`. Code read "any refund_status"
  as a refund, so on approval the paid row was skipped and a SECOND payout row was inserted (Dell ₹13,000 → two ₹11,700 rows,
  admin mail "₹23,400 (2 approved deals)").
- New `backend/refundFlags.ts` `hasRefund()` used in `campaignGuards.isEscrowDepositRow` (LOCKED), `ugc_routes` isRefundRow (LOCKED),
  `ugcLifecycleService`, `brandPayments` (refunds tab showed every payment as a refund), `campaignRefunds`.
- `creatorPayoutRequests.readyRows`: one row per deal / UGC order.
- Data: duplicate row `f3d6d152…` (deal dbddaa41…) still in the DB — cleanup SQL was not run (needs Ravi's OK):
  merge into `e7d720e7…` (RELEASED) and delete `f3d6d152…`.

## Other fixes
- Admin payout-request email: own subject "💸 Payout request waiting" (was "direct message from Ybex Admin").
- Earnings rows: real campaign / brief title + brand name (`server.ts fetchUserScopedTransactions`), "Campaign deal" fallback.
- Inbox chip (creator): "₹X received" only when paid to bank; approved = "₹X approved · payout next" (`chatStageMap.js`, LOCKED; test updated — requirement change).
- Chat ☰ menu: popups were behind the phone chat (z-50) → z-[1100]; status popup follows the real deal step; footer wording.
- Live link "Ask to resubmit": opens the one sheet directly (the inline box's text was thrown away).
- Draft sent as an Instagram/YouTube/Drive LINK showed "file no longer available" → now an "Open on Instagram ↗" box.
- Draft video: "Full view" button while playing (phone's own full screen is blocked for watermarked drafts).
- Eva: solid green layer behind the chat while typing (page footer showed under the iPhone keyboard bar). The iPhone's
  ^ v ✓ bar itself is iOS and can't be removed from a web app.
- Rate cards: screen used other key names (story / YouTube / UGC never saved or shown); server kept the old `reels`
  value over the new `reel`. Now one set of keys, all variants + `reel_rate`/`story_rate`/`youtube_video_rate` sent
  (only after the rates were loaded, so other saves can't zero them). Save button shows "Saving…".
- Back from a profile screen: closing no longer pushes a page (Back re-opened the screen); opened from Eva "Fix"
  (`&from=eva`) → goes back and Eva opens again (`ybex:open-eva`).
- Meet the Creators: back to column-by-column (Ravi: "isko vesa hi kro"), up to 9; `session48.test` updated.
- Locked files changed with `protectedFlows --update` (logged in docs/code/PROTECTED_CHANGES.md): campaignGuards.ts, ugc_routes.ts, chatStageMap.js.

---
# v311 (same session)
- Footer: no divider line on top (`PremiumFooter.jsx`).
- Chat: "Review & sign agreement" card inside the chat when the price is fixed and I haven't signed (same sheet as the bar).
- Creator home "Best matches": new `components/campaigns/mobile/HomeCampaignCard.jsx` — brand face, posted time,
  closes-in, brief / requirement line, per-creator payout, deliverable, views and applied (same numbers as the
  Campaigns page). `session31.test` pin moved to the new card (Ravi redesigned it).
- Payout card: no ₹13,000 → ₹11,700 flicker (placeholder until the payout row is read); "Route" label on one line.
- Bottom sheets: timed slide (0.28 s) instead of a spring — smoother on busy phones (`lib/motion.js`).
- Waitlist CSV: rows already on Ybex are skipped by email, mobile (last 10 digits) or Instagram handle — checked
  against waitlist, users (phone) and creator_profiles (Explore creators); repeats inside the same file too.
- Still open: duplicate payout row `f3d6d152…` cleanup waits for Ravi's OK.

---
# v312 — Ybex Eva redesign, part 1 (Claude Design handoff "YBEX_Landing_Page_Design.zip" = Eva design)
Spec: design_handoff_ybex_eva/Eva Developer Notes.md. Plan: 1 chat look (this) · 2 brand flows · 3 creator flows · 4 history / settings / attach / desktop.
- New `src/components/feedback/evaUi.jsx`: 8 face moods (hello, wink, excited, proud, hmm, whoa, missed, cheeky; colour never changes),
  `moodFor(text)`, blur pop-in (`.eva-in`), word-by-word replies with ▍ and "Show more" (>170 chars), "Ybex Eva · just now" + 👍/👎,
  2×2 starter boxes, disclaimer, rotating peek lines.
- `FeedbackBot.jsx`: peek bubble rotates up to 8 lines a session (mood + squash, every 3rd line moves, max 4 moves); chat opens EMPTY
  (brand: "Hello {Brand} / Can I help you?" + boxes; creator: big orb + "Hi {Name}, how can I help?" + boxes); today's updates wait behind
  "N updates for you" (the ?assist=new notification still shows them at once); earlier chats via ☰; bubbles per design tokens (DM Sans);
  header orb + every avatar show a mood; disclaimer under the input; Hinglish UI copy → English.
- Brand: "What can you do?" → one line + 5 popular chips; "I need UGC videos" starts the UGC brief (English word order).
- `POST /assist/feedback` logs 👍/👎 (no table — PENDING_DB_CHANGES "eva_feedback").
- AI prompts: always "Ybex Eva", English by default (Hindi/Hinglish only if the user writes so), off-topic rules, rates/fees never shown.
- "Ybex Assist" renamed to "Ybex Eva" in all user-facing text (admin menu, bot replies, notification text); tests updated (requirement change).
- Not yet: brand/creator flow cards (photo cards, question box, apply/invite cards), creator brain copy still partly Hinglish, History/Settings screens, attach sheet, desktop panel.

---
# v313 — Ybex Eva part 2 (brand flows)
- Creator results: horizontal swipe row of photo cards (photo, name, AVG REACH, glow, float, blur slide-in), sort Best / Reach / Followers /
  Top 5 (no rate sort), tap = tick with a lime glow ring, Alert me + Invite n. "creators under ₹X" filters by the brand's budget per
  creator and says "Found n creators who fit your ₹X budget per creator" — rates are never shown.
- Invite sheet from Eva: no "rate card" line, offer prefilled with the brand's budget, hint "Everyone here fits up to ₹X per creator".
- Compare: Niche / City / Followers / Avg reach (no Rate or Reach-per-₹1k), only the "Best value" label. Applicants: "fits budget".
- Glass question box in chat (label, n of N, lime progress, big options, text box + Next + "OR PICK ONE"); answered boxes go away.
- UGC brief: 5 English questions ("What is it for?" product / app / event, format, videos, budget per video with format minimum, requirements / skip).
- Campaign builder: 9 steps in MobileCampaignCreate's order (title, brief ≥15 chars, niche ≤3, platforms, reach tier, payout, deliverables,
  applications close, advanced) → Campaign draft card (Publishing Free · ₹0, Payment hold Only on hiring) with Save as draft (left) /
  Review & Publish (right). Review & Publish opens Create campaign straight on Review & launch (`openView` in campaign_draft; the
  close date is kept). Eva never publishes.
- "What can you do?" (brand): 5 popular chips. Buttons show their label in the user's bubble but send their value.

---
# v314 — Ybex Eva part 3 (creator flows) + glow fix
- Glow fix (brand creators row): the scrolling row clipped the tile glow and lime ring — row now has room on every side
  (padding 26/22/34, negative margin keeps the layout the same).
- Campaigns for a creator: horizontal swipe row of cards (cover / brand initial, CAMPAIGN / UGC tag, match %, title,
  brand · deliverables, payout). Campaign → "Apply in 1 tap" opens the apply form under the row; UGC → "Claim on UGC"
  opens /creator/ugc (claiming needs the OTP agreement there — Eva never calls the claim API). "Show more" chip.
- Apply form: PITCH TO BRAND (20–500, counter "n/500 · min 20" amber below 20), YOUR QUOTE (₹100–₹50,00,000),
  ✅ / ⚠️ line (fair quote ≈ ₹0.30 per average view), full-width "Send application" → "✓ Application sent".
  Same `campaigns/apply` call as before, only on tap; tools.applyTo also checks the new limits.
- Brand invitations: new "invites" intent ("Do I have any brand invites?") + shown first when the chat opens. Card: brand,
  title, offered budget, timeline, deliverables, message; Decline (left) / Accept & open deal room (right) open the app's own
  CreatorReviewInvitationModal (same accept / decline-with-reason calls, file untouched). Card collapses to ACCEPTED / DECLINED;
  accepting closes Eva and opens the deal chat.
- "What should I charge?" now answers: "around ₹X per reel" + ✅ / ⚠️ check of the creator's own reel rate + Set / Edit my rates.
  Chat replies never show the formula.
- Creator opening messages and chip values in English (Hindi/Hinglish replies only when the creator writes so).
- Tests: session58Launch v314 block (rate rule, limits, intents, cards); full suite = baseline.
- Not yet (part 4): History screen, Settings, 📎 attach sheet, desktop docked panel. DB: eva_feedback table still waits for OK.

---
# v315 — Ybex Eva part 4 (history, settings, 📎 attach, desktop)
- ☰ Chats drawer: search box (title + last line — server list now carries `preview`), "No chats yet — tap New chat to start.",
  "Eva settings" button at the bottom. Reopening a chat that ended on a card shows "Show it again" (re-asks with fresh data —
  full cards are not stored, only their type). Back closes the top layer first (settings / sheet / drawer), then the chat.
- Eva settings (new `feedback/EvaPanels.jsx` + `feedback/evaSettings.js`):
  - What Eva can read: "Deals & offers" (creator: invites, due work, brief / checklist · brand: applicants, pending, status) and
    "Earnings & payouts" / brand "Payments & reports" (earnings, KYC/payout check, share card · brand monthly report). Off → Eva
    doesn't read it and says which switch to turn on, with an "Open Eva settings" button. Stored on this phone (per user).
  - Notify me from Eva: server-side — one "eva_mute" alert row; the 30-min alert job keeps lists fresh but sends no bell / push
    to that user. Works on every phone. (No new table or column.)
  - Reply language English / Hinglish / Hindi → sent to the AI (`lang`); if the user writes in another language Eva follows them.
  - Download my Eva chats → new `POST /assist/export` emails a .txt of all chats ("✓ Sent to your email").
  - Clear all chat history → two taps ("Tap again to clear everything"), wipes every chat.
- 📎 attach sheet: Photo / Screenshot / Document (PDF, Word, text). The file shows in the chat; Eva asks what to do: Report a problem
  (next line goes to the team with the file), Send to Ybex team, Explain it (documents — Eva asks to paste the text; she can't open
  files yet), Remove. Typing with a file still makes a report, as before.
- Desktop (new `feedback/DesktopEva.jsx`, mounted in Layout): from 768px Eva peeks bottom-right on brand / creator pages (not chat,
  inbox, onboarding, KYC, post wizards, admin). ≥1100px: docked glass panel 520px, 16px from the edges, radius 28, page stays usable;
  768–1099px: full-height drawer. Header: orb + Ybex Eva + BETA · ☰ · + New chat · Close. Below 768px nothing changes.
- AI gets the last 8 messages (was 6). Brand opening messages in English; compare reply no longer mentions "reach per ₹1,000".
- Tests: session58Launch v315 block; full suite = baseline.

---
# v316 — Eva settings saved on the server (Ravi approved "eva_settings")
- New table `eva_settings` (user_id, deals, money, lang, updated_at), RLS on, server-only — applied live as migration
  `session58_eva_settings` (scripts/sql/session58_eva_settings.sql). docs/database/PENDING_DB_CHANGES.md updated.
- `GET / PUT /assist/settings`. Eva loads the user's settings when the chat opens (before reading any data) and saves every
  change to the server; the phone keeps a copy, so Eva still works if the server is down. Settings now follow the user to
  every phone and computer. One row per login (brand team members keep their own).
- Tests: session58Launch v316; full suite = baseline.

---
# v317 — Eva 👍 / 👎 saved (Ravi approved "eva_feedback")
- New table `eva_feedback` (user_id, role, vote up/down, card, first 400 chars of Eva's reply, created_at), RLS on,
  server-only — applied live as migration `session58_eva_feedback` (scripts/sql/session58_eva_feedback.sql).
- `POST /assist/feedback` now saves each vote (the log line stays too). New admin-only `GET /admin/eva-feedback`.
- Admin → Help desk → Chatbot: "Eva reply ratings" box — 👍 / 👎 counts and % liked for the last 30 days, "See replies"
  with filters Disliked / Liked / All (Eva's reply text, role, card, time).
- docs/database/PENDING_DB_CHANGES.md: both Eva tables marked DONE. Tests: session58Launch v317; full suite = baseline.

---
# v318 — Review & pay (brand → creator deal) redesigned + payment bug hunt
Locked files opened (Ravi asked: "payment page ache se design karo, fully functional banao, bugs dhundo"), logged in
docs/code/PROTECTED_CHANGES.md: razorpay.js, useChatThreadMobile.js, deals_chat_routes.ts, payment_routes.ts (+ screen files
MobileEscrowSheet.jsx, DealDetail.jsx, BrandUGCMobile.jsx).
- Review & pay sheet: "Choose how to pay" — UPI (Fastest, default) / Debit-Credit card / Netbanking as real radio cards
  (icon, bank / app names, selected ring). The choice opens Razorpay straight on that method (`prefill.method`); button
  says "Pay ₹X with UPI". Razorpay window in Ybex purple. Payment-app logos: official files go in public/pay-logos/
  (gpay, phonepe, paytm, visa, mastercard, rupay .svg — README there); until then a name chip shows.
- Fewer popups: no "Verifying…" / "verified" / "secured" toasts on top of the sheet's own "Payment successful" page.
- Bug: every deal payment posted "💰 Payment Secured!" twice in the chat (the duplicate check asked for a column `id`
  that chat_messages doesn't have, so the check always failed). Fixed. (The old duplicate on the Dell mouse deal stays.)
- Bug: create-order turned a missing amount into a made-up ₹1,000 order → now refused ("amount isn't set yet").
- Bug: Razorpay was pre-filled with the name "Brand User" when the brand had no name → empty now.
- Bug: desktop Deal page "Pay" showed ₹0 (it read `proposed_amount`, which the deals table doesn't have) → agreed amount.
- Bug: UGC brief Review & Pay showed budget × creators but charged max(budget, format minimum) × creators → shows the
  charged total; all money in Indian format (₹1,30,000).
- Copy typos: "secure secure payment hold" ×4, "Secure payment Deposit", "(100% Secure Payment Hold Protected)".
- Checked: the Dell mouse deal really was agreed at ₹13,000 (creator asked ₹15,000, brand countered ₹13,000, creator
  accepted) — the ₹13,000 on Review & pay is correct.
- Tests: session58Launch v318; session57Money pin updated (method passed to payIntoEscrow — requirement change).

---
# v319 — Bug hunt round 2 (Ravi: "find more bugs and glitches now")
How: every database query in the code was checked against the LIVE table columns (a query that names a missing column
fails as a whole), plus two read-only audits of the creator and brand screens. Locked files opened are logged in
docs/code/PROTECTED_CHANGES.md (campaigns_routes, deals_chat_routes, content_submissions_routes, payment_routes, ugc_routes).
Database (wrong column → the whole query silently failed):
- Admin → Chatbot reports had no name / email / phone (users select asked for city / photo).
- UGC deal "/pay" follow-up never set the thread ACTIVE (wrote missing payment_funded) — same bug as the campaign one.
- Creator verification results were never saved (5 unknown columns); performance metrics lookup used entity_id.
- Collab deliverable upload looked up collabs by `id` (key is collab_id) → always "Collab not found".
Brand:
- Campaign languages were always saved as "Hindi" (screen sends `languages`) → saved as "Hindi, English"; edit reloads them.
- Payments: campaign refunds never showed (looked up by brand_id, rows have none) → found through the brand's deals.
- Payments: a cancelled UGC brief showed "Released" with its full amount → "Cancelled · refunded to you".
- Payments: step "Creator deliverable submitted" was always ticked → only when work came in; refund promise "30 hours to
  source account" → "refund account, usually 1–2 working days"; receipts named the payee "Content Creator" → real name.
- Home: "N unread messages" never appeared (wrong field) → uses unread_count; invented "50K" reach and "10k+ creators",
  desktop "140+ premium creators" removed; Explore niche chips matched "ai" inside "chai/hair" and "style" in every
  "lifestyle" → whole words; "Payout Payout Amount" typo; payout popup said every video was "Reel · 30s · Master v1".
- Rupee amounts in Indian format (₹1,00,000) in the deal chat pill, UGC orders, payout popup, UGC payments.
Creator:
- Completed UGC orders said "Payment cleared · Disbursed to bank" right after approval → "Approved · Payout next" until
  the UTR exists, then "Paid to bank".
- /creator/ugc/earnings on phones showed "KYC not submitted" for verified creators → phones open the full Earnings screen.
- UGC earnings rows were all "UGC Fast Turnaround Order · Brand Partner" with the claim date → real brief, brand, approval date.
- Home banner with an https link opened the 404 page → opens the link; Active deals showed "Campaign Sponsorship" for
  direct collabs → real deliverable; payout card "Download PDF" downloaded the video → "Download video"; the "alert admin"
  box still showed after the payout UTR → hidden; admin alert always said "Brand requested" → says who asked.
Needs Ravi's decision (NOT changed):
- Launching a saved campaign DRAFT makes it live straight away, skipping admin review (new campaigns go to review).
- UGC claim screens promise the full brief budget; the creator receives it minus Ybex fee + GST.
Tests: session58Launch v319; session43V287Feedback pin updated (its query asked for columns that don't exist); suite = baseline.

---
# v320 — Ravi's two decisions
- Launching a saved campaign draft now goes to admin review (status under_review + the same "under review, live in
  2–3 hours" notice as a new campaign). Toast: "Sent for review — the Ybex team checks it…". session28 test updated
  (requirement change). Logged in docs/code/PROTECTED_CHANGES.md.
- UGC claim screens: keep showing the brief budget only (no "you receive ≈ ₹X" line) — no change, as Ravi decided.

---
# v321 — Bug hunt round 3 (accounts, KYC, notifications, admin)
Accounts / KYC:
- Submitting (or an admin rejecting) KYC set users.verified=false — that flag means EMAIL verified, so the user could no
  longer log in with their password. KYC no longer touches it; admin screens no longer read it as "KYC approved".
- Change email said "updated" but changed nothing (wrote a missing column). Fixed; phone / password changes also report
  a failed save instead of a fake success.
- Desktop login: "verify your email" pointed at a missing "Use OTP" button → sends the code and opens the verify screen.
- Password reset now also marks the email verified and signs out old logins on other devices.
- Security: when a never-verified account is verified via login code or Google, a password set before verification is
  cleared (someone else could have signed up with that email).
- Desktop creator KYC lost the IFSC and UPI QR (field names) → saved; KYC save failures now say so; a missing PAN photo
  was replaced by a stock picture → left empty; team-member avatars were a stranger's stock photo → empty.
Notifications:
- Desktop bell ignored the link the server sends → uses it first, then the type rules, then the phone bell's fallback.
- UGC "deliverable submitted" notification lost its link; the never-saved "Welcome" notice brought the badge back every minute.
Admin:
- Escrow: failed / cancelled payments counted as held money and showed Release / Refund → "Payment not completed", no
  buttons; UGC brief deposits no longer show "Refunded"; refunded rows lose the money buttons.
- Mobile payouts: bank details always blank → shown; "Paid today" showed the all-time total → today only; the UGC refunds
  queue opens on phones.
- Payout breakdown now has the "GST on fee" line (rows add up); receipts no longer print a made-up GSTIN / invoice no.
- Help desk "Resolved today" counts resolved today; fake "~15m" removed. Dashboard "Pending UGC deliveries" was always 0.
- KYC review: no made-up "2+ Years", niche or Instagram handle. Resolve report saves who / when and reports failures.
- Referral withdrawals: only a REQUESTED one can be paid / rejected (no double payout); buttons lock while saving.
- Waitlist message: reaches the applicant's real account (or says "saved, no account").
Needs Ravi's decision (NOT changed):
- "Suspend user" only emails — nothing actually blocks the account (needs a `suspended_until` column + login check).
- Chat violation "Warn / Restrict" only changes a label.
- Login sessions never expire (7-day expiry exists in the table but isn't checked — turning it on logs everyone out weekly).
- Login rate limit can be bypassed with a fake X-Forwarded-For header (depends on the hosting proxy setup).
- Google sign-in without the popup lands logged out (rare fallback path).

---
# v322 — Bug hunt round 4 (security, deal chat, UGC money) + chat Warn / Restrict (Ravi: "hn")
Chat violations (Admin → System reports): Warn sends a real warning (recorded in user_violations + bell notice);
Restrict pauses the person's chat for 7 days (the send route refuses with "Your chat is paused until …"); new "Lift chat
pause" button ends it early. No new table (backend/chatRestriction.ts).
Security:
- Campaign payout / live-link routes accepted UGC order ids with NO ownership check → a creator could mark their own UGC
  payout released. UGC ids are now refused there (UGC has its own guarded routes).
- Draft approve / request-changes: only the deal's brand (a creator could approve their own draft). Collab accept /
  reject: only the person the proposal was sent to.
- Test-payment simulation now needs a signed-in brand. Quick-admin PIN: 5 wrong tries → locked 15 min, tries logged.
- Creator date of birth (stored inside rate_card) no longer in public profile lists; GET /creators strips emails/phones.
- Creator reviews only by a brand that completed a deal with them, once. Unpublished campaigns / briefs not readable by
  strangers. Sending a campaign for review via "update" needs brand KYC too.
Deal chat:
- Typing "payment released kab hoga?" closed the chat for both sides (text was matched) → only system cards count.
- Signed agreement showed ₹0 after an accepted counter → agreed amount. Desktop offer box pre-filled a made-up ₹15,000.
- Unread badge never cleared (messages without receiver) → marks read what the other side sent.
- Brand team members: inbox empty and counter / accept refused → they act for their brand.
- Payout card "Platform Fee (NaN%)" / wrong fee → saved fee; brand "Respond to offer" had no Accept for application /
  invite offers → amount read; offer card "1 revision included" → 5 (the real limit); deal panel stages, revisions left,
  date and ₹ format.
UGC money:
- Approving ONE order closed a multi-slot brief → paid slots could neither be claimed nor refunded. Now only when every slot
  is delivered.
- Signing again reset the draft deadline (endless extensions) → an order signed once keeps its timer.
- Brief cancel vs a claim at the same moment could refund AND pay one slot → cancel also checks the claim count.
- Refunds queued before the brand had a refund account could never be paid → get the account when it's added.
- A draft upload could revive an expired / cancelled order (stale local copy) → live row re-read first; the old submit route
  can't reset an approved draft; a failed slot close no longer reopens a refunded slot.
- Brand's change notes were never saved (missing columns) → saved; expiry/cancel notes went to a non-existent chat → real chat.
- Brand UGC orders: deadline showed "pending" and titles "UGC Deliverable" (wrong fields); Review / In progress filters hid
  live-link and revision orders → fixed.
Tests: session58Launch v322; session28 KYC-gate count pin 2 → 3 (requirement change: update also checks KYC). Suite = baseline.
Still open (decide / later): real Suspend (needs `suspended_until` column — asked Ravi); sub-admins can still use some
non-/admin money routes; inbox stage chips (counter shown to both sides, "In production" before payment); desktop chat
file attachments not shown; counter / accept don't push live to the other side (15 s poll); UGC reminders spacing for
48h/72h briefs; night-time expiry emails dropped.

# v323 — Bug hunt round 5 (data leak, public pages, Ybex Eva)
Security / data:
- Brand "applications" list (browser DB route) had its campaign filter inside a comment → every brand saw every brand's
  applications. Filter restored.
- Creator profile: a creator opening their own profile counted as a view; profile lookup by email removed; an empty
  profile is auto-created only for the creator themself (strangers created fake rows); deleted profile → 404.
- Rates on the public profile / GET creators / Explore now carry the platform markup per viewer, same as the rate card
  (they were raw on some fields). LOCKED file opened: backend/creators_routes.ts (protectedFlows --update, logged).
Public pages:
- Campaign card: no ₹10,000 fallback budget, no fake "Deals" column, no hard-coded "Jun 30, 2026"; Completed / Rejected badge.
- Campaign detail: no invented "10k+ followers / Pan India"; Share copies the link; closed campaigns hide "Actively
  reviewing" and Apply ("Applications are closed"). Campaigns list: no fake view counts.
- Creator public page: no invented category / bio / barter / payment defaults; languages shown properly; ₹ in en-IN.
- Info pages: careers → mailto support@ybexmedia.in; WhatsApp +91 87640 04299; unknown page → "Page not found".
- Explore "Budget: low to high" sort did nothing (read fields the API never sends) → uses the real rate.
Ybex Eva:
- Brand bug reports ("payments page not loading") were swallowed by a feature → go to the team (like creators).
- "report a bug" opened the monthly report → report needs month / summary words.
- "new chat" DELETED the current chat → now just opens a fresh one (old stays in ☰ Chats). "clear chat" still clears.
- English: "create a campaign", "who applied", "budget of 10k", "less than 5000", "creators for my campaign" (was status).
- Creator side: "pan india" opened KYC; "payment pending" went to deadlines; "my deadlines" not understood; "to do"
  matched any "want to do".
- Rates private from brands: no sorting results by rate, Compare shows "Highest reach" instead of "Best value" (₹-based).
- Settings respected: brand status hides the payment-hold line when "Payments & reports" is off; creator script help
  doesn't read orders when "Deals & offers" is off.
- Switching chats while Eva was thinking put the reply (and saved it) in the wrong chat → dropped. Opening an old chat
  resets the half-finished ticket follow-up.
- "N updates" for saved searches were marked seen just by opening Eva → seen only when shown.
- Creator to-do: approved UGC needing a live link (COMPLETED_APPROVAL) was missing. Fallback script (AI off) in English.
- Messages Eva didn't understand were filed as admin tickets → not filed (bugs / ideas / questions / screenshots still are).
- Backend: Eva export max 3 a day (sends email), feedback brands/creators only + daily cap, history writes capped;
  the "alerts off" switch / creator work alert no longer push out a brand's 5th saved search.
Tests: session58Launch v323. Requirement-change test updates (commented): assist_store ("nayi chat" no longer clears),
brandAssist (no rate sort for brands). Suite = baseline.
Still open: Suspend (needs `suspended_until` column — waiting for Ravi's "haan"); public profile/Explore show creator rates
to brands (Eva treats them as private — confirm which is intended); logged-out visitors still see sample campaign stats.

# v324 — Bug hunt round 6 (accounts, money, campaigns, uploads, dashboards)
Accounts:
- Brand "company details" save overwrote the LOGIN email + phone with the POC business email/mobile (no OTP) — an old
  POC email silently undid an Account → email change. Now only the brand profile keeps them. A creator could also post
  here and change role → brand accounts only, role never changed here.
- Delete account: the "money on hold" check used columns deals doesn't have → always skipped (accounts with escrow
  could be deleted). Fixed (read-only payment check). A failed delete no longer says "deleted" and logs out.
- Settings → change password now signs out every other device. Sessions list no longer sends every device's login token
  to the browser, and marks this device as current.
- "Offers and promotions" off now really stops promo emails. Creator settings save no longer reverts the login phone.
- Forgot / reset password use the same email lookup as login (spaces, capitals, old duplicate rows).
- Onboarding: brand social links saved; "onboarded" written only after the profile saved; creator "Profile Submitted!"
  only when it really went through. Profile update reports real failures. Forgot-password fills the email from the link.
- Delete-account screen no longer promises removals that don't happen.
Money:
- Admin "Freeze escrow" (dispute) didn't stop a payout → release refused while frozen.
- Payouts need approved creator KYC (server checks request + release); admin screens no longer show a fake "Verified KYC".
- A changed-while-saving payout answered "ALREADY_PAID" → phone moved an unpaid item to Transferred. Now TX_CHANGED.
  Creator "request payout" can't turn an already-paid row back to requested.
- Desktop Earnings: Request Payout now asks for ALL approved money (deals + UGC) like the phone; "earned" counts only
  money that reached the bank; the button shows the approved amount.
- Referral withdraw: two taps could create two payable requests; two admins could both mark paid + reject → guarded.
  Referral share counts only money actually paid (not RELEASED), once per deal. ₹21 friend / welcome rewards could
  never unlock (read KYC from columns users doesn't have) → KYC table. Referral stats showed 0 rewards → real numbers.
- Receipts / invoice PDF invented a 15% / 10% fee on zero-fee deals (and lowered "net payout") → stored fee only.
- UGC "alert admin" did nothing (id lookup errored) → flags the order's payment.
Campaigns:
- Back on the desktop Edit screen saved a LIVE campaign as a draft (took it offline) → Back only goes back.
- Deals page: brand Accept / Decline never showed (status case), Decline sent a word the server refuses, and the list
  was empty (bad join) → fixed; team members see their brand's applications.
- Applying worked on drafts / under review / rejected / past-deadline campaigns, by brands, even to their own campaign →
  only creators, only live, before deadline (+1 day). Desktop page hides Apply after the deadline.
- Editing a fixed-fee campaign was blocked ("min < max"); editing a closed campaign reopened it → fixed / refused.
- Rejection reason now saved; double-tap Accept can't open two deals + chats; local drafts no longer create duplicate
  campaigns; applicants CSV had 4 empty columns; "N creators match" counts word matches, skips deleted profiles.
Uploads / dashboards:
- /upload read the whole file into memory before checking sign-in → sign-in first, 100 MB cap.
- KYC / PAN / UPI QR files were sent "cache publicly for a year" → private, no-store. KYC images open with the media key.
- Files named without a dot / with spaces failed to upload → safe extension.
- Brand spent counted UGC refunds as spending; "Active collaborations" counted cancelled deals; brand phone "live links
  to approve" never cleared and "new applicants" was always 0; creator phone showed cancelled deals as IN PROGRESS;
  brand campaign cards showed ₹15K–25K / a fixed date / guessed platform → all real now (brands get the real view count).
- Creator auto-profile had score 75 / Lifestyle / fake view; tier now from each deal's own score; admin queue showed
  115,000 followers for 0.
Tests: session58Launch v324. Requirement-change test updates (commented): campaignManage (applicant must be a creator),
brandAssist (AWAITING_LIVE_LINK is the creator's turn). Suite = baseline.
LOCKED files opened (protectedFlows --update, logged): campaigns_routes, content_submissions_routes, payment_routes,
campaignManage, creators_routes.
Open (need Ravi): brand payment sheet shows creator payout + Ybex fee + GST, creator Ready sheet shows fee + GST — hide?;
campaign targeting fields (gender, followers, locations, max creators, dos/don'ts) have no columns → dropped on save
(DB change); YouTube avg views has no column; a partial refund blocks the rest of the payout; sessions never expire;
Suspend (`suspended_until`) still waiting.

# v325 — Bug hunt round 7 (admin, notifications, UGC, public pages)
Admin:
- Any sub-admin could skip the permission gate by writing the URL in capitals (/api/Admin/users…) → gate ignores case.
- The "don't warn / ban / delete admins or yourself" guard never worked (read a column users doesn't have) → fixed, and
  the same guard now also covers creator edit / bin, restore, unban, reinstate, unrestrict and templated warnings.
- KYC reject and admin creator edits wrote users.verified (= EMAIL verified) → people locked out of password login and
  their account open to re-sign-up takeover. KYC approve also marked unproven emails verified. All removed.
- Rejecting one verification overwrote all of the user's verifications → only that one / open ones.
- Push + email broadcasts read only the first 1000 users (and push reached banned users) → every page, active users.
- Activity log showed "System" for every action → admin email saved. Waitlist approve-by-user lookup errored → fixed.
- Admin "set password" said saved when it wasn't; used a 6-character rule → checked, normal password rule.
- Sub-admins got error toasts on Overview; growth report showed brand emails/phones to any staff; feedback readable by
  any sub-admin → fixed.
Notifications:
- Admin alerts (payout due, refund due, KYC submitted, new signup) were never saved: a fake 'admin' row broke the whole
  insert → one row per admin. "Send to all" and app-version notices had the same problem → one row per user (now each
  person can also mark it read).
- Logging out on a shared phone kept the account's pushes coming → phone goes back to guest on logout.
- "Offers and promotions" off now also stops promo pushes. Broadcast email queue can't send the same mail twice.
- User-typed text in admin alert emails is escaped (a sign-up name could put a fake link in a real Ybex email).
- Order-expired / brief-relisted emails were lost at night → sent (WhatsApp still waits). Push loop no longer drops
  notifications saved a little late or during a restart. UGC bell items open the order again. Notifications for a
  deleted account no longer create a fake "placeholder" user. "Contact support" on warning pop-ups now opens Help.
UGC:
- A creator could send a live link before the draft was reviewed → next Approve paid out with no review, order never
  expired, brand couldn't cancel. Now: live link only after draft approval (server + phone).
- Live-link corrections had no limit and reset the revision counter → counted against the limit.
- Brand UGC Payments page crashed (null creator) and "In Payment Hold" was always ₹0 → fixed.
- Briefs/campaigns from brands whose name contained "ravi"/"nexus" (e.g. "Gravity") were hidden from creators → exact
  demo names only. Public /ugc/showcase leaked full brief records → open briefs, safe fields.
- Approving an already-approved draft moved the order backwards → refused; phone shows the right buttons per state.
- Re-claiming after a brand cancel failed with a generic error → clear message. Old submit route could revive expired
  orders → live row. /ugc-orders showed every brief + other creators to anyone signed in → scoped.
- "Manager Override" (in-house team) only changed a local copy → switched off with an honest message.
- Brand desktop showed multi-slot briefs "Completed" too early; chat card showed a made-up "7 days" → fixed.
Public / reviews:
- Profile handle lookup let anyone test emails again ("zz,email.eq…") → only real handles.
- Deal-chat reviews were saved but never shown on creator profiles → shown. Reviews only after the deal is complete,
  one per side; team members can't post repeat profile reviews. No invented "Exceptional…" quote or 5 stars.
- POST /reports needed no login → signed-in only, sizes capped. Contact form threw messages away → opens email.
- Profile views counted every reload/bot → one per signed-in visitor per day. Leaderboard used missing name columns
  and showed hidden profiles → fixed.
Tests: session58Launch v325. Suite = baseline.
LOCKED files opened (protectedFlows --update, logged): campaigns_routes, chat_routes, ugc_routes, creators_routes.
URGENT open (needs Ravi's OK — DB change): brand_profiles / creator_profiles / creator_verifications are readable by
anyone with the public app key (emails, phones, DOB inside rate_card, KYC risk notes). Fix = drop those public-read
policies after moving the few browser reads to the server. Also open: admin "Fees & Risk" settings (payout freeze,
limits) aren't saved/enforced (need columns); robots.txt blocks public /creator/ and /brand/ share pages (intended?).

# v326 — Bug hunt round 8 + database fixes (Ravi: "ok" to the privacy fix; "database … sab bna dena")
Database (applied live): campaign targeting columns, youtube_avg_views, users.suspended_until, transactions.razorpay_payment_id,
payout_status default PENDING, drafts / proofs / UGC buckets private. See docs/database/PENDING_DB_CHANGES.md.
Privacy: every browser read of brand / creator profiles now goes through the server (+ new /creators/review-queue count).
The final step (drop the public-read policies) is scripts/sql/session58_close_public_reads.sql — the database tool refused
DROP statements, so Ravi runs it once in the Supabase SQL editor.
Suspend: really blocks the account (login says "Suspended until <date>"; open sessions end); unban / reinstate lift it.
Campaigns: gender / follower range / locations / creators needed / paid-barter are saved and shown; fake dos / don'ts /
hashtags not sent; no campaign goes for review with a past deadline; old drafts don't bring back a past deadline.
Payments: a second payment for an already-funded deal is not recorded as a second deposit (admins told to refund);
duplicate-insert races answer "already paid" (no extra "Payment Secured", no false error); webhook asks Razorpay to retry
on a temporary error; closing checkout after paying no longer shows "Invalid signature"; only captured money counts;
a part refund no longer blocks the rest of the payout (creator gets the rest); refund status only PENDING / PROCESSED;
a second Pay tap no longer drags a deal in production back to ACTIVE; status poll lookup fixed; paid UGC brief orders that
never became a brief alert admins after 10 minutes; payment id + brand saved on the deposit; UGC refund rows not counted
as payouts.
Contracts: no signing while a counter-offer waits or before a price; the contract shows the thread's agreed amount and the
server refuses a signature for a different amount; Accept on an older offer card is refused (newer offer); counters
limited (₹3,000–₹1 crore for campaigns, whole rupees); no agreement prepared during a counter; the old deal-page sign,
draft, live-link, approve and request-changes routes now follow the chat's stage rules (no reopening completed deals, no
live link before draft approval, deal's own revision limit); admin dispute resolution also closes the chat.
Coupons / team / blog: auto-apply launch offer was never saved → saved and shown; minimum deal value applies at payment;
per-user limit counted; coupon fee rate can only lower the fee; expiry lasts the whole last day (IST); 0 = unlimited uses;
FAQ create fixed (uuid); helpdesk replies need the helpdesk permission; brand promo box hidden (not applied yet).
Team members (local-only, any role could spend) and agency "create creator" (fake verified profiles) switched off until
built properly. Blog HTML cleaned on save and on display (a post could run script and steal logins); author saved.
App / routing: Back no longer bounces between dashboard and onboarding / login; after login you land on the page you
opened (email links); "Finish later" creators open the dashboard; links /brand/ugc, /creator/dashboard, /creator/refer,
/auth/register work; agency accounts get brand pages; brand settings / profile brand-only, Explore not for creators;
app updates wait for "Refresh" (no reload in the middle of an OTP or payment) and are checked when the app comes back;
applicant cards show no made-up ₹12,000 / "5 days" / pitch; dates in IST; ₹ amounts in Indian format; Back buttons on
shared links stay in the app; Eva's cache belongs to one account; admin phone nav highlights the open tab.
Tests: session58Launch v326. Suite = baseline.
LOCKED files opened (protectedFlows --update, logged): campaigns_routes, deals_routes, deals_chat_routes,
content_submissions_routes, payment_routes, src/utils/feeCalculator.ts, creators_routes.

### v327 — Ravi's answers to the permission questions
Q1 brand payment screens/APIs show only the total paid (no creator payout, Ybex fee or GST). Q2 creator sees fee; GST row
and "GST invoice" only when admin turns GST on (else "Download receipt"). Q3 "payment released" chat card + live event show
the deal total, not the after-fee amount. Q5/Q6 old duplicate ₹0 row and 15 old completed briefs left as they are.
Q7 logins last 30 days and renew while the app is used (old 1-year sessions cut to 30 days). Q8 rate limits use the real
IP (last X-Forwarded-For entry). Q9 CORS: ybexmedia.in (+ subdomains), ybexapp.ai.studio, the app's own host.
Q10 public profiles unchanged (little SEO value). Q11 Fees & Risk now real: admin "Freeze all payouts" blocks creator
requests and admin releases; minimum withdrawal checked on "Request payout" (live value ₹500); min / max campaign budget
checked when a campaign is sent for review (barter and drafts not limited; only after admin saves a value). Withdrawal fee
and dispute window are still not used anywhere (hidden from the form). Q12 team members stay off. Q13 brand coupons: not
built (waiting for Ravi). Q14 Do's / Don'ts / Hashtags boxes on desktop + mobile campaign forms, saved, shown on the
campaign page. Q16 desktop chat attachments saved + shown (private link); counter and accept show live on the other side;
the counter "Respond" prompt only for the side that received it; ACTIVE-before-payment no longer says "In production";
both-signed-not-paid says "Pay to start" / "Waiting for payment"; 48/72h UGC reminders spread across the window (24h same).
Q17 Google sign-in: popup blocked → continues in the same tab; popup that lost its link back finishes on /app/oauth and the
first tab follows — no more landing logged out.
Tests: session58Launch v327 (486). agreementRecord test header updated for Q8 (requirement change, commented).
LOCKED files opened (logged): payment_routes, campaigns_routes, deals_chat_routes, chat_routes, agreementRecord, chatStageMap.
Q4 (creator rates visible to brands on public profile / Explore): Ravi — later, Phase 2. Left as it is.
Q15 (sample views/stats on campaigns for logged-out visitors): Ravi — keep them showing. No change.
Q13 (brand coupon at payment): Ravi — not now. Brand promo box stays hidden.

# v328 — Ybex Eva bug hunt (Ravi: "find bugs and glitches in eva")
How: 4 read-only audits (chat shell, brand flows, creator flows, server) → fixes → an independent review re-ran ~400
source pins of 13 test files against the edited files (all hold). No locked files, no DB schema change.
Chat shell (FeedbackBot / EvaPanels / evaUi / evaSettings):
- Phone / browser Back now closes Eva's top layer (settings → 📎 sheet → ☰ drawer → chat) instead of leaving home.
- Scrolling up near the top no longer closes the chat (swipe-close only from the top bar, list at top, no panel open).
- No double send while Eva is thinking (double tap on a starter used 2 of the 30 daily messages and broke drafts);
  a question-box tap made while Eva is busy keeps the box open.
- Late replies no longer land in a new / other chat; the fallback no longer wipes text typed meanwhile.
- Closing resets settings / sheet / drawer; "new creators" notification opens Eva even if already mounted.
- Settings switch no longer snaps back when the server answer arrives late; "Notify me" switch usable if the check fails.
- Closed chat hidden from Tab / screen readers. 👍/👎 saved once per reply. Failed attach says so.
- Delete chat = two taps ("Tap again to delete"). Creators get their own "Ask me about…" line. Chips send English.
Brand:
- Application counts were always 0 (pending / status / "rank my applicants") → counted from `applicants`.
- "Fits budget" now uses the applicant's own bid (never shown). Budgets: "under 8000 male" was ₹800 crore (the "m" of
  male read as million) → units only as whole words; "2.5k" UGC budget was ₹25,000; payout "1.5 lakh" was ₹2;
  ranges "50000 to 1 lakh"; "cr" understood.
- "Create a campaign for my brand" didn't start the builder (and some went to the team as an idea).
- A half-done brief / campaign swallowed "new chat", bug reports and new searches → switching drops the draft with a note;
  old question boxes can't answer the current question.
- "Show more" skipped creators 13–20; "more creators in Delhi" paged the old search; "Lifestyle" also ticked Fashion;
  "2 weeks" / "1 month" / "30 Nov" close dates; date chips one day off after midnight IST; requirements text changed the
  video count; money questions respect "Payments & reports"; Hinglish bits in English replies; reply-language setting used;
  applicants not on Explore show their name / photo.
Creator:
- Cache refresh never worked (applied campaigns still showed "Apply in 1 tap" for 3 min).
- Approved-not-paid (RELEASED) money showed as paid → "Approved · payout next" until UTR; paid-jobs count only paid/approved.
- UGC "You get ₹X" → "Brief budget ₹X" (gross; no fee line, per Ravi's decision).
- Eva's own suggested quote got her ⚠️ → same fair quote + 10% band as Settings.
- Routing: "turn off alerts", "brand offers", feature ideas reach the team, "to do", "paise kab milenge", "get paid",
  platform-fee question, "rate my profile", "how does it work?" (opened campaigns).
- "apply … quote ₹5,000" read 5 as a count → amount pre-fills the quote, named brand picked; paused campaigns hidden;
  "4,500.50" quote → 4500; Earnings switch off hides KYC/payout items; finished deals off the to-do; UGC "Show more";
  invite cards stay in sync / "No longer open"; no "next payout" date (field never sent); IST month; 1.5L style counts.
Server (assist_routes / assist_store):
- Chat list loaded the OLDEST 2,000 messages (new chats missing from ☰ and export) → newest.
- Alert job read only 1,000 saved-search rows unordered (mute could be missed) → paged by id; creator scan ordered + paged.
- Max 1 mute + 1 work-alert row per brand. Export 3/day counted in the DB (was per server memory).
- "Messages left" correct with the DB counter; a failed AI call gives the message back. Feedback save errors logged.
- 64 KB cap on /assist bodies; seen-ids sliced first; mark-seen race fixed; AI intents include alertsOff / invites.
Tests: new brandAssistV328 (18), creatorAssistV328, backend/evaV328 (+assist_store 16 pass). creatorAssist "paid jobs"
pin 2 → 1 (requirement change, commented). npm registry was blocked in this session → full `npm run verify` not run;
tests run with bun (Eva tests 97 pass; 1 file can't load without web-push, same as before).
Open (Ravi to decide): Eva chats / export / "Notify me" are shared by a brand's whole team (keyed by parent brand) —
keep, or per member? Every question-box tap counts toward the 30/day limit — keep?

# v329 — Ybex Eva round 2 (Ravi: "more bugs in backend + UI/UX glitches in Eva")
Backend:
- AI prompt: user text fenced (can't break out of the prompt); answer size capped; creator rate fields stripped from any
  brand context; all model tries share one 21 s budget (phone waits 25 s).
- Eva settings PUT: junk values → 400; a partial save changes only what it names (used to reset other switches).
- Export: full chats; DB error reported (was "No chats yet" email); failed email doesn't use one of the 3/day; IST file name.
- Saved searches: creators only work alerts + mute, brands only creator searches + mute (a creator's search alert named
  other creators; a brand's work alert showed other brands' campaigns); bad id → 404 (was DB error).
- /assist/creator/insights creators only (brands could read other brands' budgets per niche).
- Bad chat id gave another chat / could delete every chat → empty chat.
- Alerts: "budget up to ₹X" compares the marked-up price brands see; paused / closed campaigns not announced; no bell / push
  to banned, deleted or suspended accounts, and those creators aren't named.
- Sub-admins (with helpdesk permission) can open Eva ratings + feedback inbox; feedback threads no longer cut at 1,000 msgs.
- LOCKED (protectedFlows --update, logged): campaigns_routes — brand names / logos read only for listed brands (in 150s;
  brands past 1,000 lost name + logo), "already applied" read with the server client; creators_routes — Explore paging
  in a fixed order (creators skipped / shown twice).
Chat UI:
- iPhone: typing bar no longer pushed under the keyboard in an empty chat; peek stays on screen on short phones / landscape.
- Peek now under drawers / menus / sheets (was on top), still above the page and clear of the bottom nav.
- List doesn't yank to the bottom while reading older messages; "Show more" doesn't jump; long links wrap.
- Greeting animation plays on every open; "reduce motion" switches all Eva animation off; "just now" updates.
- Send dimmed while Eva answers; Enter doesn't send a half-typed Hindi word; chat list load error + "Try again";
  Escape closes the top layer on desktop; focus in / out of the panel; desktop page makes room for the docked panel;
  bigger buttons, better contrast.
Cards:
- No "₹NaN", "undefined", "0 of undefined", "undefined% match", "Invalid Date"; dead photos / logos → initial.
- "Copied" only when it worked; "Alert me" / "Save as draft" / Invite / Apply can't double-send and say when they fail;
  ticks cleared after invite; "Top 5" from visible cards; paging text right on the last page.
- Swipe rows no longer drag the whole chat sideways or trigger the phone's back gesture.
- Brief box shows "n/15" (Next enabled at 15); question text 16px (iPhone no zoom); chips ignore double taps.
- Brand: "fashion in Jaipur" as an answer runs the search, Compare up to 3 + says names not found, 1.5L / 1.2Cr style,
  "10-50k", IST month for the report; product name no longer read as "ads".
- Creator: "Already applied" shared across cards (reset on a different login); "2026" not read as a ₹2,026 quote;
  emoji / Hindi letters count once in the pitch; empty earnings state ("No earnings yet"); paid jobs = reached bank;
  plain-English apply errors with a fix button (KYC, login, closed); story image fits long names.
Tests: new backend/evaV329.test.ts + creator/creatorAssistV329.test.js. Full suite with stub packages: same 136 failures
as v328 (all from missing packages), +19 new passes, 0 new failures. npm still blocked → real `npm run verify` not run.
Open (Ravi): payments `/transactions`, `/escrow-transactions`, payout eligible / payment-methods answer an EMPTY list when
the database fails, so Eva (and screens) say "no payments" / "add payout method" — change to an error? (locked
payment_routes; other screens would show an error instead of empty). Bug-report screenshots go to the public
cover-images bucket (permanent public link) — move to a private bucket? Team-shared Eva chats + question-box taps
counting toward 30/day still waiting.

# v330 — UI/UX glitch hunt, whole app (Ravi: "find more glitches in ui-ux in complete app")
6 areas checked in parallel (creator pages, brand pages, deal chat + inbox, campaigns / payments / deals / UGC,
app shell / auth / onboarding / profile, admin). ~230 fixes in 191 files, each marked "v330:". UI only — no API path,
route, money maths or locked logic file changed (protectedFlows test passes; screen call groups unchanged).
Seen everywhere (fixed per screen):
- "No X yet" shown when the load actually FAILED → "Couldn't load… / Try again" (UGC explore + manage, earnings, KYC
  status, brand campaigns, applicants, UGC orders, deals, campaigns list, notifications, help tickets, leaderboard,
  referral, admin users / payouts / escrow / KYC / waitlist / campaigns / UGC / refunds / helpdesk / logs).
- "NaN", "undefined", "Invalid Date", "₹0", "[object Object]", raw codes (IN_PROGRESS, ESCROW_HELD, under_review,
  MORE_INFO_NEEDED) → real words, "—", IST dates, ₹ en-IN.
- Broken photos / logos → initial; double taps on save / approve / release / reject / send blocked with "…ing" state;
  "Copied" / "Saved" / confetti only when it really worked; icon buttons labelled; bigger tap targets; long names / links wrap.
- Made-up data removed: fake "Global Brand Inc." profile, "Fashion & Retail / New Delhi" defaults that got saved back,
  "Ravi Sharma" name, stranger's stock face for creators without photo, "New Delhi / GOLD Tier", fake Instagram numbers
  "Synced from Instagram", ₹10,000 / ₹3,000 fallback budgets, "#INV-2026-904", "IMPS HDFC", "2 do's / 2 don'ts".
Notable:
- Phone side menu: "Log Out" was hidden under the bottom nav. Notification tap now closes the drawer.
- Brand UGC: bottom nav covered the Approve / Pay bar; "24h SLA" on 48h / 72h briefs; UGC brief tap opened Campaigns.
- Creator home: UGC "Upload in" timer ignored the real deadline ("NaNh NaNm"). OTP boxes overflowed 320px phones (3 places).
- Creator earnings hold sheet ticked "Content submitted" before delivery; "Open Full Asset" opened nothing.
- Brand payments: cancelled brief receipt said "Settled & Transferred"; desktop chat pay sheet "Platform Security Fee FREE
  (₹0)" row removed (totals only) and its made-up ₹3,000.
- Deal chat: task label ran off small screens; Enter sent half-typed Hindi words; sheets stuck on "Sending…" after an error;
  Hinglish "Aapka review baaki"; times in IST; inbox search with no match said "No conversations yet".
- Accept / Decline order fixed (Accept right) in Collabs; Update / Remove in Platforms; colours of Shortlisted / Rejected.
- Copy profile link copied a 404 URL (/creators/:id) → /creator/:id.
- Login / signup / OTP: 16px inputs, autofill codes, email carried to Forgot password; onboarding Continue no longer under
  the browser bar (new --yb-vh in index.css).
- Admin: confirm before suspend / Super Admin / remove admin / reject / recall campaign / freeze escrow / enforce dispute /
  force status / broadcast email / batch approve; mobile "Refund brand" said "initiated" but did nothing → honest message;
  waitlist "Reject Selected" never reached the server → honest message; tables scroll inside their box on phones.
Tests: full suite with stub packages — same failures as v329 (missing packages only), 0 new. One pin restored
(BrandUGCPayments creator id text). npm still blocked → real `npm run verify` not run.
Needs Ravi:
- iPhone safe areas: index.html has no `viewport-fit=cover`, so all safe-area padding is 0 today — add it (test on a phone)?
- Payout timing text: 1–2 working days (receipt, Eva) vs 2–3 (Earnings) — which is right?
- Desktop chat header always shows a green verified tick — show only for verified?
- Waitlist batch reject: make it real (one email per person)? Dead "Schedule call" modal: remove or wire up?
- Receipt label "Convenience fee & TDS" really shows platform fee + GST — rename?
- Brand mobile profile / Explore still show creator rate amounts (Q4 = Phase 2, left as is).

# v331 — Ravi's answers ("hn kr do")
- iPhone safe areas ON: index.html viewport now has `viewport-fit=cover`, so every `env(safe-area-inset-*)` padding
  already in the bars / sheets works (bottom nav, sheets, Eva, pay bars clear the home bar). Top unchanged (the "default"
  status bar keeps the page below the clock). Phone deal-chat footer now clears the home bar too.
  → Please test once on an iPhone (home screen app + Safari) and the Android app.
- Waitlist "Reject Selected" is real: confirm → one reason for all → rejects one by one through the same single-reject
  call (each person gets the email), "Rejecting 3 of 10…", rows update, failed ones stay selected, "Rejected 8 · 2 failed".
- "Schedule a call" (brand home → Campaign Manager card) now opens the call sheet; the request goes to the help desk as
  a ticket ("Call request"); error shown (and WhatsApp opens) if it fails — before it always said "Call scheduled!".
  Date from tomorrow (IST), readable date in the ticket, sheet scrolls + clears the home bar.
- Fee name: everything the creator sees says "Convenience fee & TDS" (payout card, earnings sheet, deal chat breakdown,
  negotiation table, receipts PDF, CSV, agreements text, help / legal text, Eva, chat messages from the server).
  Coupon labels say "Convenience fee waiver / rate" (TDS is never waived). "0% / zero platform fee" promises unchanged.
  LOCKED (text only, protectedFlows --update, logged): campaign_lifecycle.ts, deals_chat_routes.ts, agreementTerms.js.
  Terms version NOT bumped (would make everyone accept again) — say if you want that.
- Desktop chat header: green tick only when the partner is verified (same check as the phone chat).
Tests: full suite with stub packages — same 109 failures as v330 (missing packages only), 0 new; protectedFlows 9/9.

# v332 — Ravi's answers + UI/UX glitch hunt round 2 (Ravi: "hn krvana h", "hn ek ui bna do khali mt dikhao errors ya oops", "find more glitches in ui-ux in complete app")
Supabase public reads: checked live — already closed (migration session58_close_public_profile_reads_v2: brand_profiles /
creator_profiles / creator_verifications policies are service_role + false). Nothing for Ravi to run.
Terms 1.4: LEGAL.termsVersion + backend TERMS_VERSION = 1.4, lastUpdated 16 Oct 2026, new first "what changed" line (fee now
called "Convenience fee & TDS", amount unchanged). Everyone re-accepts once. Version pins in termsVersion / session43V283 /
session43V290Invite tests updated (requirement change, commented).
Payments never look empty on a database failure:
- LOCKED payment_routes (protectedFlows --update, logged): /transactions, /escrow-transactions, /creator/payout-eligible-deals,
  /creator/payment-methods → 503 { code: PAYMENTS_UNAVAILABLE } (was [] / 500). server.ts fetchUserScopedTransactions throws
  TX_READ_FAILED (creator dashboard + admin user panel still catch → empty). brandPayments overview → 503 on a failed read.
- New src/components/common/PaymentsRetryCard.jsx (+ isPaymentsUnavailable): purple shield card "Your payments are safe —
  nothing has changed with your money" + Try again (auto-retries once, max one auto retry a minute). Used on creator Earnings
  (phone + desktop), creator UGC earnings, brand Payments (phone + desktop). Brand profile escrow shows "—" (was "…" for ever).
- Brand desktop home: no "Failed to load transactions." toast; "SLA Amount Spent" → "Amount Spent". Brand phone home: refund
  rows no longer counted as spent.
- Eva: creator "earnings" / "payout check" say "couldn't check just now, your money is safe" + Try again chip (not "No paid
  work yet" / "No bank added"); profile score doesn't nag "add bank" when unknown; brand status "Payment hold: couldn't check
  right now", monthly report Spent "—". Failed reads aren't cached.
UI/UX glitch hunt (6 areas in parallel + 2 independent reviews; ~800 fixes in ~340 files, each marked "v332:"; UI only — no
API path / method change, no locked logic file, protectedFlows 9/9):
- Creator: made-up brief text / categories / do's-don'ts / "14h 22m" timers / "BRONZE rank" / bio removed; overdue = "Deadline
  passed"; failed loads → "Couldn't load / Try again" (home, dashboard, deals, KYC, profile, leaderboard); settings forms stay
  open when a save fails; KYC "Under review" shown right; 16px inputs; sticky bars clear the home bar; referral popup no "Invite 0".
- Brand: stock "Campaign Manager" face removed; "SLA Exceeded" only while the draft is due; cancelled briefs "Cancelled"; dead
  approved-video download fixed (media link); made-up usage rights / job titles / sessions removed; double "Save as draft" blocked;
  Under-review KYC on desktop; public page hides drafts; failed loads → Try again.
- Deal chat / inbox: calm error toasts (new chat/calmError.js), IST times (chat/chatTime.js), made-up ₹3,000 / ₹5,000 / ₹15,000
  removed, failed chat load no longer shows the welcome card, declined/countered offers not "Accepted ✓", failed message readable
  "Not sent", typed reasons kept on failure, bell dot clears after Mark all read, desktop notifications open their link,
  collabs "Refresh metrics" no longer invents numbers, "Verified reach" no fake 25,000.
- Campaigns / deals / UGC / money: raw status codes → words; rejected campaigns "Not approved" (not Draft + Launch); made-up niche
  counts, deliverables, "Marketing Manager", OTP modal fake email / user id removed; real 24/48/72h; "in-house agency after 15h"
  promise removed; desktop Earnings "DONE ✓" only when paid; no made-up receipt dates; drawer Close left / action right.
- App shell / auth / onboarding: CRASH fixed — creator phone onboarding crashed when the email got verified (hook order); brand
  "profile live" screen showed raw ·; failed photo / logo upload no longer saves a dead blob preview; 404 "Go to home" →
  dashboard when signed in; agency accounts get brand settings / pages; help / blog / tickets failed loads → Try again; fake blog
  dates, Mumbai address, stock photos removed; 99+ badges.
- Admin: hard-coded "AI Smart Review / Low risk 8%", fake dispute claims and evidence files, "STAMPED & VERIFIED" contract seal,
  waitlist "8/10" defaults removed; UGC Orders status filter / counts (UPPERCASE) fixed; team-intervention upload now also sends
  videoUrl (server needed it — every upload failed before; same path); rates "₹3,500" no longer saved as 0; confirm before
  destructive actions; Helpdesk conversation no longer blanks on status change; failed loads → Try again; tables scroll on phones.
Tests: new backend/v332Payments.test.ts (6). Full suite (bun, stub packages) = v331 baseline + 6 new passes, 0 new failures.
npm still blocked → real `npm run verify` not run.
Needs Ravi (not changed):
- Payout timing text still differs (48h / 1–2 working days / 48–72h / 2–3 days) — pick one.
- Account recovery window: 180 days (Account status) vs 30 days (Delete account).
- Unproven claims still on screen: login "786+ Creators / 87+ Brands / ₹27 Lac+", apply page "643+ creators", "Contracts managed by
  Leegality", "Zero Platform Fee / Guaranteed SLA" banners, brand refer "Commissions Saved: 100%", blog "Join 10,000+" (subscribe
  saves nothing), campaign guide (Cashfree, TDS above ₹30,000, UPI in 1–2 hours).
- OTP agreement modal always says "1x UGC video (30–60s)" + 24h penalty even for campaigns; "Verified (Locked)" phone with none
  saved — contract wording.
- Desktop "My Deals" "SECURED IN PAYMENT HOLD" badge on signed-not-paid deals (needs a paid flag); desktop Campaigns "Closed" tab
  can never fill (page loads live only).
- Decline applicant uses the browser prompt box (needs a proper sheet); BrandUGCPayments still uses the global loader.
- Dead files with fake data (safe to delete?): pages/profile/MyProfile.jsx, landing ExclusiveBento / BrandGlobe / BrandGrid
  sections, Campaigns.jsx "My Activity" modal, Earnings bank-details modal, market/* widgets, AdminFAQManager.jsx.
- Desktop chat issue form now sends the creator's own reason values (same as phone) — check the admin ticket queue.

---
# v333 — Ravi's phone test (15 screenshots), his answers, landing page, offline, skeletons
Money (cause: the old duplicate payout row f3d6d152… — every screen took the FIRST row of a deal):
- New `src/lib/dealTxn.js` (pickDealTxn / oneRowPerDeal) + `src/hooks/useDealPayoutRow.js`: the row with the money wins
  (paid > released > held, then amount). Receipt no longer ₹0.00, Earnings shows the Dell deal once, desktop receipt too.
- Creator sees only what reaches the bank in chat: payout card "You receive in your bank ₹11,700" (never "Deal amount"),
  header pill ₹11,700 after the deal is done. Brand still sees ₹13,000. Receipt / PDF: a stored 0 can't hide the amount.
- Earnings "Paid to bank": filled green verified tick with a soft glow.
- `scripts/sql/OLD_SQL_already_run.sql (v333_remove_duplicate_payout_row part)` — NOT run, waits for Ravi's OK.
- Brand email with ₹11,700: no such email found in the code (only the creator's own payout email) — Ravi to send the subject.
Ravi's answers: "1–2 working days" everywhere (Earnings, help, legal, agreement text — agreementTerms.js LOCKED, logged);
account recovery 30 days; My Deals "SECURED IN PAYMENT HOLD" only after payment (else "WAITING FOR BRAND PAYMENT");
desktop Campaigns Live / Closed tabs removed; applicant Decline = own sheet (RejectApplicantSheet, reasons + note, same
API call, creator still sees the reason); OTP agreement popup shows the deal's real deliverable, UGC-only penalty with the
brief's hours, "Verified (Locked)" only with a saved phone; claims softened (Guaranteed SLA → Tracked delivery time,
Commissions Saved 100% → Keep more of every deal, 10,000+ / 643+ → plain lines, blog no fake "Subscribed!", Cashfree / TDS
₹30,000 / "UPI in 1–2 hours" corrected; login numbers kept); dead files deleted (MyProfile, ExclusiveBento, BrandGlobe,
BrandGrid, AdminFAQManager, market/*, Campaigns "My Activity" and Earnings bank-details popups).
Notifications: a phone push to /notifications now opens the role's own screen (All / Briefs / Payouts) — the old page had
no Back.
Ybex Eva: settings, ☰ chats drawer and 📎 sheet are solid green (nothing shows through); keyboard: chat moves above it on
the iPhone app (tallest-height check while typing + re-reads after focus); "What can you do?" = one line + 5 chips +
"Show more ▾"; "create a good profile for me" → profile score (was campaigns); scripts: new AI task `creator_write`
(never refuses), shown as HOOKS / SCRIPT / CAPTION with Copy per part; campaign cards = the home campaign card in green.
Loading: My campaigns full-width list skeleton (was a small box in the middle), Brand UGC Payments skeleton (no global
loader), brand profile screens and leaderboard skeletons. (Invite & earn already had one in v332 — Ravi's phone runs an
older build.)
Offline (App Store 4.2 / Play): with no internet a GET answers with the last saved answer of that screen (same login,
wiped on logout) — Earnings, payouts, refer, notifications, inbox, campaigns, UGC; `OfflineBanner` pill "You're offline ·
showing your last saved screens" / "Back online". Dashboard banners are not frozen (festive themes).
Landing page (Claude Design handoff): new `/` = LandingMobileView (<768px) / LandingDesktopView (≥768px), generated by
`scripts/landing/` from the design (text, layout, motion as designed; design-tool preview bar and browser frame removed;
Safari fallback for scroll reveal; reduced motion). Own nav + footer (no Layout). Photos / fonts in public/landing
(3 MB, cached on first visit, not in the app's offline download). Links open inside the app.
Tests: full suite = v332 baseline (same 7 old failures) + new v333 tests, 0 new failures; pins updated for requirement
changes (commented); protectedFlows passes. Real `vite build` passes (precache 250 entries, 8.2 MB).
v333 follow-up (Ravi's answers):
- Brand email with ₹11,700: not a bug — that inbox (ankittomarr123@gmail.com) is the CREATOR account; the creator's
  payout email correctly shows what reached their bank.
- Landing brand wall + reviews read Admin → Landing content (`/landing-brands`, `/landing-reviews`, new
  `src/components/landing/v2/landingContent.js`), same as the old landing. No admin reviews → the reviews section is
  hidden (the design's sample quotes are never shown). Fixed while testing: desktop landing crashed with
  "REVIEWS is not defined" after this change — caught in the browser check before shipping.
- Payment strip logos are in the app (`public/landing/pay/`: Razorpay, Visa, Mastercard, UPI wordmark) — no outside
  links. "Contracts managed by Leegality" → "Agreements signed with Email OTP" (softened).
DEFERRED (Ravi: "baad mai krege"): delete the duplicate payout row f3d6d152… —
`scripts/sql/OLD_SQL_already_run.sql (v333_remove_duplicate_payout_row part)` is ready, NOT run. The app already hides the row (v333 code),
but the database still has it.
Needs Ravi:
- UPI logo is a plain wordmark — send the official NPCI file if you want the real mark.
- Test on iPhone: Eva keyboard, offline (airplane mode after opening a few screens), landing page.

# v334 — env keys, store readiness, offline app, code cleaning, Android splash
Database: duplicate payout row f3d6d152… DELETED (Ravi ran it in the SQL editor; checked — Dell deal now has only the
PAID row e7d720e7…, ₹13,000 / ₹11,700, UTR 3245465787908). scripts/sql/OLD_SQL_already_run.sql (v333_remove_duplicate_payout_row part) fixed
(live column is payout_reference, not utr_number). The DEFERRED line above is done.
Env keys: why the deploy asked so few — there was NO .env.example (README pointed to one). New `.env.example` lists every
key the code reads (Supabase, secrets, Gemini, Resend, Razorpay + webhook /api/payments/razorpay/webhook, Google, Apple
Services ID, VAPID push, WhatsApp, admin, and the ones that must stay empty in production). Step-by-step: docs/setup/ENV_KEYS.md.
Sign in with Apple needs only APPLE_CLIENT_ID (backend already existed).
Store readiness (docs/setup/APP_STORE_CHECKLIST.md): Delete account on desktop Settings too (creator + brand), delete screen
says what goes after 30 days, public /delete-account page with 3 ways; new Help & support card (email, WhatsApp, legal,
delete) on Help screens + /help; footer / app first screen / login links to Privacy · Terms · Help · Delete; "Continue
with Apple" next to Google on iPhone/iPad (calm message if APPLE_CLIENT_ID is missing); "Report this profile" on public
creator / brand pages (existing reports API); 18+ line for Google/Apple sign-up; blog newsletter box hidden; "coming
soon" text removed. Block user = needs a DB table → docs/database/PENDING_DB_CHANGES.md.
Offline app: whole app (all screen files, fonts, icons) saved on the phone on first open; links open the saved app
offline; signed-in phone paints a placeholder page from the first frame (splash + opening animation untouched); saved
screens open with data; never-opened screens show one OfflineState card; Terms/Privacy/Refunds/help open offline; Eva says
she needs internet; login shows "Connect to the internet"; send/apply/pay/upload/save blocked centrally in api.js with one
calm toast (Razorpay never opens offline); "Back online" refresh. docs/setup/OFFLINE_AND_APP_STORE.md.
Android opening (Ravi: logo box for a moment): that's Android 12+'s own system splash (launcher icon). New
android-overrides/ (styles.xml values-v31 + transparent icon + README): plain #7E00DC system splash with no icon →
straight into our animation. Needs a new Android build with Bubblewrap CLI (PWABuilder site can't edit these files).
Code cleaning: 40 dead files deleted (one-off backend scripts incl. two with the live Supabase URL, duplicate modal
copies, 25 unused ui/* parts, old helpers), 881 unused imports removed in 163 files, debug console.logs removed, stale
references cleared, docs/archive/BRAND_MOBILE_AUDIT.md → docs/, empty dev-dist/ removed (+ .gitignore), docs/code/CODE_MAP.md quick map.
Locked files untouched (razorpay.js keeps its 2 logs).
Tests: full suite = v333 (1441 pass, same old failures, 0 new); protectedFlows 9/9; every changed file builds; no undefined
names. npm blocked here → run `npm run verify` + `npm run build` once on the deploy machine.
Needs Ravi:
- Fill keys from .env.example in the hosting secrets (live Razorpay + webhook, Google redirect URI, APPLE_CLIENT_ID, VAPID).
- Android: keep the SAME keystore (assetlinks.json has fingerprint 14:6D:E9:…:18:A9). If the app is already on Play, the
  key is needed to update it. twa-manifest host is ybexapp.ai.studio — change to the live domain if different.
- iPhone: needs a native wrapper build (Capacitor / WKWebView) — TWA is Android-only. Demo reviewer accounts (creator + brand).
- Decide: Block user (DB), remove BETA badges for store builds, Apple button only on iPhone or everywhere.
- bun.lock is an empty file — check the deploy uses package-lock.json.

# v335 — iPhone App Store app (Capacitor, files inside the app) (Ravi: "shuru kro")
New folder ios-app/ (own package.json — the main package.json / lock are untouched): capacitor.config.json (appId
com.ybex.app, webDir ../dist/client, plain #9B00FF launch, no logo), assets/ (1024 icon, purple splash),
ios-overrides/Info.plist.additions.xml (com.ybex.app return link, photo/camera/mic reasons, UPI apps, encryption NO),
README.md (Mac + Xcode steps: npm ci → cd ios-app → npm install → npx cap add ios → npm run assets → npm run sync →
Xcode signing + Sign in with Apple → Archive).
App code (no change on the website — everything checks isNative()):
- src/lib/native.js: server address (VITE_API_ORIGIN, default https://ybexmedia.in); axios (api.js), media links
  (mediaUrl.js), socket (sharedSocket.js), plain fetch("/api…") and server-given "/api/files…" / "/uploads…" images all
  go to the live server with the login token; Android back button; sign-in return link.
- Google / Apple sign-in open in the phone's browser sheet; server state carries app=native and sends the person back
  through com.ybex.app://oauth#token=… (backend/oauth_routes.ts — not a locked file).
- App starts on /app (isStandalone true in the app), opening animation plays (index.html), no service worker inside
  the app, Terms/Privacy/Help open in the app, outside sites in the browser sheet, web-push help hidden in the app.
- Server CORS already allows capacitor://localhost.
Not yet: iPhone phone push (needs Apple APNs + @capacitor/push-notifications + server change).
Tests: new backend/v335Native.test.ts (4); full suite 1448 pass, 0 new failures vs v333; protectedFlows passes.
Needs Ravi: a Mac with Xcode + Apple Developer account (or a Mac build service); APPLE_CLIENT_ID + Google keys on the
server; register com.ybex.app in Apple Developer with Sign in with Apple.

# v336 — iPhone App Store app: Apple push notifications + live update (Ravi: "hn tum is pr kaam strt kro")
Why: the App Store app (Capacitor) can't use web push (the Home Screen app still can), and it carries its own copy of
the web build, so UI changes needed an App Store release.
Apple push (APNs):
- backend/apns.ts — sends to iPhones through Apple (Node http2 + ES256 token from the .p8 key; no new package).
  Settings: APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (com.ybex.app), APNS_PRODUCTION.
- backend/push_routes.ts — POST /push/native-register saves the phone's Apple token in push_subscriptions (endpoint
  "apns:<token>", no DB change); every push (deal notifications + admin campaigns) goes to web-push phones AND iPhone
  app phones; dead tokens removed; web push and Apple push switch on independently.
- src/lib/nativePush.js — same "Never miss a brand deal" screen then Apple's popup; token saved under whoever is signed
  in; tap opens the notification's screen; logout hands the phone back to guest (like web push).
Live update (self-hosted @capgo/capacitor-updater, no paid service):
- scripts/ota-bundle.mjs runs after every `npm run build` → dist/client/ota/bundle-<version>.zip + latest.json
  (version = hash of the files; never fails the deploy).
- backend/appUpdate.ts — POST /api/app/ios-update answers the app with the newer zip; IOS_OTA_OFF pauses,
  IOS_OTA_MIN_BUILD keeps old App Store versions on their build.
- App downloads in the background, shows it on next open; notifyAppReady → a broken update rolls back by itself.
- ios-app: plugins added (@capacitor/push-notifications, @capgo/capacitor-updater), config, set-builtin-version.mjs,
  ios-overrides/AppDelegate.push-snippet.swift, README steps (Push + Background Modes capabilities, APNs key).
Still needs an App Store build: new plugin / permission / icon / anything in ios-app/.
Tests: new backend/v336NativePushUpdate.test.ts (5); full suite 1453 pass, 0 new failures; protectedFlows passes.
Needs Ravi: Apple Developer → Keys → APNs .p8 key + Key ID + Team ID on the server; if the site isn't on ybexmedia.in yet,
change updateUrl in ios-app/capacitor.config.json and VITE_API_ORIGIN when building on the Mac.

## v420 (10 Nov 2026)
- Admin → Users: removed the All / Brands / Agencies / Creators / Unclaimed / Admins chips and "View Bin" — the sidebar's Users list is the one place to switch.
- Special offer: ₹2,000 minimum for every paid deal — UGC brief per video (was ₹500), campaign payout, direct invite / send-brief, offer and counter in chat (was ₹3,000). Messages say "(special offer — usually ₹3,000)". Ybex in-house brands keep ₹500.
- To end the offer: backend/directInvites.ts SPECIAL_MIN_OFFER → 3000, and the client numbers (BrandUGCMobile UGC_MIN_BUDGET, brandLogic UGC_MIN_BUDGET, chatStageMap OFFER_FLOOR, HomeCampaignCard MIN_CAMPAIGN_PAYOUT) + backend/ugc_routes.ts UGC_MIN_BUDGET_PER_CREATOR.

## v421 (10 Nov 2026)
- Supabase blocked the free project (402 on every request: egress 6.3/5 GB, logs 1.2/1 GB). Set maintenance_mode row ON (both sides) in the database.
- New server env switch FORCE_MAINTENANCE=1 (+ optional FORCE_MAINTENANCE_MESSAGE): maintenance page for everyone on every screen except /admin and /blog, without reading the database (backend/forcedMaintenance.ts, server.ts middleware, /api/system-status, App.jsx MaintenanceWrapper). Remove the env var to switch off.
- Admin → Users: the Filters button now sits next to the search box; the panel drops down over the list.

## v422 (10 Nov 2026) — Supabase egress cuts (free plan resets 12 Nov; no second grace period)
- Auth: the users row of an onboarded account is kept 15 s per server copy (was read on every request, ~9,000/day). Onboarding accounts still read fresh.
- Background: fee/settings refresh 1 → 5 min, escrow notifier 1 → 5 min, push queue idle 1 → 5 min, maintenance check cache 15 → 60 s.
- App: system-status poll 30 s → 2 min, inbox badge 45 s → 2 min, pending-work 30 s → 2 min, creator UGC orders 30 → 90 s; none run in hidden tabs.

## v423 (10 Nov 2026) — payments bug report (P1–P17) + brand security report (S1–S16, E1–E2) + appendix
Ravi asked to fix everything in both reports, locked files included (protected manifest updated with that reason).
- Payments: webhook records Instant UGC orders; only captured Razorpay payment ids are saved (never the order id / a failed
  attempt); /verify → 503 PAYMENT_UNCONFIRMED (app retries itself), duplicate_payment flag (app says "charged twice,
  refund 5–7 days"), timing-safe signature; app checks `verified` on every path and forgets a failed verify call;
  paid UGC brief retries post the PAID budget/creators; validation errors are final; paid brief orders are listed from the
  server (GET /payments/brief-paid-orders) for other devices; brief-not-created alert is DB-backed, once per order;
  brief "released" when nothing is held; phone hub uses payments-overview; coupon/stale quote fixes; create-order checks
  deal owner; check-status needs sign-in and reads deposit rows only; cancel finishes; plain payment copy; cleanup.
- Security: new POC email needs a server-side OTP proof (backend/contactProof.ts); OTP send per-IP + global limits and
  masked logs; no "email already in use" enumeration; KYC documents must be the brand's own uploads; only the brand admin
  submits KYC / approves UGC payment; generic 500 messages; logout touches only own sessions; drafts cleared on logout;
  logo/cover only from own storage; local initials avatars (no dicebear); noopener on new tabs; live campaign can't go
  back to draft; /brands/team minimal fields; social-verify no longer claims "verified"; agency/talent manager sign with
  POC email and follow brand-side rules in App.jsx / maintenance.
- Appendix: campaign edit 1–3 creators kept, 50 shown, drafts keep empty fields; KYC POC name not the brand name;
  settings loads after widening; UGC briefs show on home; "In Production" filter works; dashboard unread uses unread_count.
- NOTE: RAZORPAY_WEBHOOK_SECRET is empty in the live env — the webhook (P1/P8) only works once it is set in Razorpay + env.

## v424 (10 Nov 2026)
- Maintenance: the phone app's live-update check (/api/app/android-update, /api/app/ios-update) now passes through
  maintenance — it was blocked, so the Android app stayed on its old build and showed the login screen instead of the
  maintenance page.
- Maintenance page: "Money is safe · Need help? ›" line under "Back in some time" (Ravi's design 1a) → bottom sheet with "WhatsApp us" (918764004299) and "Mail us"
  (support@ybexmedia.in), message prefilled.

## v425 — UX bug list (Developer Fixes doc)
- Blog: mobile "In this article" contents, no post shown twice, read time = words/200 everywhere (src/utils/readTime.js), hero pauses on touch / skips when tab hidden / respects reduced motion + dots, 44px taps, page numbers with "…", CTA "Get brand deals with safe escrow payments", search clear ×.
- Leaderboard: (i) sheet explaining the score (copy says it comes from Instagram engagement — the doc's "past Ybex deals / daily" text was not true), violet score, row chevron, pinned "Your rank #n" from new GET /leaderboard/me (5-min cache shared with /leaderboard).
- Help tickets: /help/tickets/:ticketId route so Back closes a ticket, scroll to newest, "Offline. Retrying…" instead of red error when messages exist, "Replying will reopen this ticket." on RESOLVED, list reloads only after a ticket is created, 44px chips, Enter sends on desktop (Shift+Enter = new line).
- Auth: Forgot password no 2s auto-jump ("We sent a 6-digit code to …" + Enter code), Reset password "Resend code" with 30s wait + live "8+ characters" / "Both match", Verify email Back asks "Leave sign-up?".
- Account status: deleted accounts get a grey icon, no orange banner/reasons; phone padding/sizes; Terms link violet.
- Delete account: failed preflight blocks Continue with "Couldn't check your account. Try again", Resend code (30s) + Back on the code step, flat #7C3AED buttons.
- Tests: src/v425UxFixes.test.jsx.

## v426 — creator panel audit (two reports)
- Rate card: opened from a link before the profile loaded, Save wrote ₹0 over saved rates. Draft now follows the loaded card until edited, Save waits for the profile, only edited rates change (RatesScreen).
- Phone Back closes sheets/popups instead of leaving the page (new lib/popupRules.js (useBackToClose) in MobileSheet + PopupPanel; UGC "Brief details" / sign step). Android back button no longer backgrounds the app while a sheet is open.
- Back to a list restores its scroll position (Layout, per history entry).
- Chat: skeleton gives way to "Couldn't load messages · Try again" after 8 s when a thread has history but no messages came.
- Popups: lib/popupRules.js — Diwali poster / quick actions / promo / What's New / push ask wait for Home's data and only ONE shows per app open; TabWarmup waits until no popup is on screen. Promo: no blur, no bounce. Diwali poster: only "Join Challenge" navigates, no blur/drop-shadow, time bar uses transform. Quick actions: timed slide, not spring. Home's 3.5 s trust-line ticker moved into its own component (no full Home re-render).
- Desktop chat is lazy in CreatorInbox / BrandInbox; jsPDF loads only when an invoice is downloaded. Identical fresh GETs in flight are shared (api.js).
- Smaller: detail budget uses the list's words; quote above budget note; no toast over "Application sent"; Eva's line folds if it lands on an Active Deal; Notifications (phone) drops the dead "Mark all read"; AM/PM uppercase + no leading zero in chat / inbox times; YouTube views no longer fall back to Instagram's; Diwali Home card hidden if the server didn't answer; Terms button violet; Install popup follows the router and slides down on close; gsap removed from vite config.
- Left for Ravi: UGC agreement deliverable clause (locked flow), fake views / "8+ applied" on campaigns (deliberate), Routes key remount (needs a route restructure).
- Tests: src/v426CreatorAudit.test.jsx (+ 6 older source checks updated).

## v427 — UGC agreement Deliverable clause per brief format (Ravi: "haan kr do")
- lib/agreementTerms.js `ugcDeliverableText(type, duration)`: edited = old wording (unchanged); raw = "Raw, unedited … clips, no editing or subtitles, not posted"; collab = "reel … the Creator will post it on their own Instagram as a Collab post with the Brand and keep it live". Uses the brief's video_duration when set.
- Passed from CreatorUGCMobile (claim screen) and UGCContractModal. Already-signed agreements keep the text they were signed with. Protected-flow hashes updated with this reason.
- Fake views / "8+ applied" kept on purpose (Ravi: "nhi htane h").

## v428 — Supabase egress (why the project was restricted)
- Cause found: creator_profiles.instagram_stats.media (last IG posts, ~22 KB a creator, 96% of the table). Every bulk read with select("*") pulled ~10 MB; lean read = ~1.5 MB.
- New backend/inboxLean.ts `readCreatorsLean(client, build)` — every column but instagram_stats + its small fields (followers, likes…) rebuilt into instagram_stats; falls back to select("*") if refused.
- Used in: Eva saved-search job (assist_store), creator Home picks + landing creators (creatorHomePicks), challenge scans, leaderboard (misc_routes), profile nudges, admin Users list, admin waitlist list.
- Eva saved-search job every 3 h (was 30 min).
- Uploads now send long cache headers (unique names 1 year, IG avatars / applications 7 days) so phones don't re-download images.
- NOT done (locked files, waiting for Ravi): Explore list (creators_routes, every 60 s, the biggest reader) and campaign applicants (campaigns_routes). Patch ready.
- Found: 15-day file cleanup never ran (no schedule, dry-run default, 0 deletes); 19 orphan test videos (232 MB) in content-submissions.
- DB 42 MB / 500 MB; storage ~465 MB / 1 GB — egress was the limit.

## v429 (12 Nov 2026) — database load, 15-day delete, Support mode
- Eva "new creators" check: once a day at 9 am India (was every 3 h; before v428 every 30 min). `assist_routes.ts msUntilIndiaNine`.
- Explore (Ravi OK): lean creator read (no Instagram posts) + cache 10 min (was 1 min). Campaign applicants: lean read. Lock updated.
- Explore mobile shows 20 creators and adds 20 on scroll; creator photos `loading="lazy"` (CreatorCard, PersonPhoto, ExploreMobile) —
  only photos on screen download from Supabase storage.
- 15-day delete (`storageHelpers.ts runSubmissionCleanup`): ONLY videos in content-submissions/campaign-deliverables and /ugc-videos;
  uploaded 15+ days ago AND deal/order finished 15+ days ago (or no deal/order left). Every 2 days, first run 15 min after start; FILE_CLEANUP=off stops it.
  Every delete → file_cleanup_audit_logs.
- Support mode: Admin → Users → user → "Open account (support)" + reason. 30-min login (token sup_…, never renewed), user notified,
  every change logged (support_mode_change). Locked: money, bank, KYC, signing, approvals, chat/deal actions, login details, UGC briefs
  (need payment); campaigns only as draft. `authSecurity.ts supportBlocked`. Purple bar + Exit (ExploreHideControl.jsx SupportModeBanner).
- Tests: backend/v428Egress.test.ts (v429 blocks).
- v429 (later same day): auto delete every 2 days (was daily). Explore: after 10 min a tiny check (count + newest updated_at);
  no change → same list (no full read); full read at least hourly. Hide-from-Explore and admin delete now bump updated_at.
  Phone creator profile: photo-led skeleton (ProfileSkeletonMobile) with the photo + name from the Explore card.
- v429 (12 Nov, after unblock): Supabase log limit (1 GB) — push loop now writes push_log once per batch + one phone read
  (was 2 calls per notification); fee config refresh 30 min (was 5); escrow notify 10 min (was 5).
- v429: AI Studio preview (ais-dev-… host) may be framed by AI Studio only — it showed 'refused to connect' because live keys made it count as live.

## v430 (12 Nov 2026) — theme clean-up + Ravi's screenshots
- Theme: one purple (#7C3AED / #6D28D9 / #F5F0FF) on user screens (indigo / purple-600 / violet-600 / #5438FF gone), links purple
  (not blue), one black #0A0A0A, grey #6B7280, borders #E5E5EA, one green (emerald). Portfolio + splash on DM Sans. Coupon Apply purple.
- appConfirm (common/Popup.jsx): the app's own "Are you sure?" sheet instead of window.confirm (portfolio, platforms, template, UGC cancel).
- Brand UGC order: Drive / YouTube / Vimeo / Instagram draft links play inside the card (their player); link box in theme colours; solid header.
- Quick action sheet: tap photo / name → Ybex profile (sheet waits, shows again on return); auto-slides every 4 s until touched.
- Rates: RATES_PUBLIC=false (utils/rateCardQuote.js) — kept, not shown to brands: profile "Coming soon · Ybex Premium" card, no rate on
  Explore cards / filters / invite. Creator still sees own rates ("Only you can see your rates").
- Public profile: the stats panel opens the creator's Instagram (IG logo + "Open ›").
- Chat: empty "BRIEF · UGC Deliverable" card no longer shown.
- Admin phone: tabs follow sub-admin permissions (Users / KYC / Payments / Waitlist) — was "Couldn't load, check internet" (403).
  KYC / users / waitlist lists show photos.
- Android status bar: own plugin MetaEventsPlugin.YbexBarsPlugin + styles (needs a new Play Store build — Android 15+ ignores the old call).

## v431 (12 Nov 2026) — admin phone audit (Ybex_Admin_Mobile_Audit_v429.pdf, 57 items)
- Money: payout = payable after part refunds (#1, #38 old screen too); bank refund snapshot fields (#2); new read-only
  GET /admin/escrow/payout-check runs the server's stops BEFORE the "send money" sheet (#3); "already paid" no false success (#4);
  refund "Hold" → "Mark failed" with the honest text (#5); FAILED / CANCELLED never payable (#6); paise kept (#56);
  UTR = server rule [A-Za-z0-9-]{6,40} (#57); "Refund account" label (#51); Details opens that payout (#7).
- Access: KYC approve/reject accept sub_admin role (#58); empty KYC can't be approved / not counted (#8); KYC status names (#9);
  banned users visible + Banned / Recycle bin chips + user search (#14 #15 #49); suspended_until chip (#16); Back closes sheets
  (#26); queues / search / tabs follow permissions (#29); KYC files need KYC permission for sub-admins (#44).
- Freshness: phone lists reload on any admin change (ybex:data-changed) and when the app comes back (#37 #21 #54);
  broadcast notifications clear (#25 #53); Overview error state (#19); search loads lists only after typing (#24).
- Waitlist: Creators / Brands / Started tabs, search + ?q= (#22 #47), real IG handle only (#27), started leads no buttons (#28),
  brand company + website (#45), KYC chip (#46). Campaign: cover, full brief, brand link (#48), ?open= goes to full queue (#23).
- Small: #10 #12 #13 #20 #31 #32 #33 #34 #35 #41 #55.
- Left: #17 (waitlist tile count is the server's), #18/#52 (brand-approved payouts still counted on the phone), #30, #36, #39, #40 partly,
  #46 "approve both", #50.
- v431: Eva invoice — "yes" is not an item; "2 reels 4500 each" at the price step = 2 × ₹4,500; "change UPI / bank / address" works after the invoice is made (saves + updates it).
- v431 (later): Eva invoice reads messages with AI first (POST /assist/ai task "invoice", flash-lite first, 9 s, own cap 150/day,
  no Eva quota) → client / items (qty × each) / due / TDS / discount / UPI / address / questions answered without losing the step;
  old rules are the fallback. Admin audit round 2: menu aliases = server (#30), queues by permission (#59), no-answer = "not sure,
  refresh" (#62), 409 closes the sheet + refreshes (#60), expect_status / expect_pending guards on KYC / waitlist / campaign
  decisions (#61), phone tables scroll on their own with the action column pinned (#64 #65). Left: #63 (saved-data mark).
- v431: inside the installed / Play Store app "/" always goes to /app (a "/?…" start showed the website landing with broken logos — the app bundle has no landing photos).

### v431 — stale cache + Eva audit
- Web: `/api/app-version` + `startVersionWatch` (staleBuild.js) → an old cached build reloads itself once a newer version is live (waits on checkout / OTP / KYC / chat). Native app keeps capgo OTA.
- Native: installed app always opens `/app` (landing images aren't in the OTA bundle).
- Eva audit: invoice number lock + duplicate re-number; PAID/CANCELLED final (409); team members invoice as the brand; GST needs client state; `/admin/invoices` → manage_campaigns; creator Eva honours a niche named in the message, new `pitch` intent, no-niche creators see all campaigns + set-niche nudge, festival captions/hashtags, Hindi for small system lines.

### v432 — creator public profile redesign (phones, design 2b)
- PhotoLedHeaderMobile.jsx is now the whole phone profile: photo fading into the sampled page colour, name + KYC tick, Instagram handle with shine (opens Instagram), four numbers on the page, one info line (live / reviews / match), jump chips Work · Reviews · About · Rates that stick with the name on scroll (scroll-spy), themed cards only, sticky "Send collab request" bar + escrow line.
- Rates: brands see "Creator rates · with Ybex Pro" (Notify me → one feedback note per viewer; Ask for a quote → invite sheet). Owner sees own rates privately.
- About hides empty fields; gender / payment terms removed. Profile views + tier chip dropped. Logged-out: everything visible, CTA "Sign in to collaborate", sticky bar sits under the site header.
- Desktop unchanged. Owner footer ("Showcase…") hidden on phones.

### v433 — YBEX_ENV accepts the Firebase JSON as pasted
- envBundle.ts: an unquoted `{ … }` value runs over many lines until its braces close; a second `KEY=` glued on the same line is read as its own key; an empty duplicate key never wipes a filled one; one-line (spaces) bundles don't split inside JSON. fcm.ts takes the `{ … }` out of any extra text.

### v434 — KYC "pending" only when something was sent
- UserEnforcementPanel: `kycHasRealData` — a name / DOB / phone in the documents object no longer makes "PENDING ADMIN APPROVAL"; needs a PAN / Aadhaar / GST number or a proof file (key match is word-based, so "company_name" doesn't count as "pan").
- Admin KYC queue: PENDING rows with no ID number and no file are left out (`kycSubmissionHasProof`).

### v435 — Eva question test fixes
- FeedbackBot: greetings / thanks / who / FAQs from the old brain are kept (no "didn't get that" override); EvaBoundary around Eva and each card; several requests in one message render one answer each (`more`).
- assistBrain: "what is / how do I / where is" are questions, not "confusing" reports; Eva asks "send this to the team?" before filing (yes / no); other languages get an honest line; Hinglish word list wider; "training mode" texts replaced.
- assistKnowledge: FAQs for escrow, refund, support, delete account, team members, cancel, pay-less (fee + TDS), safety (threats); specific FAQs win; yes/no questions and FAQ statements answered.
- Creator: KB answer before AI; KYC verified said first; revision how-to; refer/handoff/payWhen traps; apply to a named brand across all campaigns (never fills another brand's); campaign search by city / budget / barter; splitRequests.
- Brand: campaign builder pauses for a new request ("continue campaign" resumes); FAQ / safety / bot questions not cards; "under 5000 rupees" no longer engagement 5000%.
- Server: first model ≤ 9 s, thinkingLevel LOW on Gemini 3.

### v436 — Admin › Developer › How it works videos
- whats_new_routes.ts: setupHiwVideoRoutes — 10 videos (B1–B5, C1–C5) + playlist; settings in storage banners/hiw/config.json (no DB table), uploads to banners/hiw/; full admins edit; GET /hiw-videos for the app (only videos that are set).
- WhatsNewManager.jsx: HiwVideosManager (rows, status pills, YouTube | Upload switch, Preview / Remove / Save, playlist); adminSearch Developer pill #2; PlatformTools tab.
- WhatsNewPopup.jsx: loadHiwVideos / hiwVideosForRole / openHiwVideo (YouTube opens the link, file plays in-app).

### v437 — App tour + How it works tile / section popup / reminder (APP_TOUR_SPEC, REMINDER_TOOLTIP_SPEC)
- WhatsNewPopup.jsx: AppTour (5 steps brand / creator, dim with hole + ring + arrow, Next / Skip / Done, back = Skip, reduced motion; new accounts since 13 Nov only, once — `yb_tour_done_<uid>`), HiwTile + HiwSheet on both Home quick bars (hidden if all 5 Not set), HiwSectionHelp (header "How it works" button, first-time popup with "Don't show again", reminder tooltip with all spec rules — progress in `yb_hiw_<uid>` on the phone, no DB table).
- Headers: Inbox (both), Campaigns (both), Instant UGC (both), Payments / Earnings. BottomNav opens the Manage chooser on tour step 3 (`ybex:tour-menu`). Creator Earnings tile id `quickbar-earnings`.
- Quick actions / congrats wait for a new account's tour; quick actions no longer pops up the moment its items arrive before checking other popups.

### v438 — Eva deep test fixes (Ybex_Eva_Deep_Test_v429.pdf)
- Messages typed while Eva's brain loads now wait (queue) instead of becoming tickets; failed load retries once, then the old brain answers.
- Backup AI model after 8s (AI_FIRST_MS). Daily AI limit 150, burst 20/min; understand+chat for one message counts once.
- Plain-text AI answers accepted; checkAiAnswer validates reply/intent/budget.
- Follow-ups edit the last result: "make it shorter/funnier/hindi mein" (text), "only female/under 5000/beauty instead" (search), "make it 50000" (plan). Shorter fallback keeps whole lines.
- Fixed literal backspace chars in the brand refine regexes (refine never matched).
- Creator apply checks profile + KYC first. Offline message + resend on reconnect. Keyword traps fixed. Phone history labelled unverified.

### v439 — How it works: Home tile + stories, section popups (Claude Design handoffs)
- Home quick bar: "How it works" tile (story ring, 8s looping sprite public/assets/hiw-tile-loop.webp, pauses off screen, reduced-motion safe, gradient+play fallback). Replaces Media kit (creator) / Refer & Earn (brand); no role video set in Admin → old tile stays. Ring turns grey once all the role's videos are watched.
- HiwStories: full-screen 9:16 stories (portal), progress bars, tap/swipe, 3D cube transition, CTA in the last 10% (YouTube: after 4.4s), deep links, playlist link on the last story, closes after the last.
- Section popups (Chat, Campaigns, Instant UGC, Payments × brand/creator): Option 1 centred card with the animated illustration from the handoff (src/components/whatsNew/hiwIllustrations.js, generated, lazy-loaded). Header chip reopens the popup. Popup waits while another popup is open (never stacked).
- Eva: "Meet Eva" popup on the first open (EvaHiwPopup in FeedbackBot), no header button / tooltip.
- Tooltip restyled to the handoff. File count: 10 duplicate landing images de-duplicated (LandingMobileView now points to the desktop copies).

### v440 — Ravi's review of v439
- Header "How it works" chip replaced by a button that matches each header: icon-only (play-in-circle) next to the bell / search / New, "Guide" pill next to Help on Payments / Earnings. Still opens the popup.
- Tour: the light now covers the raised Manage button (target measured with its children) and waits until the Manage chooser stops sliding before lighting "Campaigns / UGC".
- Eva AI: Claude answers first when ANTHROPIC_API_KEY is set (model ASSIST_CLAUDE_MODEL, default claude-haiku-5-5); Gemini is the automatic backup (error / timeout / no key). ASSIST_PROVIDER=gemini forces Gemini only. Invoice reader too.

### v441 — "Guide" everywhere
- Every section header button now reads "▶ Guide" (icon-only play button wasn't clear). Same pill style as Help.
- Closing the first-time popup without watching shows the tip on the Guide button once (question + 2 points, Play / Got it). Not after "Don't show again".

### v442 — YouTube mark on Guide; tip titles from the popups
- Guide button icon = YouTube mark (red rounded box + white play) instead of the purple circle play.
- Tip titles shortened from the popup lines: How does chat work? · How does UGC work? · How do campaigns work? · How to apply to campaigns? · How do payouts work? · How do payments work?

### v443 — pre-deploy QA (14 Nov) + Claude live key
- Eva with the real Claude key (claude-haiku-5-5): all AI tasks answer in ~1–5 s with valid JSON.
- New AI task "text" (both roles): plain reply / explanation / rewrite — used for the creator's brand reply, contract explainer and every "make it shorter / hindi mein" edit (creator_write / write forced a full reel kit).
- Brand: "make it 50000" after a plan changes the plan even when a script was written earlier (state.lastKind).
- Claude gets 13 s on long writing tasks (Gemini keeps 8 s as backup).
- No-AI "make it shorter" for captions keeps the first sentence + 4 hashtags.
- Stories CTA also shows in the last 3 s of a video. Tour plate clamped to the screen.
- YBEX_ENV_v442.txt: + ANTHROPIC_API_KEY, ASSIST_CLAUDE_MODEL, ASSIST_PROVIDER.

### v444 — caption only; tour after the Diwali screen
- Creator "write a caption…" asks the AI ("text" task) for one caption + hashtags only; a hooks/script kit is never shown as a caption.
- AI edits ("make it shorter") drop intro lines like "Here's a shorter version:".
- First-time tour no longer gives up when another app-open screen (Diwali entry) shows — it waits for it to close (≤ 60 s) and follows it.

### v445 — Unused code report (v439) — Ravi's choices
- Deleted (no imports / routes / tests): components/payments/TransactionCard.jsx, utils/analyticsPdfReport.js, constants/testIds/*, packages express-rate-limit + node-cron, api/onboarding.ts sendOTP / verifyOTP / checkUsernameAvailability.
- Removed pages with redirects: /leaderboard → Home (page + GET /leaderboard, /leaderboard/me API gone — it read every creator), /creator/ugc/earnings → /earnings (page deleted), /brand/ugc/payments → /brand/payments (route only; BrandUGCPayments.jsx kept because its money helpers are pinned by tests). Admin promo-popup link list updated. 4 tests updated (requirement change).
- Kept by Ravi's choice: old deal trio + D3 + their deal routes (locked), market-intelligence AI routes, CreatorUGCOrders / BrandUGCBriefs.
- Not done: CreatorCampaignFlow (protected screen) — removing it needs `npm run protect:update`, which only Ravi may run.
