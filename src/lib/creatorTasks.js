// Session 33 (Ravi's "Dashboard — new layout"): one "Important for you" card that rotates every
// task. Desktop (CreatorDashboard) and mobile (CreatorHomeMobile) build the list here so both
// show the same tasks in the same order:
//   deadline < 24h → direct campaign invites → KYC / payouts → profile → other deadlines → fallback.
// Only real data: invites from GET /creators/invitations, deadlines/amounts from
// GET /dashboard/creator (open_work), KYC from GET /verifications/me, profile from GET /creators/me.
import { formatBudget, getDeliverablesCount } from "../utils/invitationUtils";

const HOUR = 3600 * 1000;

export const TASK_THEMES = {
  deadline: { bg: "linear-gradient(180deg,#F2FBF5 0%,#FFFFFF 70%)", border: "#CDEFD9", kColor: "#15803D", iconBg: "#16A34A", btn: "#16A34A", m1c: "#15803D" },
  overdue: { bg: "linear-gradient(180deg,#FEF2F2 0%,#FFFFFF 70%)", border: "#FBD5D5", kColor: "#B91C1C", iconBg: "#DC2626", btn: "#DC2626", m1c: "#0A0A0A" },
  invite: { bg: "linear-gradient(180deg,#FFFBF0 0%,#FFFFFF 70%)", border: "#FDE7B0", kColor: "#B45309", iconBg: "#0A0A0A", btn: "#7C3AED", m1c: "#15803D" },
  profile: { bg: "linear-gradient(180deg,#F5F3FF 0%,#FFFFFF 70%)", border: "#E4DBFA", kColor: "#6D28D9", iconBg: "#7C3AED", btn: "#7C3AED", m1c: "#7C3AED" },
  kyc: { bg: "linear-gradient(180deg,#EEF2FF 0%,#FFFFFF 70%)", border: "#DCE3FB", kColor: "#4338CA", iconBg: "#4F46E5", btn: "#4F46E5", m1c: "#0A0A0A" },
  explore: { bg: "linear-gradient(180deg,#F5F3FF 0%,#FFFFFF 70%)", border: "#E4DBFA", kColor: "#6D28D9", iconBg: "#7C3AED", btn: "#7C3AED", m1c: "#0A0A0A" },
};

const rupees = (n) => `₹${Math.round(Number(n)).toLocaleString("en-IN")}`;
const initialOf = (s, fb = "•") => (String(s || "").trim()[0] || fb).toUpperCase();

/** "14h 22m", "2d 3h", "35m" */
export function formatLeft(ms) {
  const m = Math.max(0, Math.floor(Math.abs(ms) / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

/** "Today, 6 PM" / "Tomorrow, 10 AM" / "12 Oct, 4:30 PM" */
export function formatDue(date, now = Date.now()) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined, hour12: true }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase()).replace(/\s?([ap])m/i, (x, p) => ` ${p.toUpperCase()}M`);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Math.floor((new Date(d).setHours(0, 0, 0, 0) - start.getTime()) / 86400000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export function timeAgo(date, now = Date.now()) {
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Profile strength from real profile fields. Five equal parts; KYC is its own task. */
export function creatorProfileStrength(cp = {}, portfolioCount = null) {
  const p = cp || {};
  const rc = p.rate_card && typeof p.rate_card === "object" ? p.rate_card : {};
  // v286 (Ravi: "onboarding mein bhar diya phir bhi pending dikhata hai"): onboarding saves
  // primary_niche / story_rate / youtube_video_rate / youtube_channel_url / ig_followers — those
  // were not read here, so filled parts still showed as pending.
  const niche = p.content_niches || p.primary_niche || p.category || p.niche || (Array.isArray(p.categories) && p.categories.length ? p.categories : "");
  const parts = [
    { key: "photo", label: "Photo", done: Boolean(p.photo || p.profile_photo_url || p.picture || p.avatar_url || p.profile_image) },
    { key: "about", label: "Niche & bio", done: Boolean((Array.isArray(niche) ? niche.length : String(niche).trim()) && String(p.bio || p.description || p.about || "").trim()) },
    { key: "social", label: "Instagram / YouTube", done: Boolean(p.instagram_handle || p.instagram || p.youtube || p.youtube_channel || p.youtube_channel_url || p.followers_instagram || p.ig_followers || p.follower_count) },
    { key: "rates", label: "Rate card", done: [p.rate_reel, p.reel_rate, p.rate_story, p.story_rate, p.rate_yt_video, p.youtube_video_rate, rc.reels, rc.reel, rc.stories, rc.story, rc.youtube, rc.youtube_video].some((v) => Number(v || 0) > 0) || p.barter_mode === true },
    { key: "work", label: "Past work", done: Number(portfolioCount || 0) > 0 || (Array.isArray(p.portfolio) && p.portfolio.length > 0) },
  ];
  const done = parts.filter((x) => x.done).length;
  return { percent: done * 20, missing: parts.filter((x) => !x.done).map((x) => x.label) };
}

const lower = (s) => String(s || "").toLowerCase();
export const kycState = (status, verifiedFlag) => {
  const s = lower(status);
  if (verifiedFlag || s === "approved" || s === "verified") return "approved";
  if (s === "pending" || s === "under_review" || s === "submitted") return "pending";
  if (s === "rejected") return "rejected";
  return "none";
};

/**
 * @returns {Array<{id, kind, theme, initial, kicker, brand, title, m1l, m1v, m2l, m2v, cta, action}>}
 *   action = { type: "invite", invite } | { type: "route", to }
 */
export function buildCreatorTasks({
  invitations = [], work = [], kycStatus = null, kycVerified = false, profile = null, profileLoaded = false,
  portfolioCount = null, now = Date.now(), workRoute,
} = {}) {
  const routeFor = workRoute || ((w) => (w.kind === "ugc"
    ? `/creator/ugc?tab=manage&orderId=${encodeURIComponent(w.id)}`
    : (w.thread_id ? `/chat/${encodeURIComponent(w.thread_id)}` : "/collabs")));

  const deadlineTask = (w) => {
    const due = new Date(w.deadline).getTime();
    const left = due - now;
    const overdue = left < 0;
    const action = String(w.creator_action || "Open");
    const amountLabel = w.amount_kind === "your_payout" ? "PAYOUT" : "AGREED FEE";
    return {
      id: `deadline_${w.kind}_${w.id}`,
      kind: "deadline",
      urgent: !overdue && left <= 24 * HOUR,
      due,
      theme: overdue ? TASK_THEMES.overdue : TASK_THEMES.deadline,
      initial: initialOf(w.brand_name, w.kind === "ugc" ? "U" : "C"),
      kicker: overdue ? `OVERDUE · ${formatLeft(left)} late` : `DEADLINE · ${formatLeft(left)} left`,
      brand: w.brand_name || (w.kind === "ugc" ? "UGC order" : "Campaign deal"),
      title: w.title ? `${action} — ${w.title}` : action,
      m1l: amountLabel, m1v: w.amount ? rupees(w.amount) : "Not set",
      m2l: "DUE", m2v: formatDue(w.deadline, now),
      cta: /^upload/i.test(action) ? "Upload now" : "Open",
      action: { type: "route", to: routeFor(w) },
    };
  };

  const open = (Array.isArray(work) ? work : []).filter((w) => w && w.stage_group !== "ended" && w.creator_action && w.deadline && !Number.isNaN(new Date(w.deadline).getTime()));
  const deadlines = open.map(deadlineTask).sort((a, b) => a.due - b.due);
  const urgent = deadlines.filter((t) => t.due - now <= 24 * HOUR); // overdue or due within 24h
  const later = deadlines.filter((t) => !urgent.includes(t));

  const invites = (Array.isArray(invitations) ? invitations : [])
    .filter((i) => i && (!i.status || i.status === "pending_creator_acceptance"))
    .map((inv) => {
      const count = Number(inv.deliverables_count || getDeliverablesCount(inv.deliverables) || 0);
      const ago = timeAgo(inv.created_at || inv.sent_at, now);
      return {
        id: `invite_${inv.id}`,
        kind: "invite",
        theme: TASK_THEMES.invite,
        initial: initialOf(inv.brand_name, "B"),
        logo: inv.brand_logo || "",
        kicker: `CAMPAIGN INVITE${ago ? ` · ${ago}` : ""}`,
        brand: inv.brand_name || "Brand",
        title: inv.campaign_title || "Campaign invitation",
        m1l: "BUDGET", m1v: formatBudget(inv.proposed_budget || inv.budget_range),
        m2l: "DELIVERABLES", m2v: count ? `${count} deliverable${count === 1 ? "" : "s"}` : "See details",
        cta: "Review invitation",
        action: { type: "invite", invite: inv },
      };
    });

  const tasks = [...urgent, ...invites];

  const kyc = kycState(kycStatus, kycVerified);
  if (kyc === "none" || kyc === "rejected") {
    tasks.push({
      id: "kyc", kind: "kyc", theme: TASK_THEMES.kyc, initial: "KYC",
      kicker: kyc === "rejected" ? "PAYOUTS · KYC REJECTED" : "PAYOUTS", brand: "Bank & KYC",
      title: kyc === "rejected" ? "Fix your KYC to get paid" : "Verify KYC to get paid",
      m1l: "STATUS", m1v: kyc === "rejected" ? "Rejected" : "Not verified",
      m2l: "NEEDED FOR", m2v: "Payouts & signing",
      cta: kyc === "rejected" ? "Fix KYC" : "Verify now",
      action: { type: "route", to: "/kyc" },
    });
  } else if (kyc === "pending") {
    tasks.push({
      id: "kyc_review", kind: "kyc", theme: TASK_THEMES.kyc, initial: "KYC",
      kicker: "KYC · UNDER REVIEW", brand: "Bank & KYC", title: "Your KYC is being checked",
      m1l: "STATUS", m1v: "Submitted", m2l: "USUALLY", m2v: "24–48 hours",
      cta: "Check status", action: { type: "route", to: "/kyc/status" },
    });
  }

  if (profileLoaded) {
    const { percent, missing } = creatorProfileStrength(profile || {}, portfolioCount);
    if (percent < 100) {
      tasks.push({
        id: "profile", kind: "profile", theme: TASK_THEMES.profile, initial: `${percent}%`,
        kicker: "PROFILE", brand: "Public profile", title: "Complete your profile",
        m1l: "DONE", m1v: `${percent}%`, m2l: "MISSING", m2v: missing.join(", "),
        cta: "Finish profile", action: { type: "route", to: "/profile/overview" },
      });
    }
  }

  tasks.push(...later);

  if (tasks.length === 0) {
    tasks.push({
      id: "explore", kind: "explore", theme: TASK_THEMES.explore, initial: "★",
      kicker: "ALL CAUGHT UP", brand: "Ybex", title: "Find your next campaign",
      m1l: "OPEN DEALS", m1v: String(open.length), m2l: "NEXT STEP", m2v: "Apply to a campaign",
      cta: "Explore campaigns", action: { type: "route", to: "/campaigns" },
    });
  }
  return tasks;
}

/** "You have 3 new invites and 2 active deals." */
export function dashboardSubline(inviteCount, activeDeals) {
  const inv = Number(inviteCount || 0), deals = Number(activeDeals || 0);
  const i = `${inv} new invite${inv === 1 ? "" : "s"}`;
  const d = `${deals} active deal${deals === 1 ? "" : "s"}`;
  if (!inv && !deals) return "No new invites or active deals yet.";
  if (!inv) return `You have ${d}.`;
  if (!deals) return `You have ${i}.`;
  return `You have ${i} and ${d}.`;
}
