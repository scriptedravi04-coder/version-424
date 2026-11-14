# 🗄️ NO NEW DATABASE CHANGES RIGHT NOW (Ravi, session 41)

We are only fixing the app's bugs and errors. **Do not create any Supabase table, column, bucket or SQL
file, and do not build features that need one.** If something needs the database, write it in
`docs/database/PENDING_DB_CHANGES.md` (what / why / which code) and tell Ravi. All of it is done together in one
dedicated database session.

# 🔒 LOCKED: Campaign, UGC, Invite-to-campaign (Ravi, session 28)

These three flows work end to end and launch is close. **Do not change their logic.**
- Logic files (backend routes, deal/chat/contract/payment code, `dealState.js`, `useChatThreadMobile.js`, …)
  are frozen — list in `scripts/protectedFlows.mjs` → `LOGIC_FILES`. Not one character.
- Screen files of these flows (chat cards, mobile sheets, manage-orders, campaign / invite pages) may get a
  new design, but every server call they make must stay exactly the same (same method, same path).
- `npm run verify` fails (`backend/protectedFlows.test.ts`) if either rule is broken. Undo your change.
- **Never** run `npm run protect:update`, edit `scripts/protected/manifest.json`, shorten the lists, or edit
  that test yourself. Only when Ravi approves a specific change in writing; it is logged in `docs/code/PROTECTED_CHANGES.md`.
- Mobile UI work: change layout / styling / text only. Need a new server call or a logic change? Stop and ask Ravi.

# 🛑 FIRST: read `docs/code/ARCHITECTURE.md` → "PROTECTED CHANGES"

Security, money and privacy fixes in this app must not be undone. Before finishing any change run
`npm run verify`; never edit or delete a test to make it pass. If a requested change needs one of
the protected rules changed, stop and ask the user.

# Project Architecture & UI Guidelines

## Button Alignment Architecture Standard

### Mandatory Rule:
All action buttons across the application (desktop and mobile chat cards, modals, negotiations, deal lifecycle, and sheets) must adhere strictly to the following positioning convention:

1. **Right-Side Alignment (Primary / Affirmative / Action Buttons):**
   - **Approve** (e.g. Approve Draft, Approve Deliverable, Approve & Pay)
   - **Accept** (e.g. Accept Proposal, Accept Offer, Accept Terms, Accept via OTP)
   - **Upload / Submit / Send** (e.g. Upload Content, Submit Links again, Send Propose, Send Changes Request, Upload Revised)
   - **Sign / Authorize** (e.g. Authorize Deed, Sign Agreement)
   - In any horizontal flex row or button pair, these primary action buttons must **ALWAYS be placed on the right side** (last child or `justify-end` / `ml-auto`).

2. **Left-Side Alignment (Secondary / Neutral / Dismissive Buttons):**
   - **Cancel / Close / Dismiss** (e.g. Cancel, Close, X)
   - **Decline / Reject** (e.g. Decline, Propose Decline, Decline the changes)
   - **Negotiate / Counter** (e.g. Negotiate, Counter)
   - **Request Changes / Ask to Resubmit**
   - In any horizontal flex row or button pair, these secondary/dismissive buttons must **ALWAYS be placed on the left side** (first child).


## Loading states
Follow docs/code/ARCHITECTURE.md "Loading states" (rule 35) in every new screen: button actions use `useBusy` + `<ButtonSpinner />` (never `startLoading()`), page data uses `ContentSkeletons`, the global loader stays a 2px top bar. Do not bring back the full-screen blurred loader or a big wordmark.

UGC cancels never refund through Razorpay: a creator cancel keeps the money in the brief and relists the slot; a brand order-cancel (24h+, no draft) goes to the manual Admin → UGC Refunds queue. See docs/code/ARCHITECTURE.md rules 51–52 before touching `/ugc/orders/:id/cancel`.

## Tests are packed (v338)
AI Studio imports at most 1,000 files from GitHub, so all test files live in ONE file: `dev/tests.tgz`.
`npm run tests:unpack` puts them back next to the code (`npm run verify` does this first). After adding or changing a
test run `npm run tests:pack` — never push loose `*.test.*` files (they are in .gitignore). Unpacked tests still follow
every rule above: never edit or delete a test to make it pass.
