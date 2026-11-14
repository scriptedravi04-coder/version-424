// Session 41 — data for the phone "Quick action" popup. Pure functions so they can be tested.
import { maskContact } from "../../utils/maskContact";

const money = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString("en-IN")}` : null;
};

const PENDING_APP = new Set(["pending", "applied", "under_review", "submitted", "new"]);

/** GET creators/invitations → cards for invites still waiting for the creator. */
export function buildCreatorInviteActions(resp) {
  const list = Array.isArray(resp?.pending)
    ? resp.pending
    : (Array.isArray(resp?.invitations) ? resp.invitations : Array.isArray(resp) ? resp : [])
        .filter((i) => i && i.status === "pending_creator_acceptance");
  return list
    .filter((i) => i && i.id)
    .map((i) => {
      const budget = money(i.proposed_budget) || (i.proposed_budget && i.proposed_budget !== "Negotiable" ? String(i.proposed_budget) : null);
      const deliverables = i.deliverables && i.deliverables !== "Standard Deliverables" ? String(i.deliverables) : null;
      const timeline = i.timeline && i.timeline !== "Flexible" ? String(i.timeline) : null;
      const facts = [budget, deliverables, timeline].filter(Boolean);
      // Session 43 (Ravi): the card shows the full invite — big amount + a short details list.
      const amount = money(i.amount) || budget || (i.budget_range ? String(i.budget_range) : null);
      const count = Number(i.deliverables_count) || 0;
      const sent = i.created_at ? new Date(i.created_at) : null;
      const details = [
        i.campaign_title ? { label: "Campaign", value: String(i.campaign_title) } : null,
        deliverables ? { label: "Deliverables", value: deliverables } : count > 0 ? { label: "Deliverables", value: `${count} deliverable${count > 1 ? "s" : ""}` } : null,
        timeline ? { label: "Timeline", value: timeline } : null,
        sent && !Number.isNaN(sent.getTime()) ? { label: "Invited on", value: sent.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) } : null,
      ].filter(Boolean);
      return {
        id: `invite:${i.id}`,
        kind: "invite",
        raw: i,
        title: i.brand_name || "A brand",
        subtitle: i.campaign_title ? `Campaign · ${i.campaign_title}` : "Campaign invite",
        verified: Boolean(i.brand_verified || i.kyc_verified),
        photo: i.brand_logo || "",
        profileHref: i.brand_id ? `/brand/${encodeURIComponent(i.brand_id)}` : "", // v430: tap photo / name → brand profile
        headline: `${i.brand_name || "A brand"} invited you to their campaign`,
        facts,
        amount,
        details,
        description: i.campaign_description ? String(i.campaign_description) : "",
        note: i.notes || i.message || i.pitch || "",
        acceptLabel: "Accept & open chat",
      };
    });
}

/** [{ c: campaign, apps: GET /campaigns/:id/applications }] → cards for applications waiting for the brand. */
export function buildBrandApplicationActions(groups) {
  const out = [];
  for (const g of groups || []) {
    const c = g?.c || {};
    const apps = Array.isArray(g?.apps) ? g.apps : Array.isArray(g?.apps?.applications) ? g.apps.applications : [];
    const campaignId = c.campaign_id || c.id;
    for (const a of apps) {
      if (!a || !a.application_id) continue;
      if (!PENDING_APP.has(String(a.status || "").toLowerCase())) continue;
      const facts = [money(a.proposed_amount) ? `Quote ${money(a.proposed_amount)}` : null,
        a.followers_count && a.followers_count !== "0" ? `${a.followers_count} followers` : null,
        a.niche || null].filter(Boolean);
      out.push({
        id: `app:${a.application_id}`,
        kind: "application",
        raw: a,
        campaignId,
        title: a.full_name || "A creator",
        subtitle: (a.instagram_handle || a.handle) ? `@${String(a.instagram_handle || a.handle).replace(/^@+/, "")}` : "Creator",
        verified: Boolean(a.kyc_details?.verified || a.kyc_verified),
        photo: a.profile_photo_url || "",
        profileHref: a.creator_id ? `/creator/${encodeURIComponent(a.creator_id)}` : "", // v430: tap photo / name → Ybex profile
        headline: c.title ? "New application to your campaign" : "Applied to your campaign", // v415: the title is already in the Campaign row below (it showed twice)
        facts,
        amount: money(a.proposed_amount),
        amountLabel: "Their quote",
        details: [
          c.title ? { label: "Campaign", value: String(c.title) } : null,
          a.followers_count && a.followers_count !== "0" ? { label: "Followers", value: String(a.followers_count) } : null,
          a.niche ? { label: "Niche", value: String(a.niche) } : null,
        ].filter(Boolean),
        note: maskContact(a.pitch_text || a.pitch || ""), // v346: brand never sees a phone/email typed in the pitch
        acceptLabel: "Accept & open chat",
      });
    }
  }
  return out;
}

// No popup inside chats, onboarding, sign-in pages or the admin panel.
export function quickActionHiddenOn(path = "") {
  const p = String(path || "");
  return p.startsWith("/chat") || p.includes("/inbox") || p.startsWith("/onboarding") || p.startsWith("/login")
    || p.startsWith("/signup") || p.startsWith("/verify") || p.startsWith("/admin") || p === "/"
    || p.startsWith("/help") || p.startsWith("/support"); // v415: never over the Help Centre / support tickets
}

// Session 41 (point 28) — deals where it is YOUR turn, using exactly the inbox chip logic
// (getInboxChip: "Sign contract", "Awaiting your review", "Your turn · reupload", …).
// These cards only open the chat — the actual step (sign / review / reupload) happens there.
export function buildDealTurnActions(threads, isBrand, getInboxChip) {
  const out = [];
  for (const t of Array.isArray(threads) ? threads : []) {
    if (!t || !t.id) continue;
    let chip = null;
    try { chip = getInboxChip(t, isBrand); } catch { chip = null; }
    if (!chip || !chip.needsAction) continue;
    if (/waiting|declined|expired/i.test(chip.label || "")) continue;
    const other = isBrand ? t.creator : t.brand;
    const name = isBrand
      ? other?.name || other?.full_name || other?.profile?.full_name || "Creator"
      : other?.company_name || other?.profile?.company_name || other?.name || "Brand";
    const photo = isBrand
      ? other?.photo || other?.picture || other?.avatar_url || other?.profile_photo_url || other?.profile?.photo || "" // v358: + profile_photo_url
      : other?.logo || other?.logo_url || other?.profile?.logo || "";
    const what = t.campaign_title || t.ugc_title || t.ugc_order?.title || t.ugc_brief?.title || "Your deal";
    out.push({
      id: `deal:${t.id}:${chip.key}`,
      kind: "deal",
      raw: t,
      threadId: t.id,
      title: name,
      subtitle: what,
      verified: Boolean(other?.kyc_verified || other?.verified),
      photo,
      headline: chip.label,
      facts: [],
      note: "",
      acceptLabel: "Open chat",
    });
  }
  return out.slice(0, 8);
}
