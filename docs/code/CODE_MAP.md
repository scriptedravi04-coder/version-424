# Ybex — where the code lives (Session 49)

## Quick map (v334 clean-up — read this first)

**Front end (the app people use)** — React + Vite, starts at `src/index.jsx` → `src/App.jsx` (all page links).
- Pages: `src/pages/<area>/` (`brand`, `creator`, `admin`, `campaigns`, `collabs`, `ugc`, `onboarding`, `auth`, `help`, `legal`, `blog`, `dashboard`, `kyc`, `profile`, `app`).
- Pieces of pages: `src/components/<feature>/` (chat, campaigns, ugc, payments, profile, admin, assist = Eva, feedback, layout, common, …). `src/components/ui/` keeps only the library parts the app really uses (button, calendar, popover, autocomplete, date picker, number input).
- Helpers: `src/lib/` (API client `api.js`, Razorpay, offline, links), `src/utils/` (money maths, formatting, deal / UGC rules), `src/hooks/`, `src/contexts/`, `src/store/`.

**Back end (the server)** — Express + Supabase. `server.ts` (root) only starts `backend/server.ts`, which sets up every route file.
- Login / account: `auth_routes.ts`, `oauth_routes.ts`, `session_routes.ts`, `account_routes.ts`
- Campaigns: `campaigns_routes.ts`, `campaign_lifecycle.ts`, `campaignManage.ts`, `campaignGuards.ts`, `campaignRefunds.ts`
- Deals + chat + contract: `deals_routes.ts`, `deals_chat_routes.ts`, `chat_routes.ts`, `content_submissions_routes.ts`, `dealFlow.ts`, `agreementRecord.ts`, `signTokens.ts`
- UGC orders: `ugc_routes.ts`, `ugcSlots.ts`, `ugcOrderStage.ts`, `ugcGuards.ts`, `services/ugcLifecycleService.ts`, `services/ugcDeadlineService.ts`
- Money: `payment_routes.ts`, `razorpayWebhook.ts`, `services/escrowService.ts`, `briefPayment.ts`, `refunds.ts`, `creatorPayoutRequests.ts`, `brandPayments.ts`, `adminMoney.ts`, `feeOffer.ts`, `stampedFee.ts`
- Creators / brands / invites: `creators_routes.ts`, `brands_routes.ts`, `public_creator_routes.ts`, `directInvites.ts`, `creatorKyc.ts`
- Admin: `admin_*_routes.ts` (one per admin area)
- Eva (assistant): `assist_routes.ts`, `assist_store.ts`; other: `blog_routes.ts`, `promo_routes.ts`, `push_routes.ts`, `support_routes.ts`, `feedback_routes.ts`, `media_routes.ts`, `misc_routes.ts`, `whats_new_routes.ts`

**How the money / deal / UGC flows are organised**
- Campaign, UGC and Invite-to-campaign are LOCKED (AGENTS.md). Their logic files are listed in
  `scripts/protectedFlows.mjs` → `LOGIC_FILES` and must not change by one character; their screens are in `SCREEN_GROUPS`
  (design may change, server calls may not). `backend/protectedFlows.test.ts` checks both.
- A deal goes: offer → negotiation → contract (OTP signing) → payment held (Razorpay) → content submitted → brand approves →
  payout. Server side in `dealFlow.ts` + the deals / chat / payment route files; browser side in
  `src/components/chat/` (`dealState.js`, `chatFlowState.js`, `mobile/useChatThreadMobile.js`) and `src/utils/dealFlow.js`.
- UGC: brand posts a brief and pays → creators take slots → submit video → brand approves → payout. Cancels never refund
  through Razorpay (docs/code/ARCHITECTURE.md rules 51–52).

**Tests** — next to the code they check: `backend/*.test.ts` (server + "this text must stay" safety checks) and
`src/**/*.test.js(x)` (screens and helpers). Many tests read source files word for word: never edit a test to make it pass.

**Commands**
- `npm run dev` — start locally · `npm run build` — build app + server into `dist/` · `npm start` — run the build
- `npm run verify` — type check + crash check + all tests (run before every deploy)
- `npm run protect:check` — only the locked-flow check. `npm run protect:update` is for Ravi only.

**Settings / keys** — copy `.env.example` to `.env`; every key is explained in `docs/setup/ENV_KEYS.md`. `db_mock.json` is the
local fallback data file the server reads when Supabase is not connected — keep it.

**Docs** — `docs/code/ARCHITECTURE.md` (rules, protected changes), `AGENTS.md` (rules for AI tools), `docs/database/PENDING_DB_CHANGES.md`
(database work waiting for the DB session), newest session summary in the root (`docs/sessions/SESSIONS_21_to_57.md (Session 58 part)`), older ones in
`docs/sessions/`, SQL files in `scripts/sql/`.


A short map so anyone (person or AI tool) can find a feature without opening 2,000-line files.

## Top level
| Path | What |
|---|---|
| `server.ts` | 4-line starter → `backend/server.ts` |
| `backend/` | the API. One file per area: `auth_routes.ts`, `ugc_routes.ts`, `payment_routes.ts`, `promo_routes.ts`, `admin_*_routes.ts`, … Shared helpers sit next to them (`dealFlow.ts`, `ugcSlots.ts`, …); long jobs in `backend/services/`. |
| `src/pages/` | one folder per role / area: `app` (login), `brand`, `creator`, `admin`, `campaigns`, `collabs`, `ugc`, `onboarding`, `auth`, `help`, `legal`, `blog` |
| `src/components/` | pieces used by pages, grouped by feature: `admin`, `chat`, `payments`, `profile`, `campaigns`, `ugc`, `referral`, `promo`, `feedback`, `account`, `kyc`, `layout`, `common`, `ui` (library parts) … |
| `src/lib/`, `src/utils/` | small helpers (API client, formatting, rules) |
| `docs/` | all notes — index in `docs/README.md` (`setup/`, `code/`, `database/`, `sessions/` (21–57 merged in SESSIONS_21_to_57.md)) |
| `cloudflare/` | Worker that serves ybexmedia.in from ybexapp.ai.studio (v337) |
| `ios-app/`, `android-overrides/` | iPhone (Capacitor) and Android (Play) store builds |
| `scripts/` | build / brand / safety scripts (`protectedFlows.mjs`, `check-crashes.mjs`) |

## Big pages are split into section files (Session 49)
Each section file gets everything it needs as props from its page — no logic, text or server call moved.

| Page | Section folder |
|---|---|
| `src/pages/creator/CreatorMobileProfile.jsx` (phone profile + its screens) | `src/pages/creator/profileScreens/` — `PlatformsScreen`, `HelpScreen`, `RatesScreen`, `PortfolioScreen`, `SessionsScreen`, `LegalScreen`, `portfolioLinkInfo.js`; `parts/` — `LanguagesField`, `ContactVerificationSection`, `InstagramStatsForm`, `KycIdentitySection`, `KycPayoutSection` |
| `src/pages/brand/BrandHomeMobile.jsx` | `src/pages/brand/brandHome/` — `BrandHomeActions`, `ActiveBriefsCarousel`, `CampaignTemplatesRow`, `CampaignManagerCard`, `BrandsGrowingStrip`, `ScheduleCallModal` |
| `src/pages/creator/CreatorHomeMobile.jsx` | `src/pages/creator/creatorHome/UgcLiveTimerCard` (+ shared `components/dashboard/MeetCreatorsGrid`) |
| `src/pages/creator/CreatorSettings.jsx` (desktop settings) | `src/pages/creator/settingsDesktop/` — `PlatformsPanel`, `PastBrandsCard`, `PortfolioList`, `KycPanel` |
| `src/components/admin/PlatformTools.jsx` | `src/components/admin/platformTools/` — `BroadcastEmailCard`, `MaintenanceCard`, `FeesSettingsCard`, `CouponList` |
| `src/components/admin/UserEnforcementPanel.jsx` | `src/components/admin/userEnforcement/` — `BasicDetailsCard`, `KycHighlightsCard`, `PayoutHighlightsCard`, `ActivityTimelineCard`, `LegalKycGrid`, `UploadedDocumentsCard`, `PayoutMethodsCard`, `EscrowLedgerCard` |
| brand phone profile | already split: `src/components/profile/mobile/brand/*Screen.jsx` |

Parts that old tests read word-for-word (for example the creator profile's edit screen, the KYC header, the Instagram
YouTube rows, the home headers and quick bars) stay in their page file on purpose.

## Locked flow screens — split too (v300, Ravi OK)
Only sections with **no server call** were moved, so each screen still makes exactly the same calls (protected check unchanged).

| Screen | Section folder |
|---|---|
| `src/components/chat/ChatBox.jsx` (desktop chat) | `src/components/chat/chatBox/` |
| `src/components/chat/SystemMessage.jsx` | `src/components/chat/systemMessage/` |
| `src/components/campaigns/mobile/MobileCampaignCreate.jsx` | `src/components/campaigns/mobile/campaignCreate/` |
| `src/pages/brand/BrandUGCMobile.jsx` | `src/pages/brand/brandUgc/` |
| `src/pages/creator/CreatorUGCMobile.jsx` | `src/pages/creator/creatorUgc/` |
| `src/pages/creator/ManageUGCOrdersView.jsx` | `src/pages/creator/manageUgc/` |
| `src/pages/brand/BrandUGCOrders.jsx` | `src/pages/brand/brandUgcOrders/` |

## Not split on purpose (backend money / UGC / server logic)
`backend/ugc_routes.ts`, `backend/server.ts`, `backend/payment_routes.ts`, `backend/campaign_lifecycle.ts`,
`backend/creators_routes.ts`. Dozens of safety tests read the exact text of these files (for example "every POST route
here checks the login", "recordAgreementSignature appears exactly twice"). Moving code out would hide it from those
checks or make them fail, and the project rule is never to edit those tests to make a change pass. Splitting them is a
job for a session where the tests run, with the tests moved together with the code and Ravi approving each file.

## Ybex Assist for brands (v301)
| What | Where |
|---|---|
| The bot (chat UI, all roles) | `src/components/feedback/FeedbackBot.jsx` — brands get the assistant, everyone keeps bug / idea reports |
| Brand brain (rules, maths, Hinglish) | `src/components/assist/brand/brandLogic.js` (pure, tested in `brandAssist.test.js`) |
| What to do with a message | `src/components/assist/brand/brain.js` |
| Data + drafts (existing calls only) | `src/components/assist/brand/tools.js` |
| Cards in the chat | `src/components/assist/brand/AssistCards.jsx` |
| AI route (Gemini, 30/day, brands only) | `backend/assist_routes.ts` → `POST /assist/ai` |
| Chat history + saved searches (phone side) | `src/components/assist/brand/memory.js` |
| Chat history, shared daily count, saved searches, 30-min new-creator push job | `backend/assist_store.ts` + `setupAssistDataRoutes` in `backend/assist_routes.ts`; tables in `scripts/sql/session52_assist.sql` |
| Saved creators + brand reviews (tables) | `backend/persistedLists.ts` (used by `creators_routes.ts` and `server.ts`) |

## Rule for new work
A new screen or a new section of a page goes in its own file in the page's section folder above. Keep page files as
the "wiring": state, data loading and which section shows.

## Session 53 (v303)
| What | Where |
|---|---|
| Eva (the green bot) — "How can I help?", top bar "Ybex Eva · BETA", ☰ menu (new / earlier chats) | `src/components/feedback/FeedbackBot.jsx` |
| Eva's chats on the server | `backend/assist_store.ts` (`listChats`, `history(brand, chat)`), `GET /assist/chats`, `src/components/assist/brand/memory.js` |
| Creator results in Eva ("Meet our creators" style) | `CreatorTile` / `Creators` in `src/components/assist/brand/AssistCards.jsx` |
| Admin → System Reports → User Reports tab | `src/components/admin/SystemReports.jsx` |
| Launch security guards (test) | `backend/session53Launch.test.ts` |

## Session 54 (v304) — Eva for creators
| What | Where |
|---|---|
| Creator brain (pure: intents, matching, rate, profile score, earnings, due, writing helpers) | `src/components/assist/creator/creatorLogic.js` (tested in `creatorAssist.test.js`) |
| What to do with a creator's message | `src/components/assist/creator/brain.js` |
| Data + the one send (campaign apply) | `src/components/assist/creator/tools.js` |
| Creator cards (opportunities + apply, profile, rate, earnings, brief, ideas, refer, share card…) | `src/components/assist/creator/CreatorCards.jsx` |
| Chat (both roles; loads brand or creator module) | `src/components/feedback/FeedbackBot.jsx` (`usesEva`, `CREATOR_CHIPS`) |
| Server: creator AI tasks, `GET /assist/creator/insights`, new-work alerts job | `backend/assist_routes.ts`, `backend/assist_store.ts` (`matchWork`, `buildInsights`) |

## Session 55 (v305) — landing page
- `src/pages/dashboard/Landing.jsx` — the website landing (phone first, app UI, only true content).
- `src/hooks/usePWAInstall.js` — one shared install popup, 8 s limit, returns accepted / dismissed / failed.
- `src/components/install/InstallAppButton.jsx` — Install button / bar; guide when the popup fails; `VITE_PLAY_STORE_URL`.
- `src/lib/externalLinks.js` — installed app: policy/help links open in Chrome (set up in `src/index.jsx`).
- UI rule: docs/code/ARCHITECTURE.md → "UI consistency (rule 87)".

## Session 56 (v306) — payment audit
- `backend/razorpayWebhook.ts` — webhook signature check + "which deal was paid" (route in `payment_routes.ts`).
- `backend/adminMoney.ts` — RELEASED (brand approved) is not "paid out"; refund-in-progress / not-funded blocks.
- `backend/paymentTestMode.ts` — live key = never test mode.
- `src/lib/razorpay.js` — resolves only when the payment window is done; ALREADY_PAID = success.
- `src/lib/briefPaymentRetry.js` — pending brief order recovery, tied to the user.

## Session 57 (v308) — Money screens (Ravi's design)
- `backend/creatorPayoutRequests.ts` — `POST /creator/payout-request-ready` (request all approved money).
- `backend/brandPayments.ts` — `GET /brand/payments-overview` (brand Payments list, refunds, summary).
- Screens: `CreatorEarningsMobile.jsx`, `BrandPaymentsMobile.jsx`, `ReferralHub.jsx` (creator + brand), `brand/ReferScreen.jsx`, `chat/mobile/MobileEscrowSheet.jsx`.

## Safety: report + block (v334 / v337)
- `src/components/safety/ReportUserLink.jsx` — "Report this profile" → POST /reports.
- `src/components/safety/BlockUserButton.jsx` — Block / Unblock (profiles + chat ☰ menu) and `BlockedPeopleList`
  (shown under Help & support). Server: `backend/blockUsers.ts` (table `blocked_users`; guards in front of the locked
  chat-send / invite / apply routes and filters on inbox / invitations / applicants — locked files untouched).


---

# How to contribute (was CONTRIBUTING.md)

# Where does my change go?

Read this before editing anything. Read `docs/code/ARCHITECTURE.md` too — it explains *why* Campaign
and UGC keep colliding. This file is the shorter question: **which file do I touch?**

---

## Before you commit, run this

```bash
npm run verify
```

That is `tsc --noEmit` + the crash guard + the test suite. All three must pass.

**`npm run build` succeeding proves nothing.** It does not typecheck and it does not catch a
component used without being imported. Two bugs have reached production through a green
build: an undeclared `targetBrandId` that killed the payout chat card, and an unimported
`<AlertCircle />` that white-screened the creator's revision page. `npm run verify` catches
both. `npm run build` catches neither.

---

## Which file?

| I'm changing… | Edit | Never touch |
|---|---|---|
| Campaign flow only | `backend/campaigns_routes.ts`, `src/pages/brand/BrandCampaign*.jsx`, `src/pages/creator/CreatorCampaignFlow.jsx`, `src/components/campaigns/` | anything UGC |
| UGC flow only | `backend/ugc_routes.ts`, `src/pages/brand/BrandUGC*.jsx`, `src/pages/creator/*UGC*.jsx` | anything campaign |
| "Is this UGC or Campaign?" | `backend/dealFlow.ts` — **the only place** | do not write the check inline |
| Chat contact filtering | `backend/contactSecurityFilter.ts` | do not add a second filter |
| Chat review-state order | `src/components/chat/chatFlowState.js` | do not inline the precedence |
| Negotiation signature lock | `negotiationLockedFor` in `backend/deals_chat_routes.ts` | — |
| Showing money, or any API value | `src/utils/safeFormat.js` helpers | `.toLocaleString()` on API data |

### Campaign is frozen

Campaign works. Do not modify campaign files without explicit sign-off from Ravi, **for that
specific change**. "While I was in there" is not sign-off.

---

## The four rules that would have prevented every bug so far

### 1. Never decide the flow inline

```js
// NO — this is how the inbox and the chat screen ended up disagreeing
const isUgc = thread.is_ugc || thread.deal_type === 'UGC' || thread.ugc_order_id;

// YES
import { isUgcThread, isCampaignThread } from "@/utils/dealFlow";
```

There were six inline copies of that check and they all differed. One of them did not test
the `ugcord_` prefix, so a UGC thread appeared under **Campaigns** in the inbox while the
chat screen treated the same row as UGC. `is_ugc` is not reliably set in the database, so
any check that trusts it alone is wrong.

If detection needs to change, change `dealFlow.ts`. Both flows stay in agreement by
construction.

### 2. Never send a UGC id to a UUID column

Campaign ids are UUIDs. UGC ids look like `ugcord_mu6hn57v_1f7434`. They shared the
`deal_id` column for a long time, so both still turn up there.

```js
// NO — Postgres 22P02, and it fails the WHOLE statement, not just this row
await supabase.from('deals').update({...}).eq('id', thread.deal_id);

// YES
import { getCampaignDealId } from "@/utils/dealFlow";
const dealId = getCampaignDealId(thread);   // UUID or null, never a ugcord_ string
if (dealId) await supabase.from('deals').update({...}).eq('id', dealId);
```

### 3. Never call a method directly on API data

```jsx
// NO — one missing field and the page is gone
₹{order.amount.toLocaleString('en-IN')}
{status.toUpperCase()}
{deal.dos.map(...)}

// YES
import { formatAmount, safeUpper, safeArray } from "@/utils/safeFormat";
₹{formatAmount(order.amount)}
{safeUpper(status)}
{safeArray(deal.dos).map(...)}
```

`undefined.toLocaleString()` throws a TypeError, React cannot recover mid-render, and the
page dies. The escrow release modal had ten of these. A missing amount should render as ₹0
and look obviously wrong — not blank the screen.

Same for `JSON.parse` on anything from `localStorage`: use `safeJsonParse`. A corrupt cached
user in `AuthContext` used to throw above the router, where no boundary could catch it, and
the app simply would not start.

### 4. Branch on what it IS, not on what you managed to prove

```js
// NO — isUgc goes false exactly when the order row failed to load, which is when the
// write mattered most. This silently skipped Manage Orders updates for real UGC orders.
if (isUgc || order) { updateUgcOrder(); } else { updateDeal(); }

// YES — decide from the thread, and let UGC be the default
if (isCampaignThread(thread)) { updateDeal(); } else { updateUgcOrder(); }
```

---

## Shared files: branch, don't switch

These serve both flows and cannot simply be split:

`backend/server.ts` · `backend/deals_chat_routes.ts` · `src/components/chat/ChatBox.jsx` ·
`ContentProofNotice.jsx` · `SystemMessage.jsx` · `MessageBubble.jsx`

Editing one of these is the highest-risk change in the codebase — it is how a campaign fix
broke UGC and vice versa, repeatedly. So:

- Put the change inside an `if (isUgcThread(...))` / `if (isCampaignThread(...))` branch.
- Leave the other branch **byte-identical**. Do not reformat it, do not reorder it.
- **Reordering conditions counts as changing them.** Flipping which of
  `isContentSubmitted` / `isRevisionRequested` is evaluated first broke the entire UGC
  revision flow without changing a single condition's contents.
- Test both flows before committing, not just the one you were fixing.

---

## Adding a regression test

Every bug fix gets a test, and the test must be proven to work:

1. Write the fix.
2. Write the test. Confirm it passes.
3. **Undo the fix. Confirm the test fails.** A test that passes either way is worthless.
4. Redo the fix. Confirm it passes again.

For a filter or a classifier, also test the **negative** side — what must *not* be blocked,
what must *not* be reclassified. The contact filter's first draft blocked
"budget is 3500 for 2 reels" and "Is this for iPhone or Android?"; only the negative tests
caught that.

---

## Working with AI Studio

- After any AI Studio round-trip, run `npm run verify` before trusting anything.
- A summary of what changed is not evidence. Grep for a literal string from the code.
- If the exported zip does not contain the changes, the work was never committed — check
  `git status -s` and `git log --oneline -n 2`.


---

# Unique features (was UNIQUE_FEATURES.md)

# Unique Features & Architectural Enhancements

This document catalogs the unique, advanced capabilities engineered into the Ybex Influencer Marketplace platform. It serves as an architectural record for developers, administrators, and future AI agents.

---

## 1. Live Influencer Verification with Google Search Grounding

### Overview
Traditional influencer platforms rely on static self-reported metrics or stale scraper caches that quickly become outdated. This feature grounds influencer authenticity checks directly in real-time web search results powered by Gemini models (`gemini-2.5-flash`) with dynamic Google Search Grounding tools.

### Backend Endpoints
- **`POST /api/market-intelligence/creator-verify`**
  - **Inputs:** `creator_id`, `name`, `handle`, `platform`, `category`, `force_refresh`
  - **Functionality:**
    - Queries Google Search Grounding to evaluate real-time follower footprint, media coverage, controversies, verified brand partnerships, and organic engagement sentiment.
    - Generates a quantified **Verification Score (0-100)**.
    - Detects risk signals (disputes, paid follower spikes, inactive handles).
    - Extracts live web grounding sources and citations with verifiable URLs.
    - Caches results in `db.json` (`creator_verifications`) and mirrors to Supabase when connected.

### Frontend Components
- ~~`src/components/market/GoogleSearchVerificationModal.jsx`~~ — removed from the app (v334 cleanup note); the text below is history.
  - Accessible directly from `CreatorCard` across the **Explore** page (`src/pages/dashboard/Explore.jsx`).
  - Displays:
    - Real-time Authenticity & Trust Gauge.
    - Detected Quality Badges (e.g., "Active Brand Endorsements", "Clean Public Sentiment").
    - Web Citations with direct external links.
    - Risk Signal & Sentiment Breakdown.
    - Adheres to the button alignment standard (Cancel/Close on the left, Re-scan on the right).

---

## 2. Interactive D3.js Campaign Performance & Telemetry Engine

### Overview
A custom, SVG-driven data visualization suite built from scratch using **D3.js** (`d3.line()`, `d3.area()`, `d3.curveMonotoneX`, `d3.scaleLinear`, `d3.scalePoint`). Unlike generic static chart libraries, this provides interactive crosshairs, fluid gradient fills, responsive tooltips, and multi-metric velocity analysis.

### Visualized Metrics
1. **Growth Velocity Curve:**
   - Multi-metric toggle: **Cumulative Views**, **Unique Reach**, **Total Likes**, **Engagement Rate %**.
   - Time window filter: **7 Days** vs **14 Days**.
   - Dashed **Industry / Category Benchmark Line** showing campaign outperformance.
   - Interactive hover cursor, crosshair guideline, and real-time floating tooltip.
2. **Audience Conversion Funnel:**
   - Visualizes pipeline drop-off: *Impressions ➔ Unique Reach ➔ Engaged Viewers ➔ Profile Visits ➔ Link Conversions*.
   - Dynamic percentage bars and step-by-step retention rates.
3. **Geographic Metro Split:**
   - Regional distribution covering Tier-1 Metros (Mumbai, Delhi-NCR, Bangalore) vs Tier-2 (Pune, Ahmedabad, Jaipur) vs Tier-3.

### Backend Endpoints
- **`GET /api/market-intelligence/performance/:id`**
  - Synthesizes and persists time-series telemetry linked to deal IDs.
  - Automatically handles fallbacks and persists records to `db.json` (`campaign_performance_metrics`) and Supabase.

### Frontend Components
- **`src/components/analytics/D3PerformanceVisualizer.jsx`**
  - Integrated into:
    - **Deal Detail Milestones:** `src/pages/collabs/DealDetail.jsx`
    - **Live Post Performance Workspace:** `src/pages/collabs/UploadedCollab.jsx`

---

## 3. Real-Time Market Rate Advisor & Pricing Benchmark

### Overview
Eliminates pricing friction between Indian brands and creators by providing dynamic, grounded pricing benchmarks based on deliverable types, follower count, and industry niche (CPM / Reel standards).

### Backend Endpoints
- **`POST /api/market-intelligence/rate-advisor`**
  - **Inputs:** `niche`, `follower_count`, `platform`, `deliverable_type`, `proposed_rate`
  - **Outputs:** Recommended min/max fair price range, median benchmark in INR (₹), CPM estimate, and negotiation tactics.
- **`GET /api/market-intelligence/trending-topics`**
  - Returns live viral content hooks and themes grounded via Google Search.

### Frontend Components
- ~~`src/components/market/RateAdvisorWidget.jsx`~~ — removed from the app (v334 cleanup note); the text below is history.
  - Embedded as a collapsible panel in `src/pages/dashboard/Explore.jsx`.
  - Enables brands to test deliverable pricing before initiating collaborations.
  - One-click "Apply Median" button to carry market rates directly into negotiations.

---

## 4. Database & Supabase Integration Guidelines

The architecture uses a dual-layer persistence model:
1. **Primary / Local Cache:** `db.json` managed via `getDb()` and `saveDb()`.
2. **Relational / Cloud Layer:** Supabase tables with graceful error handling.

### Optional Supabase Tables (Recommended Schema):
```sql
-- 1. Creator Live Verifications
CREATE TABLE IF NOT EXISTS creator_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id TEXT NOT NULL,
  verification_score INT DEFAULT 85,
  badges JSONB DEFAULT '[]'::jsonb,
  audience_sentiment TEXT,
  risk_level TEXT DEFAULT 'LOW',
  grounding_sources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Campaign Telemetry Time-Series
CREATE TABLE IF NOT EXISTS campaign_performance_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT NOT NULL,
  time_series JSONB DEFAULT '[]'::jsonb,
  summary JSONB DEFAULT '{}'::jsonb,
  funnel_data JSONB DEFAULT '[]'::jsonb,
  demographics_bubble JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
*Note: The backend gracefully detects if these tables exist; if not yet migrated, it seamlessly falls back to `db.json` without breaking any client functionality or throwing blob errors.*
