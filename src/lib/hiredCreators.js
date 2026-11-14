// Session 33: "Hired" on the brand's applicants screen. Applications only ever get
// pending / ACCEPTED / REJECTED, so a tab that looked for "hired" stayed at 0 forever.
// Hired = the campaign deal for that creator has escrow funded (the deal room moved past
// signing + payment). Read from the brand's chat threads (GET chat/v2/threads).
export const FUNDED_FLOW_STATES = new Set([
  "ACTIVE", "SUBMITTED", "CHANGES_REQUESTED", "REVISION_REQ", "REVISION_DECLINED", "CONTENT_APPROVED",
  "PROOF_SUBMITTED", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "COMPLETED",
  "ESCROW_FUNDED", "ESCROW_HELD", "FUNDED", // v419 (QA): a paid creator stayed under "Shortlisted"
]);

export function hiredCreatorIds(threads, campaignId) {
  const out = new Set();
  for (const t of Array.isArray(threads) ? threads : []) {
    if (!t || String(t.campaign_id || "") !== String(campaignId || "")) continue;
    const state = String(t.flow_state || t.status || "").toUpperCase();
    const funded = t.escrow_funded === true || String(t.escrow_status || t.payment_status || "").toLowerCase() === "funded";
    if ((funded || FUNDED_FLOW_STATES.has(state)) && t.creator_id) out.add(String(t.creator_id));
  }
  return out;
}
