// v396 (Ravi): what the admin search box can find. Pure functions — tested in src/v396AdminFixes.test.js.
// Sections = the left menu; settings = the Platform Settings tabs (with the words people type for them).

export const ADMIN_SECTIONS = [
  { id: "dashboard", title: "Overview", words: "home dashboard stats analytics overview", to: "/admin?tab=dashboard" },
  { id: "users", title: "All users", words: "users accounts people members", to: "/admin?tab=users&role=all" },
  { id: "creators", title: "Creators", words: "creators influencers creator directory", to: "/admin?tab=users&role=creator" },
  { id: "brands", title: "Brands", words: "brands companies brand directory", to: "/admin?tab=users&role=brand" },
  { id: "agencies", title: "Agencies", words: "agencies agency", to: "/admin?tab=users&role=agency" },
  { id: "unclaimed", title: "Unclaimed creators", words: "unclaimed shadow profiles", to: "/admin?tab=users&role=unclaimed" },
  { id: "admins", title: "Admins & sub-admins", words: "admins sub admin team staff permissions", to: "/admin?tab=users&role=admin" },
  { id: "bin", title: "Recycle bin (deleted accounts)", words: "bin deleted restore recycle", to: "/admin?tab=users&role=deleted" },
  { id: "waitlist", title: "Waitlist (approve creators)", words: "waitlist approve approvals pending applications reject review", to: "/admin?tab=waitlist" },
  { id: "min-followers", title: "Minimum followers to join", words: "minimum followers limit 500 follower lock gate low followers work link creator sign-up signup", to: "/admin?tab=settings&view=signup" }, // v397
  { id: "kyc", title: "KYC checks", words: "kyc verification pan documents identity verify", to: "/admin?tab=verifications" },
  { id: "campaigns", title: "Campaign approvals", words: "campaigns campaign review queue approve brand campaigns", to: "/admin?tab=campaigns" },
  { id: "pitches", title: "Pitch leads", words: "pitch leads pitches", to: "/admin?tab=pitches" },
  { id: "invoices", title: "Eva invoices", words: "eva invoices invoice leads brands billing rates", to: "/admin?tab=invoices" },
  { id: "challenge", title: "Challenge entries (Diwali)", words: "challenge diwali entries contest reels winners recharge", to: "/admin?tab=challenge" },
  { id: "chat", title: "Chat moderation", words: "chat moderation messages flagged", to: "/admin?tab=chat" },
  { id: "reports", title: "Reports & disputes", words: "reports disputes complaints issues system reports", to: "/admin?tab=reports" },
  { id: "payments", title: "Payouts & refunds (payments)", words: "payments payouts escrow money refunds transactions settlement", to: "/admin?tab=escrow" },
  { id: "ugc", title: "UGC orders", words: "ugc orders briefs videos ugc refunds", to: "/admin?tab=ugc-orders" },
  { id: "logs", title: "Activity logs", words: "logs activity audit history active logs", to: "/admin?tab=activity-logs" },
  { id: "blog", title: "Blogs & content", words: "blog blogs articles content posts seo", to: "/admin?tab=blog" },
  { id: "push", title: "Push notifications", words: "push notifications notification send phones", to: "/admin?tab=push" },
  { id: "helpdesk", title: "Help desk (support tickets)", words: "help desk support tickets helpdesk", to: "/admin?tab=helpdesk" },
  { id: "feedback", title: "Eva feedback", words: "eva chatbot feedback bot", to: "/admin?tab=feedback" },
  { id: "settings", title: "Platform settings", words: "settings platform tools config", to: "/admin?tab=settings" },
];

// v419 (Ravi: "admin messy hai — saaf karo"): THE admin menu. The desktop sidebar, the phone "More" screen and the
// side drawer all draw from this one list (they used to keep 6 separate copies that disagreed). Groups:
// Overview · Daily work · Users · Money · Orders & leads · Marketing · Developer (full admin only).
// item: { id, label, tab, view?, role?, perm, icon, badge? (adminPendingCounts key), full? (full admin only) }
export const ADMIN_NAV = [
  { group: "", items: [{ id: "dashboard", label: "Overview", tab: "dashboard", perm: "view_analytics", icon: "overview" }] },
  { group: "Daily work", items: [
    { id: "waitlist", label: "Waitlist", tab: "waitlist", perm: "manage_waitlist", icon: "waitlist", badge: "waitlist" },
    { id: "verifications", label: "KYC checks", tab: "verifications", perm: "manage_kyc", icon: "kyc", badge: "kyc" },
    { id: "campaigns", label: "Campaign approvals", tab: "campaigns", perm: "manage_campaigns", icon: "campaigns", badge: "campaigns" },
    { id: "escrow", label: "Payouts & refunds", tab: "escrow", perm: "manage_escrow", icon: "money", badge: "escrow" },
  ] },
  // v419 (Ravi): Help desk + Eva feedback + Reports + Chat moderation = one "Support & safety" page (row sits in Daily work)
  { group: "Support & safety", hub: "support", foldInto: "Daily work", icon: "help", desc: "Help desk tickets, Eva feedback, reports & disputes and chat moderation", items: [
    { id: "helpdesk", label: "Help desk", tab: "helpdesk", perm: "manage_helpdesk", icon: "help", badge: "helpdesk" },
    { id: "feedback", label: "Eva feedback", tab: "feedback", perm: "manage_helpdesk", icon: "bot" },
    { id: "reports", label: "Reports & disputes", tab: "reports", perm: "manage_disputes", icon: "reports", badge: "reports" },
    { id: "chat", label: "Chat moderation", tab: "chat", perm: "manage_chat", icon: "chat" },
  ] },
  // v419 (Ravi): one "Users" row that opens a small list (All users, Brands, Agencies, Creators, Unclaimed, Admins, Bin)
  { group: "Users", collapsible: true, icon: "users", items: [
    { id: "users", label: "All users", tab: "users", role: "all", perm: "manage_users", icon: "users" },
    { id: "brands", label: "Brands", tab: "users", role: "brand", perm: "manage_users", icon: "users" },
    { id: "agencies", label: "Agencies", tab: "users", role: "agency", perm: "manage_users", icon: "users" },
    { id: "creators", label: "Creators", tab: "users", role: "creator", perm: "manage_users", icon: "users" },
    { id: "unclaimed", label: "Unclaimed creators", tab: "users", role: "unclaimed", perm: "manage_users", icon: "users" },
    { id: "admins", label: "Admins", tab: "users", role: "admin", perm: "manage_users", icon: "users", full: true },
    { id: "bin", label: "Recycle bin", tab: "users", role: "deleted", perm: "manage_users", icon: "users", full: true },
  ] },
  { group: "Money", hub: "money", icon: "money", desc: "Fees, coupons, referrals and Eva invoices", items: [
    { id: "fees", label: "Fees & limits", tab: "settings", view: "fees", perm: "manage_settings", icon: "money" },
    { id: "coupons", label: "Coupons", tab: "settings", view: "coupons", perm: "manage_settings", icon: "coupon" },
    { id: "referrals", label: "Referral program", tab: "settings", view: "referrals", perm: "manage_settings", icon: "coupon" },
    { id: "invoices", label: "Eva invoices", tab: "invoices", perm: "manage_campaigns", icon: "invoice" },
  ] },
  { group: "Orders & leads", hub: "orders", icon: "ugc", desc: "UGC orders and pitch leads", items: [
    { id: "ugc-orders", label: "UGC orders", tab: "ugc-orders", perm: "manage_ugc", icon: "ugc" },
    { id: "pitches", label: "Pitch leads", tab: "pitches", perm: "manage_campaigns", icon: "leads", badge: "pitches" },
  ] },
  { group: "Marketing", hub: "marketing", icon: "promo", desc: "Blogs, push, emails, popups, banners, landing page and challenge entries", items: [
    { id: "blog", label: "Blogs & content", tab: "blog", perm: "manage_blog", icon: "blog" },
    { id: "push", label: "Push notifications", tab: "push", perm: "manage_blog", icon: "push" },
    { id: "broadcast", label: "Email broadcast", tab: "settings", view: "broadcast", perm: "manage_settings", icon: "mail" },
    { id: "promos", label: "Promo popups", tab: "settings", view: "promos", perm: "manage_settings", icon: "promo" },
    { id: "banners", label: "Banners", tab: "settings", view: "banners", perm: "manage_settings", icon: "promo" },
    { id: "landing", label: "Landing page", tab: "settings", view: "landing", perm: "manage_settings", icon: "promo" },
    { id: "challenge", label: "Challenge entries", tab: "challenge", perm: "manage_users", icon: "trophy" },
  ] },
  { group: "Developer", hub: "developer", icon: "tools", desc: "What's new, sign-up rules, maintenance, speed, logs and every setting", items: [
    { id: "whats-new", label: "What's new", tab: "settings", view: "whats-new", perm: "manage_settings", icon: "sparkle" },
    { id: "hiw-videos", label: "How it works", tab: "settings", view: "hiw-videos", perm: "manage_settings", icon: "sparkle", full: true }, // v436: tutorial videos (full admins)
    { id: "signup", label: "Creator sign-up rules", tab: "settings", view: "signup", perm: "manage_settings", icon: "waitlist" },
    { id: "maintenance", label: "Maintenance mode", tab: "settings", view: "maintenance", perm: "manage_settings", icon: "tools" },
    { id: "speed", label: "Speed report", tab: "settings", view: "speed", perm: "manage_settings", icon: "speed" },
    { id: "activity-logs", label: "Activity logs", tab: "activity-logs", perm: "manage_logs", icon: "logs" },
    { id: "settings", label: "All settings", tab: "settings", perm: "manage_settings", icon: "settings", full: true },
  ] },
];
// v419 (Ravi: "Marketing pe click karo to proper Marketing page khule, purana Platform settings nahi"): Money, Orders &
// leads, Marketing and Developer are real pages ("hubs") — /admin?tab=marketing&view=push — with their own tab bar.
// Each item remembers where its screen comes from (srcTab / srcView) so the hub can draw it.
for (const g of ADMIN_NAV) {
  if (!g.hub) continue;
  g.items.forEach((it, i) => {
    it.srcTab = it.tab; it.srcView = it.view;
    it.tab = g.hub; it.view = it.id; it.hub = g.hub; it.hubFirst = i === 0;
  });
}
/** v419 (Ravi: "Money ke andar tabs hain to sidebar mein unke naam kyun?"): a hub shows as ONE menu row; its tools are
 *  the tabs on its page. Returns the menu with hub groups folded into a single item each. */
export function adminNavFolded(groups, { collapseUsers = true } = {}) {
  const out = [];
  let tools = null;
  for (const g of groups || []) {
    if (g.hub) {
      const item = { id: `hub-${g.hub}`, label: g.group, tab: g.hub, icon: g.icon || "settings", hubRow: true, badges: g.items.map((i) => i.badge).filter(Boolean) };
      const host = g.foldInto && out.find((x) => x.group === g.foldInto);
      if (host) { host.items = [...host.items, item]; continue; }
      if (!tools) { tools = { group: "Tools", items: [] }; out.push(tools); }
      tools.items.push(item);
      continue;
    }
    if (g.collapsible && collapseUsers) {
      out.push({ group: "", items: [{ id: `menu-${g.group.toLowerCase()}`, label: g.group, icon: g.icon || "users", tab: g.items[0]?.tab, children: g.items }] });
      continue;
    }
    out.push({ ...g }); // copy — folding must never change ADMIN_NAV itself
  }
  return out;
}

/** The hub (group) for "/admin?tab=<hub>" or null. */
export const adminHub = (id) => ADMIN_NAV.find((g) => g.hub && g.hub === id) || null;
export const ADMIN_HUB_IDS = ADMIN_NAV.filter((g) => g.hub).map((g) => g.hub);

/** "/admin?tab=…&view=…&role=…" for a menu item. */
export const adminNavTo = (it) => `/admin?tab=${it.tab}${it.view ? `&view=${it.view}` : ""}${it.role ? `&role=${it.role}` : ""}`;
/** The menu this staff member may see: can(perm) → boolean, full → full admin. Empty groups are dropped. */
export function adminNavFor(can, full, itemOk = null) { // v419: itemOk(item) = exact per-item check (settings tabs)
  return ADMIN_NAV.filter((g) => !g.full || full)
    .map((g) => ({ ...g, items: g.items.filter((it) => (!it.full || full) && (itemOk ? itemOk(it) : can(it.perm))) }))
    .filter((g) => g.items.length);
}
/** Is this menu item the page that's open? (tab + view + role must match what the item sets) */
export function adminNavActive(it, search) {
  const q = new URLSearchParams(search || "");
  if ((q.get("tab") || "dashboard") !== it.tab) return false;
  if (it.hubRow) return true; // v419: the folded hub row is open for any of its tabs
  if (it.hub) return q.get("view") ? q.get("view") === it.id : Boolean(it.hubFirst); // v419 hubs
  if (it.view && q.get("view") !== it.view) return false;
  if (it.tab === "settings" && !it.view && q.get("view")) return false;
  if (it.role && (q.get("role") || "all") !== it.role) return false;
  return true;
}

export const ADMIN_SETTINGS = [
  { id: "broadcast", title: "Email broadcast", words: "email broadcast newsletter resend mail send email", to: "/admin?tab=settings&view=broadcast" },
  { id: "maintenance", title: "Maintenance mode", words: "maintenance down offline mode", to: "/admin?tab=settings&view=maintenance" },
  { id: "fees", title: "Fees & risk controls", words: "fees fee commission gst payout freeze withdrawal budget split brand fee creator fee", to: "/admin?tab=settings&view=fees" },
  { id: "coupons", title: "Coupons", words: "coupons coupon promo code discount", to: "/admin?tab=settings&view=coupons" },
  { id: "referrals", title: "Referral program", words: "referral referrals invite rewards wallet", to: "/admin?tab=settings&view=referrals" },
  { id: "whats-new", title: "What's new messages", words: "whats new version update message release notes", to: "/admin?tab=settings&view=whats-new" },
  { id: "promos", title: "Promo popups", words: "popup popups promo poster pop up", to: "/admin?tab=settings&view=promos" },
  { id: "banners", title: "Banners", words: "banners banner home poster", to: "/admin?tab=settings&view=banners" },
  { id: "landing", title: "Landing page content", words: "landing page homepage website reviews brands logos", to: "/admin?tab=settings&view=landing" },
  { id: "hiw-videos", title: "How it works videos", words: "how it works videos tutorial youtube playlist hiw", to: "/admin?tab=settings&view=hiw-videos" },
  { id: "speed", title: "Speed report", words: "speed slow performance api report", to: "/admin?tab=settings&view=speed" },
];

const low = (v) => String(v ?? "").toLowerCase();
const has = (hay, q) => low(hay).includes(q);

/** Pure: score 0 (no match) … 3 (starts with). */
function score(fields, q) {
  let best = 0;
  for (const f of fields) {
    const s = low(f);
    if (!s) continue;
    if (s === q) return 4;
    if (s.startsWith(q)) best = Math.max(best, 3);
    else if (s.split(/[\s@._-]+/).some((w) => w.startsWith(q))) best = Math.max(best, 2);
    else if (s.includes(q)) best = Math.max(best, 1);
  }
  return best;
}

/** Pure: kind of a user row from /admin/users. */
export function userKind(u) {
  if (!u) return "creator";
  if (u.role === "admin" || u.team_role === "sub_admin" || u.role === "sub_admin") return "admin";
  if (u.role === "brand") return (u.is_agency === true || u.brand_profile?.is_agency === true) ? "agency" : "brand";
  const unclaimed = u.is_unclaimed === true || u.auth_method === "unclaimed" || u.creator_profile?.is_claimed === false;
  return unclaimed ? "unclaimed" : "creator";
}

/** Pure: results for the box. `data` = { users, waitlist, campaigns } (may be null while loading). Max ~24. */
export function searchAdmin(query, data) {
  const q = low(query).trim().replace(/^@/, "");
  if (!q) return [];
  const out = [];
  const pushStatic = (list, kind) => {
    for (const it of list) {
      const s = Math.max(score([it.title], q), has(it.words, q) ? 2 : 0);
      if (s) out.push({ kind, id: it.id, title: it.title, sub: kind === "setting" ? "Platform settings" : "Open section", to: it.to, s: s + 0.5 });
    }
  };
  pushStatic(ADMIN_SECTIONS, "section");
  pushStatic(ADMIN_SETTINGS, "setting");
  if (q.length >= 2 && data) {
    const people = [];
    for (const u of data.users || []) {
      if (!u || u.is_deleted) continue;
      const cp = u.creator_profile || {}, bp = u.brand_profile || {};
      const name = u.role === "brand" ? (bp.company_name || u.brand_setup?.company_name || u.name) : (u.name || cp.name);
      const handle = cp.instagram_handle || bp.instagram_handle || "";
      const s = score([name, u.name, u.email, handle, u.phone || cp.phone || bp.phone, u.user_id], q);
      if (!s) continue;
      const kind = userKind(u);
      const followers = Number(cp.followers_instagram || cp.followers || 0);
      people.push({ kind, id: u.user_id, title: name || u.email || "Account", photo: u.picture || cp.photo || bp.logo || "",
        sub: [u.email, handle ? `@${String(handle).replace(/^@/, "")}` : "", followers ? `${followers.toLocaleString("en-IN")} followers` : "", cp.city || bp.city].filter(Boolean).join(" · "),
        to: `/admin?tab=users&role=all&open=${encodeURIComponent(u.user_id)}`, s });
    }
    people.sort((a, b) => b.s - a.s);
    out.push(...people.slice(0, 10));
    const wl = [];
    for (const w of data.waitlist || []) {
      if (!w || String(w.status || "").toLowerCase() === "approved") continue; // approved people are under Users
      const handle = w.social_handle || w.handle || "";
      const s = score([w.name, w.email, handle, w.company_name, w.phone || w.mobile], q);
      if (!s) continue;
      const key = w.email || handle || w.name || "";
      wl.push({ kind: "waitlist", id: w.id, title: w.name || w.company_name || handle || "Applicant",
        sub: [String(w.status || "Pending"), handle ? `@${String(handle).replace(/^@/, "")}` : "", w.followers ? `${Number(w.followers).toLocaleString("en-IN")} followers` : "", w.city].filter(Boolean).join(" · "),
        to: `/admin?tab=waitlist&q=${encodeURIComponent(key)}`, s: s - 0.2 });
    }
    wl.sort((a, b) => b.s - a.s);
    out.push(...wl.slice(0, 6));
    const camps = [];
    for (const c of data.campaigns || []) {
      const s = score([c.title, c.brand_name, c.campaign_id], q);
      if (!s) continue;
      camps.push({ kind: "campaign", id: c.campaign_id || c.id, title: c.title || "Campaign", sub: [c.brand_name, c.status || c.stage].filter(Boolean).join(" · "),
        to: `/admin?tab=campaigns&open=${encodeURIComponent(c.campaign_id || c.id)}`, s: s - 0.3 });
    }
    camps.sort((a, b) => b.s - a.s);
    out.push(...camps.slice(0, 6));
  }
  // best matches first, sections/settings win ties
  return out.sort((a, b) => b.s - a.s).slice(0, 24);
}
