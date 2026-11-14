// Session 28 (Ravi): Campaign, UGC and Invite-to-campaign work end to end (tested on the deployed
// build). We are close to launch, and the next work is mobile UI. This file locks those three
// flows so no AI tool (Claude, AI Studio/Gemini, anyone) changes their logic by accident.
//
// Two locks, both checked by `npm run verify` (backend/protectedFlows.test.ts):
//   1. LOGIC FILES are frozen by content hash. Any edit fails the tests.
//   2. SCREEN FILES of these flows may change (layout, colours, text), but the set of server
//      calls they make (method + path) may not. Removing, adding or renaming a call fails.
//
// Only Ravi can unlock:  npm run protect:update -- --reason "what Ravi approved"
// That rewrites scripts/protected/manifest.json and appends to docs/code/PROTECTED_CHANGES.md.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST = "scripts/protected/manifest.json";

/** Server + shared logic. Frozen: not one character may change without Ravi. */
export const LOGIC_FILES = [
  // campaign
  "backend/campaigns_routes.ts", "backend/campaign_lifecycle.ts", "backend/campaignGuards.ts",
  "backend/creatorKyc.ts",
  // deals / chat / contract / delivery (shared by all three flows)
  "backend/dealFlow.ts", "backend/deals_routes.ts", "backend/deals_chat_routes.ts", "backend/chat_routes.ts",
  "backend/content_submissions_routes.ts", "backend/threadSync.ts", "backend/signTokens.ts", "backend/signingEmail.ts",
  "backend/payment_routes.ts", "src/utils/feeCalculator.ts",
  // signature records (session 28)
  "backend/agreementRecord.ts", "backend/admin_agreements_routes.ts", "src/lib/agreementCapture.js", "src/lib/agreementTerms.js",
  // UGC
  "backend/ugc_routes.ts", "backend/ugcSlots.ts", "backend/ugcOrderStage.ts",
  // campaign manage — pause / close / matching creators (session 30, Ravi approved)
  "backend/campaignManage.ts",
  // invite to campaign
  "backend/directInvites.ts", "backend/creators_routes.ts",
  // browser-side flow logic (no layout in these files)
  "src/components/chat/dealState.js", "src/components/chat/chatFlowState.js", "src/components/chat/orderTicket.js",
  "src/components/chat/mobile/chatStageMap.js", "src/components/chat/mobile/useChatThreadMobile.js",
  "src/utils/dealFlow.js", "src/utils/ugcOrderCancel.js", "src/utils/ugcTerms.js", "src/utils/invitationUtils.js",
  "src/utils/orderSort.js", "src/utils/kycStatus.js", "src/utils/campaignStats.js",
  "src/lib/contractOtp.js", "src/lib/briefPaymentRetry.js", "src/lib/razorpay.js", "src/lib/chatSync.js",
];

/** Screens of the three flows. Design may change; the server calls each file makes may not. */
export const SCREEN_GROUPS = {
  chat: [
    "src/components/chat/ChatBox.jsx", "src/components/chat/ShortlistCards.jsx", "src/components/chat/MessageBubble.jsx",
    "src/components/chat/OfferCard.jsx", "src/components/chat/NegotiationTable.jsx", "src/components/chat/AgreementSign.jsx",
    "src/components/chat/BrandAgreement.jsx", "src/components/chat/ContractModal.jsx", "src/components/chat/UGCContractModal.jsx",
    "src/components/chat/SendBrief.jsx", "src/components/chat/SystemMessage.jsx", "src/components/chat/ContentProofNotice.jsx",
    "src/components/chat/DealInfoPanel.jsx", "src/components/chat/OrderSupportModal.jsx", "src/components/chat/BurgerMenuSupport.jsx",
    "src/components/chat/mobile/ChatBoxMobile.jsx", "src/components/chat/mobile/MobileBriefCards.jsx",
    "src/components/chat/mobile/MobileChangesCard.jsx", "src/components/chat/mobile/MobileContractCard.jsx",
    "src/components/chat/mobile/MobileContractSheet.jsx", "src/components/chat/AgreementTermsPanel.jsx", "src/components/chat/mobile/MobileDeclinedCard.jsx",
    "src/components/chat/mobile/MobileDeliverableCard.jsx", "src/components/chat/mobile/MobileEscrowFundedCard.jsx",
    "src/components/chat/mobile/MobileEscrowSheet.jsx", "src/components/chat/mobile/MobileEventRow.jsx",
    "src/components/chat/mobile/MobileLiveLinkSheet.jsx", "src/components/chat/mobile/MobileLiveLinksCard.jsx",
    "src/components/chat/mobile/MobileMessageRow.jsx", "src/components/chat/mobile/MobileOfferCard.jsx",
    "src/components/chat/mobile/MobileOrderSupportSheet.jsx", "src/components/chat/mobile/MobilePayoutCard.jsx",
    "src/components/chat/mobile/MobileRatingSheet.jsx", "src/components/chat/mobile/MobileRequestChangesSheet.jsx",
    "src/components/chat/mobile/MobileShortlistCards.jsx", "src/components/chat/mobile/MobileUploadSheet.jsx",
    "src/components/deals/SlaAgreementOtpModal.jsx", "src/pages/collabs/DealDetail.jsx",
  ],
  ugc: [
    "src/pages/brand/BrandUGCOrders.jsx", "src/pages/brand/BrandUGCPost.jsx", "src/pages/brand/BrandUGCMobile.jsx",
    "src/pages/brand/BrandInstantUGC.jsx", "src/pages/brand/BrandUGCBriefs.jsx", "src/pages/creator/CreatorUGCMobile.jsx",
    "src/pages/creator/CreatorUGCOrders.jsx", "src/pages/creator/ManageUGCOrdersView.jsx", "src/pages/creator/CreatorUGCBrowse.jsx",
    "src/pages/ugc/UgcOrders.jsx", "src/components/ugc/BrandCancelOrderModal.jsx", "src/components/ugc/CreatorCancelOrderSheet.jsx",
    "src/components/brand/CancelBriefModal.jsx", "src/components/brand/BriefRefundStatus.jsx",
  ],
  campaign: [
    "src/pages/brand/BrandCampaignCreate.jsx", "src/pages/brand/BrandCampaigns.jsx", "src/pages/brand/BrandCampaignApplicants.jsx",
    "src/components/campaigns/mobile/MobileCampaignCreate.jsx", "src/pages/campaigns/CampaignDetail.jsx",
    "src/pages/creator/CreatorCampaignFlow.jsx",
    "src/components/campaigns/mobile/BrandCampaignsMobile.jsx", "src/components/campaigns/mobile/BrandCampaignDetailMobile.jsx",
  ],
  invite: [
    "src/components/campaigns/InviteToCampaignModal.jsx", "src/components/campaigns/CreatorReviewInvitationModal.jsx",
    "src/components/campaigns/MobileCreatorInvites.jsx",
  ],
};

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
export const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
export const hashOf = (rel) => crypto.createHash("sha256").update(read(rel)).digest("hex");

/** "POST /campaigns/:x/submit-draft" style list of every server call written in a file. */
export function serverCallsIn(rel) {
  const src = read(rel);
  const out = new Set();
  const norm = (p) => p
    .replace(/\$\{[^}]*\}/g, ":x")
    .replace(/\?.*$/, "")
    .replace(/^\/?api\//, "/")
    .replace(/^(?!\/)/, "/")
    .replace(/\/+$/, "") || "/";
  const re = /\bapi\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
  let m;
  while ((m = re.exec(src))) out.add(`${m[1].toUpperCase()} ${norm(m[2].slice(1, -1))}`);
  const fre = /\bfetch\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
  while ((m = fre.exec(src))) {
    const p = m[1].slice(1, -1);
    if (/\/api\//.test(p) || p.startsWith("/")) out.add(`FETCH ${norm(p.replace(/^.*?\/api\//, "/api/"))}`);
  }
  // Endpoints built in a variable first (`const endpoint = isUgc ? `/ugc/..` : `/deals/..``) are
  // caught here: any path-looking string for these flows counts as a server call.
  const pre = /(`|'|")\/?((?:api\/)?(?:ugc|ugc-videos|ugc-orders|deals|campaign|campaigns|campaign-deliverables|chat|creators|content-submissions|payments|payouts|escrow|razorpay|otp|contract|applications|briefs|invitations|upload|verifications|platform|disputes|reviews|support|notifications|kyc|ai)\/[^`'"\s]*)\1/g;
  while ((m = pre.exec(src))) out.add(`PATH ${norm(m[2])}`);
  return out;
}

export function currentState() {
  const logic = {};
  for (const f of LOGIC_FILES) logic[f] = exists(f) ? hashOf(f) : "MISSING";
  // Per file (not per flow): if one card stops making a call that another card still makes, that
  // is still a behaviour change. Moving a call into a new file needs Ravi's OK + protect:update.
  const screens = {};
  for (const [group, files] of Object.entries(SCREEN_GROUPS)) {
    screens[group] = {};
    for (const f of files) screens[group][f] = exists(f) ? [...serverCallsIn(f)].sort() : ["MISSING"];
  }
  return { logic, screens };
}

// CLI: node scripts/protectedFlows.mjs --update --reason "..."
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--reason");
  const reason = i >= 0 ? args.slice(i + 1).join(" ").trim() : "";
  if (!args.includes("--update") || reason.length < 10) {
    console.error("Usage: npm run protect:update -- --reason \"what Ravi approved (at least 10 characters)\"");
    console.error("Only Ravi can approve changes to the Campaign / UGC / Invite flows. AI tools: do NOT run this on your own.");
    process.exit(1);
  }
  const before = fs.existsSync(path.join(ROOT, MANIFEST)) ? JSON.parse(read(MANIFEST)) : { logic: {}, screens: {} };
  const now = currentState();
  const changed = Object.keys(now.logic).filter((f) => before.logic?.[f] !== now.logic[f]);
  const screenDiff = Object.keys(now.screens).filter((g) => JSON.stringify(before.screens?.[g] || []) !== JSON.stringify(now.screens[g]));
  const manifest = { note: "Generated by npm run protect:update. Do not edit by hand.", updated_at: new Date().toISOString(), reason, ...now };
  fs.writeFileSync(path.join(ROOT, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  const log = path.join(ROOT, "docs/code/PROTECTED_CHANGES.md");
  const line = `\n- ${manifest.updated_at} — ${reason}\n  - logic files changed: ${changed.join(", ") || "none"}\n  - screen call groups changed: ${screenDiff.join(", ") || "none"}\n`;
  fs.appendFileSync(log, line);
  console.log(`Protected manifest updated. Logic changed: ${changed.length}, screen groups changed: ${screenDiff.length}. Logged in docs/code/PROTECTED_CHANGES.md.`);
}
