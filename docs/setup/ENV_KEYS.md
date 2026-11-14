> **v376: use ONE secret.** AI Studio now asks only for `YBEX_ENV` (`.env.example` lists just that). Fill in
> `docs/setup/SETUP_GUIDES.md (YBEX_ENV template part)` and paste the whole block as the value of the `YBEX_ENV` secret. The notes below
> still explain what each setting is for.

# Ybex — every setting ("env key"), what it does, where to get it

Written for Ravi (v334). Simple steps. The full list with empty values is in `.env.example` in the project.

## Why the hosting tool asked for only a few keys before

The hosting tool (AI Studio / Cloud Run) builds its "Secrets / Environment" form by reading the file
`.env.example`. **Before v334 that file did not exist**, so the tool only knew about `GEMINI_API_KEY` and asked for
that one alone. Everything else had been typed in by hand earlier (or was missing). Now `.env.example` lists every
key the app reads, so the tool will ask for all of them. Fill them in once; they stay between deploys.

How to read this page:

- **REQUIRED** = the app breaks, or a main feature (login emails, payments, Eva) is off without it.
- **Optional** = nice to have; the app works without it.
- **Must stay EMPTY / off in production** = only for testing. Filling it on the live app is a security problem.
- Keys starting with `VITE_` are put into the website **when it is built**. After changing one, deploy again.
- Never share these values in chat, screenshots or GitHub. If one leaks, make a new one and replace it.

---

## 1. Core (REQUIRED)

| Key | What it does | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Address of your Supabase database. | Supabase → your project → **Project Settings → API** (or **Data API**) → "Project URL". Looks like `https://abcd1234.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server's master key to the database. **Secret** — server only. | Same page → **API Keys** → `service_role` key (click "Reveal"). In the newer dashboard it's under "Secret keys" / "Legacy API keys → service_role". |
| `SUPABASE_ANON_KEY` | Public key (safe in the browser, limited by database rules). | Same page → `anon` / "publishable" key. |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL`, for the website build. | Copy the same value. |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY`, for the website build. | Copy the same value. |
| `APP_URL` | Public address of the app, **no `/` at the end**. Used in emails, payment pages, Google/Apple sign-in. | Today `https://ybexapp.ai.studio`; `https://ybexmedia.in` once that domain opens the app (v337). |
| `SITE_URL` | Same address, used for blog / SEO links. | Same as `APP_URL` |
| `VITE_PUBLIC_SITE_URL` | Same address, used for share links inside the website. | Same as `APP_URL` |
| `VITE_API_ORIGIN` | Server the iPhone app talks to. Leave empty (= `https://ybexapp.ai.studio`). Set to `https://ybexmedia.in` only after the domain works — iPhones follow by live update. | — |
| `SESSION_SECRET` | Signs login data. | Any password generator → 40+ random characters. Keep it the same forever. |
| `OAUTH_STATE_SECRET` | Protects Google / Apple sign-in from fake return links. | Another 40+ random characters (different from the one above). |
| `MEDIA_KEY_SECRET` | Makes private file links (drafts, KYC files) that expire. | Another 40+ random characters. |
| `EMAIL_LINK_SECRET` | Signs "one-click" links inside emails (unsubscribe etc.). | Another 40+ random characters. |
| `CRON_SECRET` | Password for the timed jobs (see "Timed jobs" below). | Another 40+ random characters. |
| `NODE_ENV` | Tells the server it is the live app. | Exactly `production`. |

> Random characters: use a password manager (Bitwarden, 1Password, Google Password Manager → "suggest strong
> password") and copy 40+ characters. Don't reuse the same value for two keys.

**Timed jobs (uses `CRON_SECRET`).** UGC deadline reminders / auto-expiry, onboarding reminders and the email queue
run only when something calls them. In Google Cloud → **Cloud Scheduler → Create job**:

| Job | Schedule | Target (HTTP POST) | Header |
|---|---|---|---|
| UGC deadlines | `*/15 * * * *` | `https://ybexmedia.in/api/internal/cron/ugc-deadlines` | `x-cron-secret: <CRON_SECRET>` |
| Onboarding reminders | daily 10:00 IST (`30 4 * * *` in UTC, or pick time zone Asia/Kolkata and use `0 10 * * *`) | `https://ybexmedia.in/api/internal/cron/onboarding-reminders` | same |
| Email queue | hourly (`0 * * * *`) | `https://ybexmedia.in/api/internal/cron/email-queue` | same |

Press **Force run** once on each to test (it should answer 200, not 401).

## 2. Ybex Eva (REQUIRED for Eva; also used for AI brief / agreement text)

| Key | What it does | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | Google's AI for Eva and AI text helpers. | **aistudio.google.com → Get API key → Create API key**. Turn on billing in Google Cloud for that project, or it will hit the free limit quickly. |
| `ASSIST_MODEL` | Optional. Which Gemini model Eva uses. | Leave empty (the app picks a good default). |
| `ASSIST_DAILY_LIMIT` | Optional. Eva messages per user per day. | Leave empty = 30. |

## 3. Email — Resend (REQUIRED: OTP codes, payouts, notices)

| Key | What it does | Where to get it |
|---|---|---|
| `RESEND_API_KEY` | Sends every email (login codes, agreements, payouts). | **resend.com → API Keys → Create API Key** (permission: "Sending access"). |
| `RESEND_FROM_EMAIL` | The "From" name and address. | `Ybex <no-reply@ybexmedia.in>` — the domain must be verified (below). |
| `ADMIN_EMAIL` | Admin alerts (new signups, KYC, payouts due). | Your admin inbox. |
| `ADMIN_ALERT_EMAIL` | Optional. Urgent UGC deadline alerts (falls back to `ADMIN_EMAIL`). | Same or another inbox. |
| `BROADCAST_DAILY_LIMIT` | Optional. Max admin broadcast emails a day. | Leave empty = 80. Raise only after your Resend plan allows it. |
| `RESEND_ALLOW_FALLBACK` | Testing only: a failed email doesn't stop sign-up. | **Must stay EMPTY in production.** |

**Verify the domain in Resend (one time):**
1. resend.com → **Domains → Add Domain** → `ybexmedia.in` → region close to India (e.g. Mumbai/Singapore if offered).
2. Resend shows 3–4 DNS records (TXT for SPF, TXT/CNAME for DKIM, optional MX for bounces).
3. Open your domain company's DNS page (GoDaddy / Hostinger / Cloudflare …) → add each record **exactly** as shown.
4. Back in Resend press **Verify**. It can take from 5 minutes to a few hours. Status must be "Verified".
5. Also add a DMARC record (TXT on `_dmarc.ybexmedia.in`, value `v=DMARC1; p=none; rua=mailto:admin@ybexmedia.in`) so Gmail trusts the mails.
6. **Sign in with Apple users** who choose "Hide My Email" get an `@privaterelay.appleid.com` address. To reach them:
   Apple Developer → **Certificates, Identifiers & Profiles → Services → Sign in with Apple for Email Communication →
   Configure** → add `ybexmedia.in` and `no-reply@ybexmedia.in`. Without this, their OTP emails bounce.

## 4. Payments — Razorpay (REQUIRED)

| Key | What it does | Where to get it |
|---|---|---|
| `RAZORPAY_KEY_ID` | Public id of your Razorpay account. Live keys start with `rzp_live_`. | Razorpay Dashboard → switch to **Live mode** (top) → **Account & Settings → API Keys → Generate Key**. |
| `RAZORPAY_KEY_SECRET` | Secret half of the key. Shown **once** — save it straight away. | Same screen. |
| `RAZORPAY_WEBHOOK_SECRET` | Lets Razorpay tell Ybex "payment done" even if the person closed the app. | See steps below. |
| `PAYMENTS_TEST_MODE` | `false` = real money. | Exactly `false` in production. (With a `rzp_live_` key the server ignores `true` anyway.) |

**Webhook steps:** Razorpay Dashboard (Live mode) → **Account & Settings → Webhooks → Add New Webhook** →
- Webhook URL: `https://ybexmedia.in/api/payments/razorpay/webhook`
- Secret: type a new 30+ character random value → copy the **same value** into `RAZORPAY_WEBHOOK_SECRET`
- Active events: `payment.captured` and `order.paid` → **Create Webhook**.

Live mode needs your Razorpay KYC/activation to be complete. Test keys (`rzp_test_…`) never move real money.

## 5. Sign in with Google (optional, but shown on the login screens)

| Key | What it does | Where to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Identifies Ybex to Google. | Steps below. |
| `GOOGLE_CLIENT_SECRET` | Secret half. | Same screen. |

1. **console.cloud.google.com** → pick (or create) the Ybex project.
2. **APIs & Services → OAuth consent screen** → External → app name "Ybex", support email, logo, app domain
   `ybexmedia.in`, privacy link `https://ybexmedia.in/privacy-policy`, terms link `https://ybexmedia.in/info/terms` →
   scopes: `openid`, `email`, `profile` → **Publish app** (so anyone, not only test users, can sign in).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.**
4. **Authorised JavaScript origins:** `https://ybexmedia.in`
5. **Authorised redirect URIs** — add **both** (the website and the app use different ones):
   - `https://ybexmedia.in/api/auth/oauth/google/callback`
   - `https://ybexmedia.in/api/auth/google/callback`
6. Create → copy Client ID and Client secret into the two keys.

If these are empty, "Continue with Google" shows "Google sign-in is not set up yet. Please use your email."

## 6. Sign in with Apple (REQUIRED before the iPhone App Store launch)

Apple's rule 4.8: an iPhone app that offers Google sign-in must also offer Sign in with Apple. The app already shows
the black "Continue with Apple" button on iPhone/iPad. It needs one key:

| Key | What it does | Where to get it |
|---|---|---|
| `APPLE_CLIENT_ID` | Your Apple **Services ID** (e.g. `in.ybexmedia.signin`). | Steps below. |

1. **developer.apple.com → Account → Certificates, Identifiers & Profiles → Identifiers.**
2. Make sure your **App ID** (the iPhone app's bundle id, e.g. `in.ybexmedia.app`) has **Sign in with Apple** ticked.
3. **+ → Services IDs → Continue** → Description "Ybex web sign-in", Identifier `in.ybexmedia.signin` → Register.
4. Open that Services ID → tick **Sign in with Apple → Configure**:
   - Primary App ID: your Ybex App ID
   - Domains and Subdomains: `ybexmedia.in`
   - Return URLs: `https://ybexmedia.in/api/auth/oauth/apple/callback`
   → Next → Done → **Save**.
5. Put `in.ybexmedia.signin` (your Services ID text) into `APPLE_CLIENT_ID`. No private key is needed — the server
   checks Apple's answer with Apple's public keys.
6. Do the "Hide My Email" step from section 3 (point 6).

If `APPLE_CLIENT_ID` is empty the button shows a calm "Apple sign-in is not set up yet. Please use your email or
Google for now." — nothing breaks, but **Apple will reject the iPhone app** if the button doesn't work during review.

## 7. Phone push notifications (optional, recommended)

| Key | What it does | Where to get it |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Public half of the push key pair. | Run once on any computer with Node.js: `npx web-push generate-vapid-keys` — it prints "Public Key" and "Private Key". |
| `VAPID_PRIVATE_KEY` | Private half. **Secret.** | Same command. |
| `VAPID_SUBJECT` | Contact for push services. | `mailto:support@ybexmedia.in` |

Generate **once** and keep them forever. New keys = every phone must allow notifications again.

## 8. WhatsApp reminders (optional)

| Key | What it does | Where to get it |
|---|---|---|
| `WHATSAPP_API_KEY` | Meta WhatsApp Cloud API access token (UGC deadline reminders). | developers.facebook.com → your app → **WhatsApp → API Setup** → make a **permanent** token with a System User in Meta Business Settings (the temporary one expires in 24 h). |
| `WHATSAPP_PHONE_NUMBER_ID` | Which WhatsApp number sends. | Same page → "Phone number ID". |

Old names `META_WA_API_KEY` / `META_WA_PHONE_ID` also work, but use the new ones.

## 9. Optional / admin

| Key | What it does | Notes |
|---|---|---|
| `ADMIN_QUICK_PIN` | Turns on the hidden quick admin entry `/admin/ybx` (off unless 6+ characters). | Leave **empty** in production unless you really need it; if used, pick 12+ characters. |
| `CORS_ORIGINS` | Extra websites allowed to call the API, comma separated. | Usually empty. Add e.g. `capacitor://localhost` only if the iPhone app is built as a Capacitor app that loads local files. |
| `VITE_PLAY_STORE_URL` | Where the "Get the app" button sends Android users. | After Play approval: `https://play.google.com/store/apps/details?id=com.ybex.app`. Rebuild after setting. |
| `VITE_APP_VERSION` | Version label shown in Eva bug reports. | e.g. `v334`. |

Set automatically by the host — don't add: `PORT`, `K_SERVICE`, `K_REVISION`. Old alias `SUPABASE_SERVICE_KEY`
still works but use `SUPABASE_SERVICE_ROLE_KEY`.

## 10. Must stay OFF / EMPTY in production

| Key | Production value | Why |
|---|---|---|
| `DEMO_LOGIN` | empty (or `false`) | `true` shows "Direct Bypass Login" buttons that log anyone in as creator / brand / **admin**. |
| `DEMO_SEED` | empty | `true` fills new accounts with fake sample deals. |
| `OTP_ECHO` | `off` | Otherwise a non-production server shows login codes on screen. |
| `RESEND_ALLOW_FALLBACK` | empty | Otherwise sign-up continues even when the code email failed. |
| `PAYMENTS_TEST_MODE` | `false` | `true` = fake payments. |
| `SEO_NOINDEX` | empty | `1` hides the whole site from Google. |
| `YBEX_SYNC_BLOB` | empty | Old sync method, slow; off on purpose. |
| `NODE_ENV` | `production` | Anything else turns on test helpers. |

**Store reviewers:** don't turn `DEMO_LOGIN` on for them. Make real reviewer accounts with a password instead
(see `docs/setup/SETUP_GUIDES.md`).

## Quick check after filling everything

1. Open `https://ybexmedia.in/login` → sign up with a new email → the code arrives (Resend OK).
2. Continue with Google works on a computer; Continue with Apple works on an iPhone.
3. A brand pays a small test deal with a real card/UPI → payment shows as held (Razorpay + webhook OK).
4. Ybex Eva answers a question (Gemini OK).
5. Allow notifications on the Android app → send yourself a test from Admin → arrives (VAPID OK).


## iPhone App Store app (v336)

| Key | Needed? | What it does / where to get it |
|---|---|---|
| `APNS_KEY` | For iPhone app notifications | developer.apple.com → Certificates, IDs & Profiles → **Keys** → "+" → tick **Apple Push Notifications service (APNs)** → Continue → Register → **Download** the `.p8` file (Apple lets you download it only once). Open it in a text editor and paste the whole text, including the BEGIN/END lines. |
| `APNS_KEY_ID` | Same | The 10-character Key ID shown next to that key. |
| `APNS_TEAM_ID` | Same | developer.apple.com → **Membership** → Team ID. |
| `APNS_BUNDLE_ID` | Optional | `com.ybex.app` (default). Must match the app's Bundle ID in Xcode. |
| `APNS_PRODUCTION` | Optional | `true` (default) for App Store and TestFlight. `false` only while testing a build run straight from Xcode. |
| `IOS_OTA_OFF` | Optional | `true` stops sending new web builds to the iPhone app (live update). Leave empty normally. |
| `IOS_OTA_MIN_BUILD` | Optional | Only App Store versions at least this (e.g. `1.0.3`) get new web builds. Use it when a web change needs a newer app from the App Store. |
| `FCM_SERVICE_ACCOUNT_JSON` | Optional (Android app push) | v364: the service-account key JSON from Firebase (Project settings → Service accounts → Generate new private key). Paste the whole JSON (or base64 of it). Without it the Android app works but gets no phone notifications. Secret — never share. |
| `ANDROID_OTA_OFF` | Optional | v364: `true` stops sending new web builds to the Android app (live update). Leave empty normally. |
| `ANDROID_OTA_MIN_BUILD` | Optional | v364: only Play versions at least this (e.g. `1.0.5`) get new web builds. Use it when a web change needs a newer app from the Play Store. |

Web push keys (`VAPID_*`) are still needed for the website, the Android app and the iPhone Home Screen app.


## v349 — Instagram (all optional; see docs/setup/SETUP_GUIDES.md)
- IG_GRAPH_TOKEN, IG_BUSINESS_ID — username → numbers (Business Discovery) + daily refresh.
- IG_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, IG_DM_USERNAME, (IG_MESSAGING_TOKEN) — DM code verification.
- IG_APP_ID, IG_APP_SECRET — Log in with Instagram. Optional IG_TOKEN_KEY (encrypts saved tokens), IG_GRAPH_VERSION (default v26.0).
