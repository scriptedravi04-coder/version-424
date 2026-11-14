# Ybex — setup guides (one file)

App Store / Play / offline app, Instagram, local testing and the YBEX_ENV template. Keys: ENV_KEYS.md. Domain: DOMAIN_CLOUDFLARE.md.


---

<!-- was APP_STORE_CHECKLIST.md -->

# Ybex — App Store (iPhone) and Google Play checklist

Written for Ravi (v334). Part A = what the app already has (with where to find it). Part B = what **you** fill in
on App Store Connect / Play Console. Part C = demo accounts for reviewers. Part D = risks and open decisions.

Links you will paste again and again:

| What | Link |
|---|---|
| Privacy Policy | `https://ybexmedia.in/privacy-policy` |
| Terms of Service | `https://ybexmedia.in/info/terms` |
| Refund Policy | `https://ybexmedia.in/info/refunds` |
| Support / contact | `https://ybexmedia.in/help` (shows email + WhatsApp without login) |
| Delete account (works without the app) | `https://ybexmedia.in/delete-account` |
| Support email | `support@ybexmedia.in` · WhatsApp +91 87640 04299 |

All five pages open **without logging in** (checked in `src/App.jsx`).

---

## Part A — what is done inside the app

| Store rule | Status | Where |
|---|---|---|
| **Delete account inside the app** (Apple 5.1.1(v), Play "account deletion") | ✅ | Phone, creator: **Profile tab → Account → Delete account**. Phone, brand: **Brand tab → Account → Delete account**. Computer: **Settings → Account & delete → Delete account** (new in v334). 3 taps. Email code confirms. Screen says what is deleted, what is kept, and the 30-day recovery. Code: `src/components/account/AccountPanel.jsx`. |
| **Delete account without the app** (Play needs a web link) | ✅ | `/delete-account` — step-by-step for app, website and "can't log in → email privacy@ybexmedia.in". Logged-in visitors can delete right there. Linked in the website footer, the landing page footer, the app's first screen and every Help screen. Code: `src/pages/legal/DeleteAccount.jsx`. |
| **Privacy / Terms / Refund links** | ✅ | Login screen (new line under the buttons), signup (18+ checkbox with links), app first screen (new links row), app email screen, Settings → Privacy & Terms (both roles, phone + computer), website + landing footers. |
| **Help & support contact in the app** | ✅ new | Phone: Profile/Brand → Help centre → "Help & support" card (email + WhatsApp + legal + Delete account). Computer: Settings → Help & Support, and `/help`. Code: `src/components/help/SupportContactCard.jsx`. Ticket form ("Chat with support") already existed. |
| **Sign in with Apple** (Apple 4.8, because Google sign-in is offered) | ✅ (needs `APPLE_CLIENT_ID`) | Black "Continue with Apple" button, same size as Google, on iPhone/iPad: app email screen (already), website login, website signup, phone signup welcome (new). If the key is missing it shows a calm "not set up yet" line. Code: `src/components/auth/AppleSignInButton.jsx`, server `backend/oauth_routes.ts` (unchanged). Privacy Policy now mentions Apple sign-in. |
| **Permission prompts with a reason** (Apple 5.1.1) | ✅ | Only notifications are asked. Our own explainer screen first ("Never miss a brand deal" + what you'll get); the phone's real popup opens only after tapping the button. Camera / photos are never asked by the app — the phone's own file picker is used when you upload. No location, contacts, microphone. Code: `src/components/push/PushPermissionScreen.jsx`. |
| **No placeholder / "coming soon"** (Apple 2.1) | ✅ fixed | Blog newsletter box hidden (it saved nothing — `SHOW_NEWSLETTER` in `src/pages/blog/BlogIndex.jsx`); public UGC page "More videos coming soon…" → "No videos here yet." Demo logins only appear when the server has `DEMO_LOGIN=true` (keep it off). |
| **No in-app purchase needed** (Apple 3.1) | ✅ | Ybex sells **real-world services** (creators making and posting brand content, UGC made to order) and advertising campaigns. No digital subscriptions, coins, boosts or paid badges anywhere in the app. Razorpay is correct — see Part B "Payments note". |
| **Report a user / content** (Apple 1.2) | ✅ new (partly) | Public creator and brand profiles: **"Report this profile"** (reasons + details) → Admin → System reports. In a deal chat: menu → "Raise an issue on this order" → admin ticket. Help → "Trust & Safety" ticket. Admin can suspend / ban users. Code: `src/components/safety/ReportUserLink.jsx`. |
| **Block a user** (Apple 1.2) | ⚠️ not built | Needs a database table → waiting for the database session. Until then the report form says support can close the chat and suspend the account. See Part D. |
| **18+ only** | ✅ | Terms: 18+. Email signup: required checkbox "I am 18 or older and agree to the Terms and Privacy Policy" (website + app). Google / Apple: "By continuing you confirm you are 18 or older…" line (app line updated in v334). |
| **Works offline / not just a website** (Apple 4.2) | ✅ (v333) | Last-seen screens open without internet, offline banner. Another v334 task is improving this. |

---

## Part B — Apple App Store Connect (iPhone)

1. **App Information**
   - Category: **Business** (secondary: Social Networking or Productivity).
   - Content rights: you own or have rights to all content (creator photos are uploaded by users).
   - Age rating questionnaire: answer honestly — no violence/sexual content made by Ybex; **"User-generated
     content: Yes"**, **"Messaging / chat: Yes"**, **"Unrestricted web access: No"**, gambling/contests: No.
     Because the Terms say 18+, pick the **18+** age rating (use "Age Rating Override" if the answers give a lower one).
2. **App Privacy → Privacy Policy URL**: `https://ybexmedia.in/privacy-policy`.
   **User Privacy Choices URL** (optional): `https://ybexmedia.in/delete-account`.
3. **App Privacy → Data collection ("nutrition label")** — all of these: *Linked to the user: Yes*, *Used for
   tracking: No* (Ybex doesn't share data with ad networks or data brokers).

   | Apple data type | Collected? | Why (purpose to tick) |
   |---|---|---|
   | Contact Info → Name, Email Address, Phone Number | Yes | App Functionality; Developer's Advertising or Marketing (campaign / offer emails) |
   | Contact Info → Physical Address | No (only city) | — |
   | Financial Info → Other Financial Info (bank account, IFSC, UPI for payouts) | Yes | App Functionality |
   | Financial Info → Payment Info | No — cards / UPI payments are handled by Razorpay, not stored by Ybex | — |
   | User Content → Photos or Videos (profile photo, portfolio, deliverables) | Yes | App Functionality |
   | User Content → Emails or Text Messages (in-app chat) — or "Other User Content" | Yes | App Functionality |
   | User Content → Customer Support (tickets, reports) | Yes | App Functionality |
   | User Content → Other User Content (bio, rate card, reviews, campaign briefs, agreements) | Yes | App Functionality |
   | Identifiers → User ID | Yes | App Functionality; Analytics |
   | Identifiers → Device ID | Yes (push subscription, analytics cookie) | App Functionality; Analytics |
   | Usage Data → Product Interaction | Yes (Google Analytics page views) | Analytics |
   | Diagnostics → Crash Data / Other Diagnostic Data | Yes (Eva "report a problem" files, error logs) | App Functionality |
   | Other Data → PAN, GSTIN / business document, date of birth, gender | Yes | App Functionality (verification, tax) |
   | Location, Health, Contacts, Browsing History, Search History, Sensitive Info | No | — |

4. **Sign in with Apple**: create the Services ID and set `APPLE_CLIENT_ID` (steps in `docs/setup/ENV_KEYS.md` §6), and
   register the email domain for "Hide My Email" users. Test it on a real iPhone before you submit.
5. **App Review Information**
   - Sign-in required: **Yes** → give the **creator** demo account (Part C) in the user/password fields and the
     **brand** account in the Notes.
   - Contact: your name, phone, `support@ybexmedia.in`.
   - **Notes for the reviewer** (copy and edit):
     > Ybex is a marketplace in India where brands hire content creators. Payments are for real-world services
     > (creators making and posting promotional content on Instagram/YouTube, and made-to-order UGC videos for the
     > brand's own ads), paid by the brand to the creator through Razorpay. No digital content, subscriptions or
     > features are sold inside the app (Guidelines 3.1.3(e) goods and services consumed outside the app, and
     > 3.1.3(g) advertising management). Please don't complete a payment — the demo brand account already has a paid
     > deal you can open.
     > Log in: tap "I'm a Creator" (or "I'm a Brand"), type the email, then "Use password instead".
     > Delete account: Profile → Account → Delete account. Report a profile: open any creator/brand profile →
     > "Report this profile" at the bottom. Sign in with Apple is on the email screen.
     > Notifications are optional; nothing else is asked.
6. **Support URL**: `https://ybexmedia.in/help`. **Marketing URL**: `https://ybexmedia.in`.
7. **Screenshots**: iPhone 6.9" (1320 × 2868) — at least 3, up to 10. iPad only if you ship for iPad (13" 2064 ×
   2752). Use the demo accounts with the sample data — real-looking, no "test", no personal phone numbers.
   Suggested: Home, Live campaigns, Creator profile, Deal chat with the payment-hold card, Earnings, Eva.
8. **Export compliance**: uses only standard HTTPS encryption → "No" to custom encryption (set
   `ITSAppUsesNonExemptEncryption = NO` in the app's Info.plist so you're not asked every build).
9. **iPhone app build (Capacitor / developer side)**
   - Info.plist text for the phone's file picker (it can offer the camera):
     `NSCameraUsageDescription` = "Ybex uses the camera only when you choose to take a photo or video to upload,
     like your profile photo or a deal deliverable." · `NSPhotoLibraryUsageDescription` = "Ybex opens your photos
     only when you choose a photo or video to upload." · `NSPhotoLibraryAddUsageDescription` = "Ybex saves a file to
     your photos only when you tap Download."
   - Capability: **Sign in with Apple**. If native push is added later, also Push Notifications (see Part D).
   - Google sign-in **inside an app web view is blocked by Google** ("disallowed_useragent"). The app must open
     Google sign-in in the system browser (ASWebAuthenticationSession / Capacitor Browser) or use native Google
     Sign-In. Otherwise reviewers see a Google error → rejection.
   - Turn **maintenance mode OFF** (Admin → Platform settings) while the app is in review.

## Part B — Google Play Console (Android)

1. **App content → Privacy policy**: `https://ybexmedia.in/privacy-policy`.
2. **App content → App access**: "All or some functionality is restricted" → add the creator and brand demo
   accounts (Part C) with the same login steps as for Apple.
3. **App content → Ads**: "No, my app does not contain ads".
4. **App content → Content rating (IARC)**: category "Social / communication or Business"; users can interact /
   exchange messages: **Yes**; user-generated content: **Yes**; shares location: **No**; digital purchases: **No**;
   no violence / sexual / drugs / gambling content.
5. **App content → Target audience**: **18 and over only**. "Appeals to children": No.
6. **App content → Data safety** (answer "Yes, we collect data"; "Data is encrypted in transit": **Yes**;
   "Users can request deletion": **Yes** → `https://ybexmedia.in/delete-account`). Collected and **shared**?
   Ybex shares with service providers only (hosting, Razorpay, email) — Google counts that as *not* sharing.

   | Play data type | Collected | Optional? | Purpose |
   |---|---|---|---|
   | Personal info → Name, Email address, Phone number, User IDs | Yes | Required | Account management, App functionality, Fraud prevention |
   | Personal info → Other info (date of birth, gender, city, PAN, GSTIN) | Yes | Required for payouts / verification | App functionality, Fraud prevention |
   | Financial info → User payment info (bank account / UPI for payouts) | Yes | Required to get paid | App functionality |
   | Financial info → Purchase history (deal payments, receipts) | Yes | Required | App functionality |
   | Messages → Other in-app messages (deal chat) | Yes | Required | App functionality |
   | Photos and videos → Photos, Videos | Yes | Optional (profile) / required for deliverables | App functionality |
   | Files and docs (KYC / GST certificate, agreements) | Yes | Required for verification | App functionality, Fraud prevention |
   | App activity → App interactions, Other user-generated content (bio, reviews, briefs) | Yes | Required | App functionality, Analytics |
   | App info and performance → Crash logs, Diagnostics | Yes | Optional | App functionality, Analytics |
   | Device or other IDs (push token, analytics id) | Yes | Optional | App functionality, Analytics |
   | Location, Contacts, Calendar, Health, Audio, Web browsing | No | — | — |

7. **App content → Account deletion**: "Yes, users can create an account" → delete URL
   `https://ybexmedia.in/delete-account`; in-app path Profile → Account → Delete account.
8. **App content → Financial features**: Ybex holds deal money in a payment hold and sends payouts through
   Razorpay. Answer the declaration honestly (it is *not* a loan, bank, crypto or wallet-top-up app). Ask your CA
   which option fits if unsure.
9. **App content → Government ID / sensitive info**: Ybex asks creators for PAN and brands for GSTIN/PAN for tax
   and payouts — this is already explained in the Privacy Policy.
10. **Store listing**: short description (≤ 80 chars), full description, app icon 512 × 512, feature graphic
    1024 × 500, phone screenshots (2–8, 16:9 or 9:16, min 320 px), contact email `support@ybexmedia.in`, website
    `https://ybexmedia.in`, privacy policy link.
11. **Android app build (TWA / Bubblewrap — developer side)**
    - `twa-manifest.json` says `"host": "ybexapp.ai.studio"` — keep it until ybexmedia.in serves the app (v337). Moving the
      Android app to the new domain later = one Play update (new APK with the new host).
    - `https://ybexmedia.in/.well-known/assetlinks.json` must list **both** SHA-256 fingerprints: your upload key
      (already there) **and** Play Console → Setup → App signing → "App signing key certificate". Without the Play
      one the app shows a browser address bar after Play installs it → reviewers call it a "webview wrapper".
    - New apps must target a recent Android version (Android 15 / API 35 in 2025–26). Update Bubblewrap and rebuild.
    - If the Play developer account is a **personal** account made after Nov 2023: you must run a closed test with
      at least 12 testers for 14 days before production is unlocked. An **organisation** account (Ybex Media, needs a
      D-U-N-S number) skips this.

### Payments note (both stores)

Ybex takes payment from brands for work that real people do outside the app (posting on Instagram/YouTube, making
ad videos for the brand). Apple allows non-Apple payment for this (3.1.3(e) goods/services consumed outside the app;
3.1.3(g) apps for buying/managing advertising campaigns). Google Play Billing is likewise only required for digital
goods; physical/real-world services may use Razorpay. Keep it that way: **never** sell anything digital in the app
(no "Ybex Pro", boosts, paid badges, coins, or paid Eva). The referral rewards are cash paid to UPI, not bought.

---

## Part C — demo accounts for reviewers (make these before submitting)

Make two **real** accounts on the live app (not `DEMO_LOGIN`), each **with a password** (reviewers can't receive
the email code). Use emails you control, e.g. `review.creator@ybexmedia.in` and `review.brand@ybexmedia.in`.

| Account | What it should show |
|---|---|
| **Creator** — "Ybex Review Creator" | Complete profile with photo, 2–3 portfolio items, rate card, social handle; KYC approved (admin approves); at least one deal in chat at "work in progress" (paid, money in hold), one completed deal with a payout and receipt, one open invite; a few notifications. |
| **Brand** — "Ybex Review Brand" | Company profile + logo, verification approved, one live campaign with applicants (include the review creator), one UGC brief, the paid deal with the review creator, payment history with a receipt. |

- Write both in App Review Information (Apple) and App access (Play), with the steps: tap "I'm a Creator" / "I'm a
  Brand" → type email → **Use password instead** → password.
- Don't use real people's data. Keep these accounts out of public lists if possible (or make them look normal).
- After review, keep them — every update is reviewed again.

---

## Part D — known risks and open decisions

1. **Block user — done (v337).** "Block" next to "Report this profile" on every public creator / brand page and in the
   chat ☰ menu; Help → Blocked people to unblock. A block stops messages, invites and applications both ways, hides
   the chats, and files a report for the team (Admin → System reports, type `user_block`). Tell the reviewer in the
   notes: "Users can report and block from any profile or chat menu; we act on reports within 24 hours."
2. **30-day final deletion runs by hand for now.** The app and Privacy Policy say data is removed after 30 days.
   The automatic purge job is waiting for the DB session (`docs/database/PENDING_DB_CHANGES.md` → `deletion_requested_at`).
   Until then, once a week check Admin → deleted users older than 30 days and delete them permanently.
3. **Sign in with Apple token revoke.** Apple asks apps using Sign in with Apple to revoke Apple tokens when an
   account is deleted. Ybex never stores Apple tokens (only checks the sign-in once), so there is nothing to revoke —
   if a reviewer asks, reply with exactly that.
4. **"BETA" badges** on Explore UGC, Instant UGC and Ybex Eva (menus and landing page). Apple 2.2 says betas belong
   in TestFlight; a label alone is usually fine, but some reviewers flag it. **Decision for Ravi:** remove the BETA
   badges for the store builds? (UGC is a finished, locked flow.)
5. **Notification explainer has a "Not now" button.** Fine on Android. For a future native iPhone push screen,
   Apple prefers one button ("Continue") before its own popup. The current web screen doesn't appear in an iPhone
   App Store app (iPhone web views have no web push), so no change now.
6. **Apple 4.2 (minimum functionality).** An iPhone app that is "just the website" can be rejected. Ybex has
   offline screens, push (Android), Sign in with Apple and a full account system — mention these in Review Notes. A
   native push + share sheet in the iPhone app would make it safer.
7. **Google sign-in inside the iPhone app web view** must open in the system browser (see Part B, item 9),
   otherwise Google blocks it.
8. **TWA host + Play signing fingerprint** (Part B, Android item 11) — without them the Android app shows a URL bar.
9. **Illustrations with numbers** on the app's first screen (e.g. "84k followers", "₹46k earned") are design art.
   Fine for review; if a reviewer asks, they're sample illustrations.
10. **Payments during review.** With live Razorpay keys a reviewer who pays spends real money. The Review Notes ask
    them not to pay and point to the already-paid demo deal.

## Before you press "Submit" (both stores)

- [ ] All REQUIRED keys filled (`docs/setup/ENV_KEYS.md`), `DEMO_LOGIN` / `DEMO_SEED` / `RESEND_ALLOW_FALLBACK` empty,
      `NODE_ENV=production`, `PAYMENTS_TEST_MODE=false`, live Razorpay keys + webhook.
- [ ] `APPLE_CLIENT_ID` set and "Continue with Apple" tested on a real iPhone.
- [ ] Google sign-in tested on the website and inside both apps.
- [ ] Demo creator + brand accounts ready with passwords and sample data (Part C).
- [ ] Delete account tested end to end on a spare account (code email arrives; account can't log in after).
- [ ] `/privacy-policy`, `/info/terms`, `/info/refunds`, `/help`, `/delete-account` open in a private browser window.
- [ ] Maintenance mode OFF.
- [ ] Screenshots made from the demo accounts.


---

<!-- was OFFLINE_AND_APP_STORE.md -->

# Offline app (v333 + v334)

Why: Apple (App Store guideline 4.2, "minimum functionality") and Play reviewers open the app in airplane mode.
A web page that shows a browser error or spins forever reads as "just a website". Ybex opens like an installed
app with no internet: the screens you opened before show their last saved data, and the rest says calmly that
you're offline.

## What works offline

| Area | Offline behaviour | Where |
|---|---|---|
| App start | The whole app (every screen's files, fonts, icons, login pictures) is saved on the phone by the service worker. Any page link opens the saved app page. A signed-in phone paints the grey app page with placeholder cards from the first frame; the purple launch splash (Android `#7E00DC`) is unchanged. | `vite.config.js` (VitePWA `navigateFallback`, `globPatterns`, `maximumFileSizeToCacheInBytes` 6 MB, `cleanupOutdatedCaches`), `index.html` (`#yb-shell`) |
| Login session | Offline, the app opens at once with the saved login (no waiting for `/auth/me` to fail). Back online it is checked again. | `AuthContext.jsx` |
| Screens opened before | Show their last saved answer (same login only, wiped at logout): home, campaigns, UGC, inbox, notifications, earnings / payouts, refer, profile. Pill at the top: "You're offline · showing your last saved screens". | `lib/api.js`, `lib/apiSnapshot.js`, `OfflineBanner.jsx` |
| Screens never opened | One designed card, `OfflineState` — "You're offline", what still works, Try again. It loads by itself when the internet is back. Payment screens keep their card ("Your payments are safe") with offline wording. | `components/common/OfflineState.jsx`, `PaymentsRetryCard.jsx` |
| Static pages | Terms, Privacy, Refunds and the other `/info/*` pages are built into the app. In the installed app these links open inside the app while offline (the phone's browser can't load them offline). Help articles: the last list of each category is kept on the phone. | `lib/legal/legalContent.js`, `lib/externalLinks.js`, `pages/help/*` |
| Profile / Settings menus | Render from the saved user and saved profile (`/creators/:id`, `/brands/me`). | `lib/apiSnapshot.js` |
| Eva | Opens with her chats; a note says "Eva needs internet to reply". | `feedback/FeedbackBot.jsx` |
| Login screen | "Connect to the internet to sign in" card while offline. | `Login.jsx`, `AppContinue.jsx` (`OfflineSignInNotice`) |
| Actions (send, apply, pay, upload, save) | Never sent. `api.js` refuses every POST / PUT / PATCH / DELETE while offline with code `OFFLINE` and one calm grey toast: "You're offline — try again when you're back online". Payment: the Razorpay order is never created, so the Razorpay window never opens offline. | `lib/api.js`, `lib/offline.js` |
| Back online | Pill says "Back online"; screens on `useLiveRefresh` (and home, inbox, earnings) reload once quietly; offline cards reload by themselves. | `lib/liveRefresh.js`, `useBackOnline` in `lib/offline.js` |

Not frozen on purpose: dashboard banners / festive themes are always read fresh online.

Updates: a new version still waits for the "Refresh" toast (session 58, `registerType: 'prompt'`); old saved
files are removed only when the new version takes over.

## How to test (iPhone and Android)

1. Install the app (Android: Play Store / Chrome "Install app"; iPhone: Safari → Share → Add to Home Screen) and sign in.
2. With internet on, open a few screens: Home, Campaigns, UGC, Inbox, Notifications, Earnings, Profile, Help, Terms. Wait ~30 seconds the first time so the app finishes saving its files.
3. Close the app fully, turn on **airplane mode** (Wi-Fi off too).
4. Open the app: it should open straight to Home with your data and the "You're offline" pill.
5. Visit the screens from step 2 — they show their saved data. Open a screen you never visited — you see the "You're offline" card, not a spinner.
6. Tap an action (send a message, apply, Pay) — a grey "You're offline — try again when you're back online" toast; nothing is sent; Razorpay does not open.
7. Open Eva — the "Eva needs internet to reply" note. Log out and look at the login screen — "Connect to the internet to sign in".
8. Turn airplane mode off — the pill says "Back online" and the screen refreshes by itself.

Desktop check: Chrome DevTools → Application → Service Workers → "Offline" (or Network → Offline), then reload.

## Server down / updating (v364)

Ravi (21 Oct): "website band ki update ke liye toh app webapp ban gaya aur pura error show hone laga — database local
mai save hota rahe aur server wapas aaye toh real database mai save ho jaye".

The phone can have internet while the Ybex server is down (an AI Studio redeploy takes ~1 hour; meanwhile it answers
with its own HTML "unavailable" page or a 502/503/504). Before v364 that was treated as a normal answer: screens got an
HTML page instead of data, the login check could log people out, and every tap showed an error.

| What | Behaviour | Where |
|---|---|---|
| Detecting it | Down = an HTML page where `/api` JSON was expected, a gateway error (502/503/504/520–530) **without our JSON body**, or a network error while the phone is online and `/api/system-status` also fails. A real answer from our server (e.g. 503 `PAYMENTS_UNAVAILABLE`, JSON) is never treated as "down". Up = any good JSON answer. While down, `/api/system-status` is checked every 20 s (page visible only). Event `ybex:server` {down}. | `src/lib/serverStatus.js`, `src/lib/api.js` |
| Screens | Same as offline: last saved answer at once; nothing saved → the calm `OfflineState` card, now worded "Ybex is updating … it will load by itself when Ybex is back". Pill: "Ybex is updating · showing your last saved screens". | `api.js`, `OfflineState.jsx`, `OfflineBanner.jsx` |
| Login | Server down ≠ logged out: the saved login stays (an HTML / non-user answer to `/auth/me` keeps the saved user). Only a real 401/403 logs out. | `AuthContext.jsx` |
| Saves that wait on the phone | Offline **or** server down: `POST creators/profile`, `PATCH creators/me`, `POST brands/profile`, `POST db/own` (only brand_profiles / creator_profiles / creator_portfolio_items / creator_social_channels), `POST onboarding/progress`, `POST/PUT assist/settings`, notification read marks. The screen gets `{ ok: true, queued: true }` (202) and one toast "Saved on this phone — it will sync when Ybex is back". Pill shows "N changes waiting to sync". Whole-object saves keep only the newest copy. Max 50, per signed-in user, wiped on logout. | `src/lib/outbox.js` |
| Never queued | Money / payments, deals, chat, campaign apply / invite, UGC, KYC, OTP, sign-in / sign-up, uploads (files), push. Offline → "You're offline — try again when you're back online"; server down → "Ybex is updating right now — try again in a few minutes" (code `SERVER_DOWN`). Nothing is half-sent. Logout still works. | `api.js` |
| Sync | When the phone is online and the server answers (on `online`, when the 20 s check sees Ybex back, 3 s after start, every 30 s while items wait): oldest first, one at a time, the real request. 2xx → removed; 4xx → removed + toast "One change couldn't be saved: …"; network / 5xx → stops, tries later. Then "Synced ✓" in the pill and screens refresh (`ybex:data-changed`). | `api.js` `flushOutbox()` |

Note: a queued whole-profile save is sent as it was typed. If the same profile was changed on another device in
between, the phone's copy wins when it syncs (same as pressing Save later).

### How to test
1. Local: run the app, sign in, open Home / Profile / Inbox once. Stop the server (or in Chrome DevTools → Network →
   "Block request URL" `*/api/*`, or Request blocking `/api/`). Reload → screens open with saved data, the pill says
   "Ybex is updating"; you are still signed in.
2. Edit your bio → Save → toast "Saved on this phone…", pill "1 change waiting to sync". Try Pay / send a chat message →
   "Ybex is updating right now — try again in a few minutes", nothing sent.
3. Start the server again (unblock) → within ~20 s the pill turns green "Synced ✓"; the bio is on the server.
4. Live: during an AI Studio redeploy, open the installed app — same as above.


---

<!-- was INSTAGRAM_SETUP.md -->

# Instagram real data — setup (v349, Part A verified live 19 Oct — v351)

Code: `backend/instagramConnect.ts`, creator card `src/components/instagram/InstagramConnectCard.jsx`.
The card only appears once at least one part below is switched on (secrets set). Until then creators type numbers by hand, as before.

## Where the Fetch button shows (v352)
Under every Instagram username box: apply form, creator onboarding (desktop + mobile), Settings → Platforms,
mobile profile Instagram form, Admin → creator edit / waitlist edit, brand onboarding. Settings save live numbers;
the others only fill the boxes (`POST /api/instagram/preview`, rate-limited + 6 h cache).

## Username once → everything (v354)
- Typing a username anywhere (apply form, onboarding, settings, admin forms) fetches by itself after ~1 s with a
  "Fetching your Instagram data…" popup: followers, avg reach/views, likes, comments, engagement, the Instagram photo
  and the last 25 posts. Onboarding then skips the Instagram-numbers step.
- Photo: copied once into Supabase storage `avatars/ig/<username>.<ext>` (Instagram's own links expire). Used only
  when there is no photo, a Google/placeholder one, or our older Instagram copy. A photo the creator uploaded is never replaced.
- E-mail: Meta never gives an account's login e-mail. If the bio has an e-mail, the apply form fills it when the box is empty.
- Portfolio: onboarding last step + Profile → Portfolio → "Pick from Instagram" shows the last posts; captions with
  #ad / #collab / "paid partnership" / "use code" are marked "Collab" and shown first. Only the post link is saved.
- Refresh: used the app in the last day → daily; 1–7 days → every 3 days; longer / never logged in → every 10 days.
  All Meta calls share one budget (180 / hour) and a 6-hour cache per username.
- Admin → Users (All / Creators / Unclaimed) and Admin → Waitlist: **Fetch Instagram for everyone** — all creator
  profiles + pending waitlist; runs in the background, waits by itself when the hour's limit is used.
- If Meta refuses the extra post fields, the call repeats with the old field list (numbers keep working; picker empty).

## What creators get
1. **Username → numbers** (no login): followers, posts, avg likes / comments / reel views, engagement. Updates by itself every day.
   Works for **Creator / Business** Instagram accounts (free switch in Instagram settings). Personal accounts get a "switch to Creator" message.
2. **Prove it's yours** — two options, creator picks:
   - **DM code**: Ybex shows `YBX-482913`, creator DMs it to Ybex's Instagram → ticked "Verified" by itself.
   - **Log in with Instagram**: Instagram's own page (Ybex never sees the password) → verified + 28-day reach / views.
3. Synced numbers can't be typed over by hand. Changing the username drops the old verification.
4. Admin → Users → creator → **Refresh from Instagram** (and see verified / method).

## Ravi — one-time setup (≈ 30–45 min)
### A. Ybex's own Instagram (needed for 1 and the DM code)
1. Ybex Instagram → Settings → Account type → **Professional (Business)**.
2. Link it to a **Facebook Page** (Instagram → Edit profile → Page → connect / create "Ybex").
3. developers.facebook.com → **Create app** → type *Business* → add products **Instagram** (API setup with Facebook login) and **Webhooks**.
4. Graph API Explorer → app **Ybex** → permissions `pages_show_list, pages_read_engagement, instagram_basic,
   **instagram_manage_insights**, **ads_read**, business_management, instagram_manage_messages` → Generate token
   (tick YBEX MEDIA page + ybex.in). Without `instagram_manage_insights` + `ads_read` Business Discovery fails with
   "(#10) Application does not have permission" (Page is in Business Manager → ads_read needed).
5. Test: `17841480473392276?fields=business_discovery.username(bluebottle){username,followers_count,media_count}`
   → followers come back. (Watch the closing `}` — if it's cut you get code 2500 "Expected }".)
6. Never-expiring token: ⓘ → Open in Access Token Tool → **Extend Access Token** → put the long token in Explorer →
   `me/accounts?fields=name,access_token` → YBEX MEDIA's `access_token` = **Page token** (Debugger shows Type Page,
   Expires Never). "Data access expires" ~3 months renews while Ravi uses Facebook; if fetch stops, redo step 6
   (or later a Business Manager System User token).
7. AI Studio secrets: `IG_GRAPH_TOKEN` = Page token, `IG_BUSINESS_ID` = `17841480473392276` (ybex.in),
   `IG_GRAPH_VERSION` = `v26.0` (code default is v26.0 since v351). Works in Development mode — no App Review needed.

### B. DM code (needs A)
1. Webhooks → Instagram → Callback URL `https://ybexapp.ai.studio/api/webhooks/instagram`, Verify token = any long random text,
   subscribe to **messages**.
2. Secrets: `IG_WEBHOOK_VERIFY_TOKEN` (same text), `META_APP_SECRET` (App settings → Basic → App secret),
   `IG_DM_USERNAME` = Ybex's Instagram username (e.g. ybex.app). Optional `IG_MESSAGING_TOKEN` (Page token) if replies fail.
3. **Important:** until Meta **App Review** approves `instagram_manage_messages` (Advanced access), only people with a role on the app
   (you, testers added in App roles) get DMs delivered to the webhook. Submit App Review with a screen recording of the flow (1–4 weeks).

### C. Instagram Login (separate, optional)
1. Same app → Instagram → **API setup with Instagram login** → note Instagram App ID + secret.
2. Business login settings → Redirect URL `https://ybexapp.ai.studio/api/instagram/oauth/callback` (after the domain move: ybexmedia.in).
3. Secrets: `IG_APP_ID`, `IG_APP_SECRET`. Scopes used: `instagram_business_basic, instagram_business_manage_insights`.
4. Same App Review note: public creators can log in only after Advanced access is approved; testers work right away.

## Limits
- Meta allows ~200 calls / hour for Ybex's account → the daily refresh does max 60 creators an hour.
- No official API reads **personal** accounts (Meta shut that down in 2025). Anyone who "fetches any username" uses scrapers — against
  Instagram's rules and breaks often; not used here.


---

<!-- was LOCAL_TESTING.md -->

# Local testing on the Mac (v372) — no deploy, ~1 minute

Deploy + test = ~1 hour. Ab Mac pe hi poora app chalao, change karo, refresh karo.

## 1. Mac browser + iPhone Safari (sabse fast, Xcode nahi chahiye)
```bash
cd ~/Desktop/ybex-v372          # jahan zip unzip kiya
bash scripts/mac-local.sh       # ya: npm run local
```
- **First time:** packages install (~2 min) aur `.env` khulegi (`local.env` se — Supabase URL, public key aur local
  secrets pehle se bhare hain). Bas `SUPABASE_SERVICE_ROLE_KEY` paste karo (Cloud Run → Variables & Secrets).
  Eva = `GEMINI_API_KEY`, email OTP = `RESEND_API_KEY`, Instagram = `IG_GRAPH_TOKEN` + `IG_BUSINESS_ID` (optional).
  Save → script dobara chalao.
- Mac: **http://localhost:3000**
- iPhone (same Wi-Fi), Safari: **http://<Mac IP>:3000** — IP script print karta hai.
- Login: email → OTP code screen pe hi dikh jata hai (local only). Ya Creator / Brand Demo buttons.
- Code badla → page refresh. Band: `Ctrl+C`.
- Phone mobile view ke liye Mac Chrome mein `Cmd+Opt+I` → phone icon (iPhone 14 Pro size).

## 2. iPhone app, cable se (asli app, Mac ke screens ke saath)
Ek baar: `cd ios-app && bash scripts/mac-prepare.sh` → Xcode → App → Signing & Capabilities → Team select.
Phir har baar:
```bash
# Tab 1
bash scripts/mac-local.sh
# Tab 2 (iPhone cable se laga, unlocked)
bash scripts/ios-local.sh       # ya: npm run local:ios
```
- App phone pe install hoke Mac se screens kholti hai. Code badla → phone pe app band karke dobara kholo.
- Pehli baar iPhone pe: "find devices on local network" → **Allow**. "Untrusted Developer" →
  Settings → General → VPN & Device Management → Trust.
- Phone ka console / errors: Mac Safari → Develop → (tumhara iPhone) → localhost. (iPhone: Settings → Safari →
  Advanced → Web Inspector ON.)
- Wapas normal app (App Store jaisa): `bash scripts/ios-local.sh --off`

## Dhyan rakho
- **Data LIVE database ka hai** (same Supabase). Test account use karo, asli creators/brands ko kuch mat bhejo.
- Payments local pe hamesha Razorpay **test mode** mein.
- Google / Apple sign-in local pe nahi chalega (unka return address live domain hai) — email + OTP use karo.
- Instagram fetch, push notifications — same keys `.env` mein hon tabhi chalenge.
- `.env` kabhi zip / git mein mat daalna.


---

# YBEX_ENV template (was YBEX_ENV_template.txt)

```
# ═══════════════════════════════════════════════════════════════════════════════════════════════════════
# YBEX_ENV — ONE secret for every setting (v376). AI Studio → Secrets → add ONE secret named  YBEX_ENV
# and paste this whole block as its value, with your real values filled in after each "=".
#  • No quotes needed. One setting per line. Lines starting with # are notes and are skipped.
#  • Leave a value empty if you don't use that feature. Never put this file with values on GitHub / WhatsApp.
#  • A secret you still have set separately in AI Studio wins over the same name here (so old secrets keep working —
#    you can delete them one by one once YBEX_ENV is in).
#  • GEMINI_API_KEY is given by AI Studio itself — you don't need it here.
# ═══════════════════════════════════════════════════════════════════════════════════════════════════════

# ── Supabase (REQUIRED) — Supabase → Project settings → API ──
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# ── Addresses ── (APP_URL stays the AI Studio address while Google sign-in's redirect is set to it)
APP_URL=https://ybexapp.ai.studio
SITE_URL=https://ybexmedia.in
VITE_PUBLIC_SITE_URL=https://ybexmedia.in

# ── Cloudflare proxy (REQUIRED for ybexmedia.in) — same value as in the Cloudflare Worker ──
PROXY_SHARED_SECRET=

# ── Server secrets (REQUIRED) — long random strings, keep the SAME forever ──
SESSION_SECRET=
OAUTH_STATE_SECRET=
MEDIA_KEY_SECRET=
EMAIL_LINK_SECRET=
CRON_SECRET=
NODE_ENV=production

# ── Email — Resend (REQUIRED) ──
RESEND_API_KEY=
RESEND_FROM_EMAIL=Ybex <noreply@ybexmedia.in>
ADMIN_EMAIL=
ADMIN_ALERT_EMAIL=

# ── Razorpay (REQUIRED) — Dashboard → Settings → API keys (LIVE) / Webhooks ──
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
PAYMENTS_TEST_MODE=false

# ── Google sign-in — Google Cloud → APIs & Services → Credentials → OAuth client ──
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── Apple sign-in (iPhone) ──
APPLE_CLIENT_ID=

# ── Phone push (website / PWA) — VAPID keys, keep the same forever ──
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@ybexmedia.in

# ── Instagram fetch (followers / reach) — Meta ──
IG_GRAPH_TOKEN=
IG_BUSINESS_ID=
IG_APP_ID=
IG_APP_SECRET=
META_APP_SECRET=
IG_WEBHOOK_VERIFY_TOKEN=
IG_DM_USERNAME=
IG_MESSAGING_TOKEN=
IG_TOKEN_KEY=

# ── Android app push (Firebase) — whole service-account JSON on ONE line ──
FCM_SERVICE_ACCOUNT_JSON=

# ── iPhone app push (Apple) ──
APNS_KEY=
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_BUNDLE_ID=com.ybex.app
APNS_PRODUCTION=true

# ── WhatsApp reminders (optional) ──
WHATSAPP_API_KEY=
WHATSAPP_PHONE_NUMBER_ID=

# ── SMS sign-in codes (optional — needs DLT; leave empty for now) ──
FAST2SMS_API_KEY=
FAST2SMS_OTP_ID=
FAST2SMS_OTP_CHANNEL=whatsapp
MSG91_AUTH_KEY=
MSG91_OTP_TEMPLATE_ID=

# ── Optional / admin ──
ADMIN_QUICK_PIN=
CORS_ORIGINS=
ASSIST_MODEL=
ASSIST_DAILY_LIMIT=
BROADCAST_DAILY_LIMIT=

# ── MUST stay empty / off on the live site ──
DEMO_LOGIN=
DEMO_SEED=
OTP_ECHO=off
RESEND_ALLOW_FALLBACK=
SEO_NOINDEX=

```
