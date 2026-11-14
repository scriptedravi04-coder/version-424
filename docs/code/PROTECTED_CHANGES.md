# Protected flows — change log

Campaign, UGC and Invite-to-campaign are **locked** (Ravi, session 28: all three tested and working
on the deployed build; launch is close). See `scripts/protectedFlows.mjs` and docs/code/ARCHITECTURE.md rule 60.

- Logic files: frozen by content hash.
- Screen files of these flows: design may change; the server calls they make may not.

Only Ravi can approve a change. After he approves, run:
`npm run protect:update -- --reason "what Ravi approved"` — every run is logged below.

## Log

- 2026-09-29 — **Baseline** (session 28, v220): Ravi tested Campaign, UGC and Invite-to-campaign on v219 and all work. v220 adds only the session-28 fixes (brand KYC gate, per-user drafts, live refresh). 35 logic files + 4 screen groups (chat, ugc, campaign, invite) locked.

- 2026-09-28T22:09:00.966Z — Session 28: signature records (agreement_signatures) — Ravi approved in chat: 'ye toh abhi hi implement krege'. Sign routes save text/version/OTP email/IP; screens send their text; lock list +3 files.
  - logic files changed: backend/deals_routes.ts, backend/deals_chat_routes.ts, backend/signTokens.ts, backend/agreementRecord.ts, backend/admin_agreements_routes.ts, src/lib/agreementCapture.js, backend/ugc_routes.ts, src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-09-29T12:42:46.179Z — Session 30, Ravi (chat): 'inka backend bhi bana do or inka ui bhi bana do' — adds campaign pause/close/matching-creators backend (new file backend/campaignManage.ts, apply guard in front of the locked apply route) and the mobile campaign list/detail screens. No existing locked file changed its logic; the locked applicants and campaigns pages only render the new mobile screens.
  - logic files changed: none
  - screen call groups changed: none

- 2026-09-29T12:42:55.814Z — Session 30, Ravi: adds backend/campaignManage.ts and the two mobile campaign screens to the lock (they were built on Ravi's OK in chat).
  - logic files changed: backend/campaignManage.ts
  - screen call groups changed: campaign

- 2026-09-29T20:23:14.560Z — Session 30, Ravi (chat): 'naya agreement UGC aur campaign chat mein attach karo; campaign ka UI aur backend update ho; terms tick karein tabhi OTP jaaye; calls aur logic na toote'. Agreement v1 text (src/lib/agreementTerms.js), versions v0 → v1 in agreementCapture.js, shared AgreementTermsPanel. Server calls unchanged.
  - logic files changed: src/lib/agreementCapture.js, src/lib/agreementTerms.js
  - screen call groups changed: chat

- 2026-10-06T05:36:33.874Z — Session 31, Ravi (SESSION_30_SUMMARY item 4: 'UGC lock — navigation only, Ravi OK to update the lock'; confirmed 'Continue' in chat): after paying for a UGC brief the brand lands on My Briefs, not an empty Create brief form. briefPaymentRetry.js: markBriefPosted / takeRecentBriefPost + replace-navigation after checkout closes. No server call changed.
  - logic files changed: src/lib/briefPaymentRetry.js
  - screen call groups changed: none

- 2026-10-06T06:16:11.350Z — Session 31 mobile chat audit, Ravi (chat): 'ye sab 5 ki 5 theek kr do ... desktop vale mai changes mat krna, sirf mobile'. useChatThreadMobile.js: creator can decline a live-link correction (same endpoints as desktop SystemMessage), no invented 15000 escrow amount, /pay follow-up like desktop, correct UGC collab approve text, link-rejection local state = server state. Desktop files unchanged; no backend change.
  - logic files changed: src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-10-06 — Session 34, Ravi (chat, session 33): 'invite popup ke liye ok hai'. Invite review popup button labels only: "Decline Invitation" → "Decline" (left), "Accept & Start Negotiating" → "Accept & open deal room" (right) in CreatorReviewInvitationModal.jsx. Test texts updated to the new labels in directBrandInviteFlow.test.jsx and mobileCreatorInvites.test.jsx. Calls unchanged (same accept / decline POSTs), so no protect:update was run. "Decline Campaign Invitation", "Back to Review", "Confirm Decline", "Reason for Declining" unchanged.
  - logic files changed: none
  - screen call groups changed: none

- 2026-10-07T08:05:22.913Z — Session 34. Ravi in chat (7 Oct 2026), replying to 'Escrow shabd hata ke secure payment hold likh doon? Isme kuch locked files bhi badlengi': 'HN YE ESCROW WORD HATA KR KAAM SHURU KR SAKTE HO ISKI JAGAHA SECURE PAYMENT HOLD KR DO'. Text-only change in 9 locked files (user-visible strings: escrow -> secure payment hold; code skeleton unchanged, verified line by line; message-matching strings like includes('escrow payment released') left as they were). Plus Ravi 'hn toh isko PAN hi krdo' (KYC = PAN + bank/UPI): backend/creators_routes.ts KYC submit no longer stores Aadhaar number / images.
  - logic files changed: backend/campaigns_routes.ts, backend/campaign_lifecycle.ts, backend/deals_chat_routes.ts, backend/payment_routes.ts, src/lib/agreementTerms.js, backend/creators_routes.ts, src/components/chat/orderTicket.js, src/components/chat/mobile/chatStageMap.js, src/components/chat/mobile/useChatThreadMobile.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-07T08:07:15.858Z — Session 34, same approval as the entry above (Ravi: 'HN YE ESCROW WORD HATA KR KAAM SHURU KR SAKTE HO ISKI JAGAHA SECURE PAYMENT HOLD KR DO'). Second text-only pass: src/lib/agreementTerms.js visible agreement wording escrow -> secure payment hold; code skeleton unchanged.
  - logic files changed: src/lib/agreementTerms.js
  - screen call groups changed: none

- 2026-10-07T12:31:26.401Z — Session 35. Ravi in chat (7 Oct 2026): 'excrow sabh jab hata hi diya tha toh vapas kahi pr bhi nahi dikhna chaiye' — same approval as session 34 ('HN YE ESCROW WORD HATA KR ... SECURE PAYMENT HOLD KR DO'). Text-only: 7 leftover user-visible strings escrow -> secure payment hold (agreementTerms.js hint, razorpay.js 3 test-mode toasts, useChatThreadMobile.js 2 toasts + 1 confirm). Code skeleton unchanged, verified with diff; message-matching strings left as they were.
  - logic files changed: src/lib/agreementTerms.js, src/components/chat/mobile/useChatThreadMobile.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-07T17:07:57.767Z — Session 36. Ravi in chat (7 Oct 2026), answering 'Chat socket ko ek shared connection mein badalna. Isme locked files hain, isliye aapka OK chahiye': 'OK'. Change: open chat thread (ChatBox.jsx desktop, useChatThreadMobile.js mobile) and UGC order screens (BrandUGCOrders.jsx, ManageUGCOrdersView.jsx) use the shared per-tab socket (src/lib/sharedSocket.js acquireSocket) instead of a new io() connection. Same events, same join_room/leave_room/register_user; connect handler -> lease.onConnect (also re-runs after reconnect); disconnect -> lease.release (removes only this screen's listeners). Polling safety net unchanged.
  - logic files changed: src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-10-07T18:32:38.774Z — Session 36, option A. Ravi in chat (7 Oct 2026): '(A) Sahi tareeka ... continue toh krlo' and earlier 'hn toh fir or locked files ka dhyan se krna' (launch offer / coupons, incl. UGC) + the password-protected '₹0 platform fee + convenience fee' toggle (Zepto-style, shown before signing). Changes, fee lines only: feeCalculator.ts — offer mode (config.offer_mode / offer_fee_pct, default 2%) replaces the rate and coupons, returns feeKind; payment_routes.ts — persistEscrowPayment applies a creator coupon (resolveCreatorCoupon) and records its use; the two payout fallbacks read the fee stamped at payment (stampedFee.feeAtPaymentTime) instead of today's setting; campaign_lifecycle.ts — release uses the stamped fee. Verified by diff; tests backend/feeOfferCoupons.test.ts.
  - logic files changed: backend/campaign_lifecycle.ts, backend/payment_routes.ts, src/utils/feeCalculator.ts
  - screen call groups changed: none

- 2026-10-08 — Session 37 (animations). Ravi in chat (8 Oct 2026), answering 'locked files mein sirf animation wali lines badlunga — OK?': 'inke ui mai chnges hone chaiye bas jada kuch nhi khi tum logic vgrh mai chnges kr do baki shuru kro'. UI / motion only in 23 locked screen files: a popup's dark layer and box became PopupBackdrop / PopupPanel (src/components/common/Popup.jsx, same classes, same props, same onClick), `{x && <Popup/>}` wrapped in <Presence> so it can play its closing animation, old per-file initial/animate/exit/spring values replaced by the shared ones in src/lib/motion.js, dead `animate-in fade-in duration-300` removed from page roots, GSAP counter in CreatorUGCOrders.jsx replaced by lib/motion countUp (same ₹ format). No API call, state, handler, text or condition changed; verified by diff. Files: BriefRefundStatus, CancelBriefModal, InviteToCampaignModal, BrandCampaignDetailMobile, BrandCampaignsMobile, AgreementSign, BrandAgreement, ChatBox, OrderSupportModal, SendBrief, MobilePayoutCard, SlaAgreementOtpModal, BrandCancelOrderModal, CreatorCancelOrderSheet, BrandInstantUGC, BrandUGCBriefs, BrandUGCMobile, BrandUGCOrders, CreatorUGCBrowse, CreatorUGCMobile, CreatorUGCOrders, ManageUGCOrdersView, UgcOrders.
  - logic files changed: none
  - screen call groups changed: none

- 2026-10-08T04:59:01.342Z — Session 38 v257, Ravi in writing: 'PHELE YE SAB THEEK KRO' (admin audit list). backend/payment_routes.ts only: escrow overview reads creator_payment_methods (saved UPI/bank) + all pages; payout_requested flag for PROCESSING requests; release-payout refuses already-paid / refunded; admin refund refuses unknown payment, more than paid, after payout, twice; save errors no longer answer success. No deal/chat/UGC flow logic changed.
  - logic files changed: backend/payment_routes.ts
  - screen call groups changed: none

- 2026-10-08T05:20:49.978Z — Session 38 part 2 (v258), Ravi in writing: 'YE SAB BANAO OR MANG NAHI SAKTA H VOH HATAO'. backend/chat_routes.ts: blocked/flagged chat messages saved to Supabase chat_moderation_events (was local file only); admin chat/all, chat_guard_violations, chat_violations (+resolve) read Supabase. The block itself (what is blocked, error text) unchanged. backend/payment_routes.ts: payout-eligible deals and the chat payout nudge only after brand approval (COMPLETED/APPROVED; PROOF_SUBMITTED removed).
  - logic files changed: backend/chat_routes.ts, backend/payment_routes.ts
  - screen call groups changed: none

- 2026-10-08 — Session 39 (v259), Ravi in chat (8 Oct 2026), answering "Start karne par sabse pehle crash wale fixes (M14, M27) honge. Uske liye locked files (mobile chat aur contract OTP popup) ka OK aapse pehle lunga": "ok h tum strt kro or sab krrke final zip do". Screen files only, no call changed (protect check green):
  - src/components/chat/mobile/ChatBoxMobile.jsx — 4 useMemo hooks moved above `if (!thread) return null` (React "Rendered more hooks" crash when the thread loads). Same code, new position.
  - src/components/deals/SlaAgreementOtpModal.jsx — `useState(sendingOtp)` moved above `if (!deal) return null` (same crash).
  - src/pages/creator/CreatorUGCMobile.jsx — one line `useHideBottomNav(activeView !== "main")` (bottom bar hidden on brief / agreement / workspace, Ravi M13).
  - logic files changed: none
  - screen call groups changed: none

- 2026-10-08T17:04:56.173Z — Session 40 (v260). Ravi in chat (8 Oct 2026), answering the list 'Deliverable link check (chat/deal screen) · CampaignDetail.jsx mein "X campaigns done" + rate-card quote · ChatBoxMobile.jsx ke fallback naam · creators_routes.ts ka fake follower %': 'in pr bhi ok h kaam shuru kro then'. backend/creators_routes.ts: fake follower % (followers mod 120) and the score built from it replaced by the audience ESTIMATE from the creator's own likes/comments/reach (src/utils/audienceEstimate.ts), null when not enough data; avg_views_30d no longer invents followers x 0.12; real reach read before old avg_views. Nothing else in the file changed. src/pages/campaigns/CampaignDetail.jsx: one new read-only call GET /brands/:id/track-record (campaigns done) + quote pre-filled from the rate card; apply call unchanged. Text/layout only, no call change: ChatBoxMobile.jsx (fallback names Creator/Brand/Collaboration, unknown partner not shown online), MobileLiveLinkSheet.jsx + ChatBox.jsx + ManageUGCOrdersView.jsx (live link must be a post/reel/video link, src/utils/liveLinkCheck.js), CampaignDetailMobile.jsx.
  - logic files changed: backend/creators_routes.ts
  - screen call groups changed: campaign

- 2026-10-09T10:43:23.874Z — Session 41, Ravi (chat): 'locked files ka ok hai but desktop chat flow (campaign, UGC, invite) jaisa hai waisa rehna chahiye'. Changes: campaigns_routes city order (profile city before the old demo 'Mumbai'); CampaignDetail demo defaults removed (location/due date/terms/pitch); MobileOfferCard + MobileShortlistCards counter box no longer pushes Send out of the card; BrandUGCMobile two-box format, icon-only header, FREE badge on Express; ManageUGCOrdersView 'Sync Live Metrics' link /collabs/new -> /collabs (404). No server call changed; desktop chat flow untouched.
  - logic files changed: backend/campaigns_routes.ts
  - screen call groups changed: none
- 2026-10-13 — Session 43 v288, Ravi (chat, screenshot of his request "jaise users ke liye delete / complete wipe out ka option h admin ke liye bhi do"): ARCHITECTURE rule 56 changed from "never another admin" to: a full admin may bin or wipe admin / sub-admin accounts; never self; never the last full admin. Sub-admins can no longer bin any admin account. Wipe plan also removes admin_permissions. Files: backend/adminTargetGuard.ts (new), admin_wipe_routes.ts, admin_campaigns_settings_routes.ts, accountWipe.ts, AdminUsersTab.jsx, UserEnforcementPanel.jsx. Test: backend/adminAccountWipe.test.ts.
- 2026-10-14 — Session 49 v300, Ravi (chat: "unko bhi krke mujhe do vapas but safely" — split the locked files too): locked SCREEN files split into section files, word for word (ChatBox, SystemMessage, MobileCampaignCreate, BrandUGCMobile, CreatorUGCMobile, ManageUGCOrdersView, BrandUGCOrders). Only sections with NO server call / path string were moved, so every screen file makes exactly the same calls as before; no manifest update was needed.
  - logic files changed: none (backend ugc_routes / server / payment / lifecycle NOT split: dozens of tests read their exact text)
  - screen call groups changed: none

- 2026-10-14T18:29:10.989Z — Session 52 v302, Ravi (chat, answering 'Saved creators, brand reviews... locked files kholun?'): 'Haan, kholo aur theek karo'. backend/creators_routes.ts only: Save creator / saved-status / profile isSaved now read+write the saved_creators table, and a brand's review is also inserted into creator_reviews (helpers in backend/persistedLists.ts; memory stays as fallback when the database can't answer). Routes, responses and every other line unchanged. collab cost requests + message_flags left as they are (no screen uses them).
  - logic files changed: backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-14T18:30:24.650Z — Session 52 v302, Ravi (chat): 'Razorpay ... testing mode se hatao aur real mode pe rakho'. src/lib/razorpay.js only: the browser no longer guesses test mode from a *.run.app / localhost address; test vs live now comes only from the server's answer (is_test_mode / order_test_ / rzp_test_ key), so live brands never see 'Test Mode / Auto-Complete' buttons. Payment calls unchanged.
  - logic files changed: src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-14T19:12:16.685Z — Session 53 v303 launch security audit. Ravi (chat): 'locked files kholna but muhe bata bhi dena ki ky ky kr rahe ho or kyu'. Only WHO-may-do-it checks added, flows unchanged: campaign_lifecycle.ts (UGC approve-content: only the order's brand or admin — any user could release a UGC payout); chat_routes.ts (post message: only the two parties or staff; users can't send 'system' messages; sender side from the thread); deals_routes.ts (submit-draft: only the deal's creator); deals_chat_routes.ts (UGC agreement sign: only your own side when the thread knows both ids); payment_routes.ts (paid-amount covers the recorded amount for every payment, not only campaign deals); ugc_routes.ts (AI brief generator: logged-in brands only); creators_routes.ts (profile form no longer changes the LOGIN email).
  - logic files changed: backend/campaign_lifecycle.ts, backend/deals_routes.ts, backend/deals_chat_routes.ts, backend/chat_routes.ts, backend/payment_routes.ts, backend/ugc_routes.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-14T20:28:20.366Z — Session 56 payment audit (Ravi: 'payments mai koi loophole nahi hona chahiye'; earlier OK to open locked files with an explanation): one payment per deal (create-order refuses a paid deal, reuses/recovers the last order), Razorpay webhook, check-status/release-payout id checks, compare-and-set on admin payout/refund saves, RELEASED-not-paid fix in adminMoney, UGC payment_status RELEASED, admin UGC cancel no longer auto-refunds via Razorpay, refund mark-failed checks rows, browser Pay stays busy until the window closes, no fake Razorpay contact details, brief order recovery tied to the user.
  - logic files changed: backend/payment_routes.ts, backend/ugc_routes.ts, src/lib/briefPaymentRetry.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-14T20:39:07.374Z — Session 56 part 2 (Ravi: 'dusre vale ko bhi fix kro'): UGC brief deposit saved in transactions with brief_id + Admin fee stamped at payment time; brief not saved in DB → error so the paid order is retried free; same order twice → existing brief; admin overview marks brief deposits. DB: scripts/sql/session56.sql applied.
  - logic files changed: backend/payment_routes.ts, backend/ugc_routes.ts
  - screen call groups changed: none

- 2026-10-15T09:03:46.929Z — Session 58 (Ravi: payout ek deal ko 2 baar gin raha tha; inbox '₹13,000 received' jab bank me ₹0): refund_status 'NONE' (DB default) is not a refund (campaignGuards.isEscrowDepositRow, ugc_routes isRefundRow via backend/refundFlags.ts); creator chip says 'received' only when paid to bank (chatStageMap.js)
  - logic files changed: backend/campaignGuards.ts, backend/ugc_routes.ts, src/components/chat/mobile/chatStageMap.js
  - screen call groups changed: none

- 2026-10-15T17:45:49.735Z — Ravi (15 Oct, 'payment page ache se design karo, fully functional banao, bugs dhundo'): Review & pay method choice passed to Razorpay (prefill.method, quiet toasts, brand theme); duplicate 'Payment Secured' chat message fixed (dedupe query used a missing id column); create-order no longer invents a Rs 1,000 amount or a 'Brand User' prefill name.
  - logic files changed: backend/deals_chat_routes.ts, backend/payment_routes.ts, src/components/chat/mobile/useChatThreadMobile.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-15T18:01:16.768Z — Ravi (15 Oct, 'find more bugs and glitches now'): bug hunt fixes — campaign languages saved (were always Hindi); UGC thread /pay no longer writes a missing payment_funded column; collab deliverable lookup by collab_id; payout alert says who asked (creator vs brand); /ugc/earnings returns brief title, brand and approval date.
  - logic files changed: backend/campaigns_routes.ts, backend/deals_chat_routes.ts, backend/content_submissions_routes.ts, backend/payment_routes.ts, backend/ugc_routes.ts
  - screen call groups changed: none

- 2026-10-15T18:11:20.153Z — Ravi (15 Oct, 'haan review mai jana chaiye'): launching a saved campaign draft now sends it to admin review (under_review + review notice) instead of making it live straight away.
  - logic files changed: backend/campaigns_routes.ts
  - screen call groups changed: none

- 2026-10-15T18:27:04.820Z — Ravi (15 Oct, 'find more bugs and glitches now', round 3): KYC no longer sets users.verified=false (it locked users out of password login); desktop KYC IFSC / UPI QR saved, save errors reported, no stock PAN photo; UGC deal-submit notification keeps its link; team-member / managed-talent avatars no longer a stranger's stock photo.
  - logic files changed: backend/deals_routes.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-16T02:38:49.135Z — Ravi (16 Oct, 'find more bugs and glitches now' round 4 + 'hn' to chat Warn/Restrict): security — UGC ids can't use campaign payout/live-link routes, draft approve / collab accept only by the right party, test-pay needs a signed-in brand, quick-admin PIN brute-force lock; deal chat — typed words no longer close a chat, contract shows the agreed amount, unread marks clear, team members see/act on brand chats; UGC — brief closes only when every slot is delivered, re-sign can't reset the timer, cancel/claim race, refund accounts, revision notes saved, live order re-read before a draft; chat Warn/Restrict/Lift really act.
  - logic files changed: backend/campaigns_routes.ts, backend/campaign_lifecycle.ts, backend/deals_chat_routes.ts, backend/chat_routes.ts, backend/content_submissions_routes.ts, backend/payment_routes.ts, backend/ugc_routes.ts, backend/creators_routes.ts, src/components/chat/dealState.js, src/components/chat/mobile/chatStageMap.js, src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-10-16T02:59:44.824Z — v323: creator profile — own views not counted, no email lookup, auto-create only for the creator themself, deleted profile 404, platform markup applied to rate fields in profile/GET creators/explore (same as rate card)
  - logic files changed: backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-16T03:31:55.537Z — v324 round 6: campaigns (closed campaigns can't be edited, rejection reason saved, accept can't run twice, real view count for brands), campaign apply guard (only live + before deadline, creators only, not own campaign), Deals page applications list (bad join removed, team members), payout release (frozen escrow and creator KYC checked, honest 'changed' code), creator request can't un-pay a paid row, UGC alert-admin lookup, creator profile (phone only fills an empty login phone, no fake defaults, deal-based score)
  - logic files changed: backend/campaigns_routes.ts, backend/content_submissions_routes.ts, backend/payment_routes.ts, backend/campaignManage.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-16T04:06:20.958Z — v325 round 7: campaigns list (exact demo-name filter only), chat review (only after completion, one per side), UGC (live link only after draft approval, no re-approving an approved draft, cancelled order can't be re-claimed, showcase only open briefs safe fields, /ugc-orders scoped to viewer, old submit route reads the live row, in-house override refused honestly, no name-substring filter), creator profile (handle filter sanitised, one view per viewer per day, review saved under the brand)
  - logic files changed: backend/campaigns_routes.ts, backend/chat_routes.ts, backend/ugc_routes.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-16T05:11:24.026Z — v326 round 8 (Ravi OK for DB + fixes): campaigns save targeting + no past deadline + safe apply amount; deals_routes sign goes to chat, draft/live-link stage + funding checks; deals_chat_routes no signing during a counter or at a different amount, stale-offer accept refused, counter amount limits, /pay can't drag a deal back, no agreement while a counter waits; content_submissions approve/changes only on a draft in review + real revision limit; payment_routes one deposit per deal, duplicate-insert handling, webhook retry, ondismiss verify, partial refunds, refund status allowlist, brief order tag + watch, payment id + brand id saved, captured-amount check; feeCalculator coupon rate clamp; creators_routes youtube views own column, review-queue count, agency route off
  - logic files changed: backend/campaigns_routes.ts, backend/deals_routes.ts, backend/deals_chat_routes.ts, backend/content_submissions_routes.ts, backend/payment_routes.ts, src/utils/feeCalculator.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-16T05:57:58.903Z — Session 58 v327 (Ravi's answers): Q1 brand sees totals only, Q3 payout notice shows deal total, Q8 real client IP, Q11 payout freeze + min withdrawal + campaign budget limits enforced, Q14 Do's/Don'ts/Hashtags, Q16 live counter/accept events + desktop chat attachments + correct inbox stage labels
  - logic files changed: backend/campaigns_routes.ts, backend/deals_chat_routes.ts, backend/chat_routes.ts, backend/payment_routes.ts, backend/agreementRecord.ts, src/components/chat/mobile/chatStageMap.js
  - screen call groups changed: none

- 2026-10-16T07:38:40.041Z — v329 Eva round 2: campaigns_routes — brand names read only for listed brands (.in), applied check via server client; creators_routes — explore paging ordered by user_id
  - logic files changed: backend/campaigns_routes.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-16T07:38:47.786Z — v329: brand_profiles lookup in chunks of 150 ids
  - logic files changed: backend/campaigns_routes.ts
  - screen call groups changed: none

- 2026-10-16T08:29:53.762Z — Ravi: fee label Convenience fee & TDS (text only)
  - logic files changed: backend/campaign_lifecycle.ts, backend/deals_chat_routes.ts, src/lib/agreementTerms.js
  - screen call groups changed: none

- 2026-10-16T08:47:41.691Z — v332 (Ravi 'hn ek ui bna do'): payment_routes — /transactions, /escrow-transactions, /creator/payout-eligible-deals, /creator/payment-methods answer 503 PAYMENTS_UNAVAILABLE when the database can't be read (was an empty list); the app shows a calm Try again card
  - logic files changed: backend/payment_routes.ts
  - screen call groups changed: none

- 2026-10-16T10:26:57.218Z — v333 (Ravi: "har jagah 1–2 working days"): agreementTerms.js payout text only; MobilePayoutCard / ChatBoxMobile read the payout row through the shared useDealPayoutRow hook (same GET transactions, moved out of the screen) so the creator sees ₹11,700 and the receipt is never the empty duplicate row
  - logic files changed: src/lib/agreementTerms.js
  - screen call groups changed: none

- 2026-10-19T10:10:52.621Z — v347 (Ravi approved 19 Oct 2026): fix locked-file bugs found by black/white-box testing — chat lifecycle-type forgery, invite budget parsing + duplicate invite (ALREADY_IN_CAMPAIGN, Open chat link), escrow payable_net + nothing-left-after-refund, unconfirmed amount not recorded as ₹1, UGC pay callback refund check, offer/coupon fee caps, UGC agreement fee disclosure, pitch contact masking
  - logic files changed: backend/campaigns_routes.ts, backend/deals_chat_routes.ts, backend/chat_routes.ts, backend/payment_routes.ts, src/utils/feeCalculator.ts, src/lib/agreementTerms.js, backend/directInvites.ts, backend/creators_routes.ts, src/utils/invitationUtils.js
  - screen call groups changed: invite

- 2026-10-20T07:15:01.807Z — v355 (20 Oct 2026, Ravi in chat: 'ok h in pr bhi kaam kro'): chatStageMap.js — inbox chips match the chat (contract-ready → Sign contract; funded → creator 'Your turn · upload draft'; declined changes → waiting; own offer → 'Offer sent'; brand who signed → 'Waiting on creator'; creator chip no gross amount). useChatThreadMobile.js — calm error toasts (calmError), accept/counter return false on failure so the Respond sheet stays open. No server call changed.
  - logic files changed: src/components/chat/mobile/chatStageMap.js, src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-10-20T12:13:22.702Z — v359 (Ravi OK 20 Oct: 'HNN'): brand needs-action for declined UGC changes/links + campaign changes_declined; cancelled/expired/refunded orders get a grey chip and chat bar, no upload; UGC release confirm shows ₹ amount + creator name
  - logic files changed: src/components/chat/dealState.js, src/components/chat/mobile/chatStageMap.js, src/components/chat/mobile/useChatThreadMobile.js
  - screen call groups changed: none

- 2026-10-21T10:42:08.035Z — v364 split fee (Ravi: haan, locked files mein ye fee change kar do) — creator 0%, brand 8% on top + brand-fee coupons, campaign + UGC
  - logic files changed: backend/payment_routes.ts, src/utils/feeCalculator.ts, backend/ugc_routes.ts, src/components/chat/mobile/useChatThreadMobile.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-21T11:32:08.392Z — v365 fee deep-test fixes (Ravi OK)
  - logic files changed: backend/payment_routes.ts, backend/ugc_routes.ts
  - screen call groups changed: none

- 2026-10-21T12:17:27.177Z — v366 money fixes (Ravi OK)
  - logic files changed: backend/payment_routes.ts, backend/ugc_routes.ts
  - screen call groups changed: none

- 2026-10-21T12:50:25.216Z — v366 checkout redesign (Ravi OK)
  - logic files changed: src/components/chat/mobile/useChatThreadMobile.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-23T12:58:35.001Z — v375 Razorpay header: Ybex logo image + no name text (Ravi: razorpay.js mein logo aur naam change OK, 23 Oct)
  - logic files changed: src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-23T13:10:13.326Z — v375 Razorpay webview_intent: true so UPI apps show inside the Android app (Ravi written OK 23 Oct)
  - logic files changed: src/lib/razorpay.js
  - screen call groups changed: none

- 2026-10-23T13:12:23.434Z — v375 Earnings: payout-eligible-deals read without campaigns(title) embed (no FK → 400 → 'Your earnings are safe' for all creators with approved deals); titles looked up separately (Ravi written OK 23 Oct)
  - logic files changed: backend/payment_routes.ts
  - screen call groups changed: none

- 2026-10-27T08:46:21.850Z — v378 QA fixes (Ravi 27 Oct: report ke saare points + locked 4, 9, 10, 13, 14, 16, 27, 30 approve — 'hn toh shuru ho jao'): ugc_routes M1 brief private fields; campaigns_routes M6 owner-only columns, M7 view dedup, L11 not-found before already-applied, L3 no DB text; creators_routes M13 shared explore read; chat_routes L14 length + rate limit
  - logic files changed: backend/campaigns_routes.ts, backend/chat_routes.ts, backend/ugc_routes.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-10-30T10:46:18.713Z — v389 QA fixes — Ravi's written OK 30 Oct 2026 for exactly these six: (1) part refund no longer makes a second payout row (campaignGuards isPartRefundedDeposit + campaign_lifecycle net minus part refund), (2) one Razorpay payment recorded once (payment_routes per-order lock + duplicate row removal), (3) 'ugc' in a campaign title no longer makes it a UGC order (dealState.js, ChatBox.jsx), (4) UGC first draft must be a file or a real link (ugc_routes isAcceptableDraftRef), (5) notifications on counter / accept / agreement prepared / sign / request-changes (deals_chat_routes, campaign_lifecycle), (6) invite email escapes brand text and masks contact details (creators_routes)
  - logic files changed: backend/campaign_lifecycle.ts, backend/campaignGuards.ts, backend/deals_chat_routes.ts, backend/payment_routes.ts, backend/ugc_routes.ts, backend/creators_routes.ts, src/components/chat/dealState.js
  - screen call groups changed: none

- 2026-10-30T10:53:46.609Z — v389 follow-up (same Ravi OK, 30 Oct 2026, item 4): the UGC first-draft link check now runs AFTER the order-state checks, so a closed / expired order still answers 409 first (ugc_routes.ts only)
  - logic files changed: backend/ugc_routes.ts
  - screen call groups changed: none

- 2026-11-02T10:10:46.400Z — Session 74 v396, Ravi (chat, 2 Nov): 'abhi agar jada bade mazor changes nahi hai ... unhe kr de' — S-8: /payments/quote only shows a deal's amount to its own brand/creator/admin (403 NOT_YOUR_DEAL); admin escrow list maps campaigns by id and campaign_id so names show instead of 'Campaign Deal'; chat/UGC search boxes 40px tall (layout only, server calls same).
  - logic files changed: backend/payment_routes.ts
  - screen call groups changed: none

- 2026-11-04T17:37:47.630Z — v404 QA L-1 (Ravi written OK 'kr de'): /transactions shares one read per user + optional paging
  - logic files changed: backend/payment_routes.ts
  - screen call groups changed: none

- 2026-11-05T05:37:30.666Z — v407 (Ravi OK 'OK' 5 Nov): /collabs reads collabs+waves once each; creators_routes drops always-failing creator_profiles.id reads
  - logic files changed: backend/content_submissions_routes.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-11-05T05:50:35.147Z — v407 (Ravi OK): creators_routes stops creator_profiles.id reads after the column-missing error
  - logic files changed: backend/creators_routes.ts
  - screen call groups changed: none

- 2026-11-08T05:35:09.526Z — v414+v415+v416+v417+v418 (Ravi OK, 8 Nov 2026)
  - logic files changed: backend/campaigns_routes.ts, backend/campaign_lifecycle.ts, backend/campaignGuards.ts, backend/deals_routes.ts, backend/deals_chat_routes.ts, backend/chat_routes.ts, backend/content_submissions_routes.ts, backend/payment_routes.ts, backend/ugc_routes.ts, backend/campaignManage.ts, backend/directInvites.ts, backend/creators_routes.ts, src/components/chat/dealState.js, src/components/chat/mobile/chatStageMap.js, src/components/chat/mobile/useChatThreadMobile.js, src/utils/ugcOrderCancel.js, src/lib/briefPaymentRetry.js, src/lib/razorpay.js, src/lib/chatSync.js
  - screen call groups changed: chat, ugc, campaign, invite

- 2026-11-08T06:05:38.336Z — v418 Deal menu step tracker (Ravi OK, 8 Nov 2026)
  - logic files changed: src/components/chat/dealState.js
  - screen call groups changed: none

- 2026-11-08T06:19:04.314Z — v418: cancel-after-payment fix, refund notifications, tracker in Campaign status (Ravi OK, 8 Nov 2026)
  - logic files changed: backend/campaignGuards.ts, backend/payment_routes.ts
  - screen call groups changed: none

- 2026-11-08T06:27:21.300Z — v418: cancel uses its own possibly-funded check; payout check unchanged (Ravi OK)
  - logic files changed: backend/campaign_lifecycle.ts, backend/campaignGuards.ts
  - screen call groups changed: none

- 2026-11-08T09:53:21.880Z — v419: QA v406 M-3 fee refund after full deal refund; Android FCM push gated on native Firebase (1.0.12)
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-08T13:18:34.757Z — v419b: phone admin + QA fixes (paid deal amounts from payment record, hired = escrow funded, UGC signed rule, Eva fixes)
  - logic files changed: backend/deals_routes.ts
  - screen call groups changed: none

- 2026-11-08T13:21:05.304Z — v419b: paid deal amounts accept HELD/CAPTURED/PAID statuses
  - logic files changed: backend/deals_routes.ts
  - screen call groups changed: none

- 2026-11-08T14:42:09.684Z — v419c: cancellation under review state; Eva phone daily cap removed
  - logic files changed: backend/chat_routes.ts, src/components/chat/mobile/chatStageMap.js
  - screen call groups changed: none

- 2026-11-08T16:56:45.890Z — v419d: Eva safety-first replies, security hardening (AI give-back, team history, body limit, attachments, logout), KYC status, report mode
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-08T19:14:29.477Z — v419e: Eva brand filters + budget fit, creator deals/UGC/rate/script
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-08T19:36:06.516Z — v419f: Eva searches by every creator detail (state, gender split, ER, age band, barter, YouTube, verified); creator profile gets gender/DOB/barter
  - logic files changed: backend/creators_routes.ts
  - screen call groups changed: none

- 2026-11-08T20:41:59.837Z — v419g: Eva manager features (profile fill in chat, payments ETA, month report, agreement, plan, brand reply, best match) + Eva free invoice (server-saved) + admin Eva invoices
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-09T09:00:29.927Z — v419h: in-house brands (₹500 floor, Ybex-funded pay), no fee % on brand payment screens + (i) info, admin In-house brands
  - logic files changed: backend/campaigns_routes.ts, backend/deals_chat_routes.ts, backend/chat_routes.ts, backend/payment_routes.ts, backend/directInvites.ts, backend/creators_routes.ts, src/components/chat/mobile/chatStageMap.js, src/components/chat/mobile/useChatThreadMobile.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-11-09T09:11:39.674Z — v419h2: in-house quote shows ₹0, fee amount nowrap
  - logic files changed: backend/payment_routes.ts
  - screen call groups changed: none

- 2026-11-09T10:02:26.663Z — v419h3: in-house switch moved into Users → brand → Enforcement
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-09T10:30:51.502Z — v419: in-house pay PIN check (Ravi asked for a security layer on funded-by-Ybex payments)
  - logic files changed: backend/payment_routes.ts, backend/directInvites.ts, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-11-09T10:43:05.408Z — v419: waitlist duplicates (Started rows → own list, approving approves the linked account), Explore one card per Instagram, KYC from Waitlist
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-09T11:10:43.101Z — v419: checkout redesign (Ravi's Checkout.dc.html: fee (i), receipt, PDF), UPI Collect removed (NPCI), in-house PIN sheet, email Send now
  - logic files changed: src/lib/razorpay.js
  - screen call groups changed: none

- 2026-11-09T11:17:29.979Z — v419: receipt + checkout redesign, UPI Collect removed (NPCI)
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-09T21:59:00.626Z — v419 round 2: short email subjects + profile card email (Ravi), KYC subject fix, admin hubs, waitlist cleanup, IG auto refresh 50/day active only
  - logic files changed: backend/ugc_routes.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-11-09T23:00:43.476Z — v420 (Ravi 10 Nov): special offer — ₹2,000 minimum for UGC and every paid deal / chat offer (usually ₹3,000)
  - logic files changed: backend/campaigns_routes.ts, backend/deals_chat_routes.ts, backend/ugc_routes.ts, backend/directInvites.ts, src/components/chat/mobile/chatStageMap.js
  - screen call groups changed: none

- 2026-11-09T23:07:11.533Z — v420: ₹2,000 floor; Ybex in-house brands keep ₹500 on UGC
  - logic files changed: backend/ugc_routes.ts
  - screen call groups changed: none

- 2026-11-10T09:02:17.102Z — v422 (Supabase free egress ran out): auth user row cached 15 s for onboarded users; slower background polls
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-10T10:02:03.240Z — v423 (Ravi 10 Nov — payments bug report P1-P17 + brand security report S1-S16/E1-E2 + appendix; Ravi asked to fix all, incl. locked files)
  - logic files changed: backend/campaigns_routes.ts, backend/signingEmail.ts, backend/payment_routes.ts, backend/ugc_routes.ts, src/lib/briefPaymentRetry.js, src/lib/razorpay.js
  - screen call groups changed: none

- 2026-11-10T10:31:05.063Z — v423 (Ravi 10 Nov): payments + brand security reports and independent QA follow-ups
  - logic files changed: backend/signingEmail.ts, backend/payment_routes.ts, backend/ugc_routes.ts, src/lib/briefPaymentRetry.js
  - screen call groups changed: none

- 2026-11-10T10:49:28.798Z — v424: maintenance lets app live-update through; Help sheet
  - logic files changed: none
  - screen call groups changed: none

- 2026-11-11T14:17:24.127Z — v427 Ravi approved (haan kr do): UGC agreement Deliverable clause follows brief format (edited/raw/collab)
  - logic files changed: src/lib/agreementTerms.js
  - screen call groups changed: none

- 2026-11-11T21:43:16.565Z — v429 (Ravi OK 12 Nov): Explore + campaign applicants read creators without Instagram posts; Explore cache 10 min (was 1 min) — Supabase egress
  - logic files changed: backend/campaigns_routes.ts, backend/creators_routes.ts
  - screen call groups changed: none

- 2026-11-11T22:12:52.579Z — v429 (Ravi: 'jo ho sakta hai karo bas egress kam karo'): Explore keeps its list when a tiny count+newest-change check shows nothing new; full read at least hourly
  - logic files changed: backend/creators_routes.ts
  - screen call groups changed: none
