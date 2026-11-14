// v419 — phone admin screens (Overview, Users, KYC, Payments, More + pushed screens), all on the real admin APIs.
import React, { useMemo, useState, createContext, useContext } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, UserPlus, Megaphone, Lightbulb, TriangleAlert, Activity, CircleHelp, Wallet, Landmark, Percent, Smartphone,
  Copy, ArrowRight, ChevronRight, ExternalLink, Eye, CircleUser, Tag, Fingerprint, CreditCard, FileText, Building2, Search,
  Loader2, Users, ListChecks, Trophy, Film, MessageSquare, Bot, BookOpen, Bell, Settings, LogOut, CircleCheck, Maximize2, Inbox, Sparkles,
} from "lucide-react";
import { api } from "../../../lib/api";
import { mediaHref } from "../../../lib/mediaUrl";
import { ADMIN_SETTINGS, adminNavFor, adminNavFolded } from "../../../lib/adminSearch";
import { adminItemAllowed } from "../../../lib/adminPermissions"; // v419
import { useAuth } from "../../../contexts/AuthContext";
import {
  useAdminData, kycReviewable, payQueues, fmtK, inr, inrExact, initials, igUrl, avatarColor, ago, ageShort, isOlderThan, dateShort, dateLong, oldest,
  isWaitPending, isCampaignInReview, isTicketOpen, isReportOpen, isUgcLive, afterWrite, cleanHandle,
} from "./adminMobileData";

// ---- building blocks (was ui.jsx; merged to keep the deploy under 999 files) ----
// v419 — building blocks for the phone admin (same look as the "Admin Mobile" design: #F2F2F7 page, white cards,
// #7C3AED purple, black filter pills, DM Sans).

export const C = {
  page: "#F2F2F7", card: "#FFFFFF", line: "#ECECF0", line2: "#F1F1F4", ink: "#0A0A0A", ink2: "#3F3F46", mut: "#5F6672", mut2: "#6E6E7A",
  faint: "#A1A1AA", purple: "#7C3AED", red: "#DC2626", green: "#059669", soft: "#F9F9FB",
};
export const FONT = "'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif";

/** Shared actions for every screen: navigate, open the confirm sheet, zoom a document. */
export const AdminMobileCtx = createContext(null);
export const useAM = () => useContext(AdminMobileCtx);

export const STATUS = {
  PENDING: { label: "Pending review", bg: "#FFFBEB", fg: "#B45309" },
  APPROVED: { label: "Approved", bg: "#ECFDF5", fg: "#047857" },
  REJECTED: { label: "Rejected", bg: "#F4F4F5", fg: "#52525B" },
};
export const KIND = {
  section: { label: "Section", bg: "#F1F5F9", fg: "#334155", border: "#E2E8F0" },
  setting: { label: "Setting", bg: "#FFFBEB", fg: "#92400E", border: "#FDE68A" },
  creator: { label: "Creator", bg: "#F5F3FF", fg: "#6D28D9", border: "#DDD6FE" },
  unclaimed: { label: "Unclaimed", bg: "#FFF7ED", fg: "#C2410C", border: "#FED7AA" },
  brand: { label: "Brand", bg: "#F0F9FF", fg: "#0369A1", border: "#BAE6FD" },
  agency: { label: "Agency", bg: "#EEF2FF", fg: "#4338CA", border: "#C7D2FE" },
  admin: { label: "Admin", bg: "#FFF1F2", fg: "#BE123C", border: "#FECDD3" },
  waitlist: { label: "Waitlist", bg: "#ECFDF5", fg: "#047857", border: "#A7F3D0" },
  campaign: { label: "Campaign", bg: "#FDF4FF", fg: "#A21CAF", border: "#F5D0FE" },
};

export function PageTitle({ title, sub, pad = true }) {
  return (
    <div style={{ padding: pad ? "0 16px" : 0 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: C.ink }}>{title}</h1>
      {sub ? <div style={{ fontSize: 13.5, color: C.mut, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
export function Label({ children, color = C.mut, icon: Icon, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color, paddingLeft: 4, ...style }}>
      {Icon ? <Icon size={15} aria-hidden /> : null}{children}
    </div>
  );
}
export function Card({ children, style, ...rest }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden", ...style }} {...rest}>{children}</div>;
}
export function Avatar({ name, seedColor, size = 42, photo }) {
  const s = { width: size, height: size, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: Math.round(size * 0.36), background: seedColor?.bg, color: seedColor?.fg, overflow: "hidden" };
  if (photo) return <span style={s}><img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} /></span>;
  return <span style={s} aria-hidden>{String(name || "?").slice(0, 2)}</span>;
}
export function Chip({ on, label, count, onClick, testid }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={on}
      style={{ flexShrink: 0, height: 38, padding: "0 14px", borderRadius: 999, border: `1px solid ${on ? C.ink : "#E5E5EA"}`, background: on ? C.ink : "#FFFFFF", color: on ? "#FFFFFF" : C.ink2, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: FONT }}>
      {label}{count !== undefined && count !== "" ? <span style={{ fontSize: 12, opacity: 0.75 }}>{count}</span> : null}
    </button>
  );
}
export function ChipRow({ children }) {
  return <div className="ybam-noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 16px", scrollbarWidth: "none" }}>{children}</div>;
}
export function Segmented({ items, value, onChange }) {
  return (
    <div role="tablist" style={{ display: "flex", padding: 3, background: "#E4E4EA", borderRadius: 12 }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(it.id)} data-testid={`seg-${it.id}`}
            style={{ flex: 1, minWidth: 0, height: 38, border: "none", borderRadius: 10, background: on ? "#FFFFFF" : "transparent", color: on ? C.ink : C.mut, boxShadow: on ? "0 1px 3px rgba(0,0,0,0.08)" : "none", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
            {it.badge ? <span style={{ fontSize: 12, color: C.red }}>{it.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
export function Row({ label, value, color = C.ink, first }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "12px 14px", borderTop: first ? "none" : `1px solid ${C.line2}` }}>
      <span style={{ fontSize: 14, color: C.mut, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14.5, fontWeight: 600, color, textAlign: "right", overflowWrap: "anywhere", minWidth: 0 }}>{value}</span>
    </div>
  );
}
export function ListButton({ onClick, children, first, testid, style }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} className="ybam-press"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", minHeight: 56, background: "#FFFFFF", border: "none", borderTop: first ? "none" : `1px solid ${C.line2}`, cursor: "pointer", textAlign: "left", fontFamily: FONT, color: C.ink, ...style }}>
      {children}
    </button>
  );
}
export const Chev = () => <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} aria-hidden />;
export function Badge({ n, color = C.purple }) {
  if (!n) return null;
  return <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, background: color === C.purple ? "#F5F0FF" : "#FEF2F2", color: color === C.purple ? C.purple : C.red, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n > 99 ? "99+" : n}</span>;
}
export function Btn({ children, kind = "primary", onClick, disabled, style, testid, type = "button" }) {
  const k = {
    primary: { background: C.purple, color: "#fff", border: "none" },
    green: { background: C.green, color: "#fff", border: "none" },
    danger: { background: "#fff", color: C.red, border: "1px solid #FDE2E2" },
    ghost: { background: "#fff", color: C.ink2, border: "1px solid #E5E5EA" },
    soft: { background: "#fff", color: C.purple, border: "1px solid #DDD6FE" },
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testid}
      style={{ flex: 1, minWidth: 0, height: 46, minHeight: (style && style.height) || 46, flexShrink: 0, borderRadius: 13, fontSize: 15, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: FONT, ...k, ...style }}>
      {children}
    </button>
  );
}
export function Empty({ icon: Icon = ShieldCheck, text, sub }) {
  return (
    <Card style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
      <Icon size={34} color="#C4C4CC" aria-hidden />
      <div style={{ fontSize: 14.5, color: C.mut }}>{text}</div>
      {sub ? <div style={{ fontSize: 12.5, color: C.mut2 }}>{sub}</div> : null}
    </Card>
  );
}
export function Loading({ lines = 3 }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="ybam-skel" style={{ height: 72, borderRadius: 16 }} />)}
    </div>
  );
}
export function ErrorBox({ onRetry, text = "Couldn't load this. Check your internet and try again." }) {
  return (
    <Card style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" }}>
      <div style={{ fontSize: 14, color: C.mut }}>{text}</div>
      {onRetry ? <Btn kind="ghost" onClick={onRetry} style={{ flex: "none", padding: "0 18px", height: 40 }}>Try again</Btn> : null}
    </Card>
  );
}
/** Instagram glyph (brand colours) — lucide's brand icons are deprecated. */
export function IgIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <defs><linearGradient id="ybamig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FEDA75" /><stop offset=".35" stopColor="#FA7E1E" /><stop offset=".6" stopColor="#D62976" /><stop offset=".85" stopColor="#962FBF" /><stop offset="1" stopColor="#4F5BD5" /></linearGradient></defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#ybamig)" />
      <rect x="6.5" y="6.5" width="11" height="11" rx="5.5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="17.3" cy="6.7" r="1.3" fill="#fff" />
    </svg>
  );
}

export const AM_CSS = `
/* v431 (admin audit #64 / #65): wide desktop tables inside the phone frame — each table scrolls on its own and the
   last column (the action buttons) stays pinned on the right, so Approve / Pay / Delete are always on screen. */
[data-testid="am-section"] table{display:block;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
[data-testid="am-section"] table tr > td:last-child,[data-testid="am-section"] table tr > th:last-child{position:sticky;right:0;background:#FFFFFF;box-shadow:-8px 0 12px -10px rgba(0,0,0,.25);z-index:1}

.ybam-noscroll::-webkit-scrollbar{display:none}
.ybam-press:active{background:#F7F7FA !important}
.ybam-skel{background:linear-gradient(90deg,#ECECF0 0%,#F7F7FA 50%,#ECECF0 100%);background-size:200% 100%;animation:ybamSk 1.2s linear infinite}
@keyframes ybamSk{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes ybamUp{from{transform:translateY(100%)}to{transform:none}}
@keyframes ybamFade{from{opacity:0}to{opacity:1}}
@keyframes ybamPush{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}
@media (prefers-reduced-motion: reduce){.ybam-anim{animation:none !important}}
`;

const errMsg = (e, fb) => e?.response?.data?.error || e?.response?.data?.detail || e?.response?.data?.message || fb;
const Page = ({ children, gap = 14, pad = "6px 16px 28px" }) => <div style={{ padding: pad, display: "flex", flexDirection: "column", gap }}>{children}</div>;

// =============================== OVERVIEW ===============================
export function useQueues(canArg) {
  // v419 (admin cleanup): the small counts call first; a full list is fetched only for a queue that has something
  // waiting (it was 10 lists on every open of the phone admin). Empty queues cost nothing.
  const counts = useAdminData("counts");
  const cc = counts.data || null;
  // v431 (audit #29): a sub-admin only loads the queues they may open (the server answers 403 for the rest)
  const amCtx = useAM();
  const can = canArg || amCtx?.can || (() => true);
  const PERM = { payout_requests: "manage_escrow", ugc_refunds: "manage_escrow", referral_withdrawals: "manage_escrow", kyc: "manage_kyc", waitlist: "manage_waitlist", campaigns: "manage_campaigns", helpdesk: "manage_helpdesk", reports: "manage_disputes", ugc_active: "manage_ugc" };
  const need = (k) => ({ enabled: Boolean(cc) && Number(cc[k]) > 0 && can(PERM[k]) });
  const escrow = useAdminData("escrow", need("payout_requests")), refunds = useAdminData("refunds", need("ugc_refunds")), referral = useAdminData("referral", need("referral_withdrawals"));
  const kyc = useAdminData("kyc", need("kyc")), wait = useAdminData("waitlist", need("waitlist")), camps = useAdminData("campaigns", need("campaigns"));
  const tickets = useAdminData("tickets", need("helpdesk")), reports = useAdminData("reports", need("reports")), ugc = useAdminData("ugcOrders", need("ugc_active"));
  const pay = payQueues({ escrow: escrow.data, refunds: refunds.data, referral: referral.data });
  const c = counts.data || {};
  const kycPending = kyc.data ? kyc.data.filter(kycReviewable) : null; // v431: no-document records aren't waiting on us
  const waitPending = wait.data ? wait.data.filter(isWaitPending) : null;
  const campReview = camps.data ? camps.data.filter(isCampaignInReview) : null;
  const openTickets = tickets.data ? tickets.data.filter(isTicketOpen) : null;
  const openReports = reports.data ? reports.data.filter(isReportOpen) : null;
  const liveUgc = ugc.data ? ugc.data.filter(isUgcLive) : null;
  const n = (list, fallback) => (list ? list.length : Number(fallback) || 0);
  return {
    loading: counts.loading && !counts.data,
    failed: Boolean(counts.error) && !counts.data, // v431 (audit #19)
    refresh: () => { counts.refresh(); [escrow, refunds, referral, kyc, wait, camps, tickets, reports, ugc].forEach((x) => { if (x.data !== undefined) x.refresh(); }); }, // v419: only lists already open
    pay,
    payCount: escrow.data || refunds.data || referral.data ? pay.payouts.length + pay.refunds.length + pay.referral.length : Number(c.escrow) || 0,
    kycCount: n(kycPending, c.kyc), kycOldest: kycPending && oldest(kycPending, (r) => r.submittedAt),
    waitCount: n(waitPending, c.waitlist), waitOldest: waitPending && oldest(waitPending, (w) => w.created_at || w.date),
    campCount: n(campReview, c.campaigns), campOldest: campReview && oldest(campReview, (x) => x.created_at),
    pitchCount: Number(c.pitches) || 0,
    reportCount: n(openReports, c.reports), reportOldest: openReports && oldest(openReports, (x) => x.created_at),
    ticketCount: n(openTickets, c.helpdesk), ticketOldest: openTickets && oldest(openTickets, (x) => x.created_at),
    ugcCount: liveUgc ? liveUgc.length : Number(c.ugc_active) || 0, ugcOldest: liveUgc && oldest(liveUgc, (x) => x.created_at || x.accepted_at), // v431 (audit #20): age since the order started, not the (future) deadline
  };
}

function QueueTile({ icon: Icon, color, tint, count, label, age, late, onClick, testid }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} className="ybam-press"
      style={{ background: "#FFFFFF", border: `1px solid ${C.line}`, borderRadius: 16, padding: 11, display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", textAlign: "left", fontFamily: FONT, minWidth: 0 }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, background: tint, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={15} color={color} aria-hidden /></span>
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: C.ink }}>{count}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink2, lineHeight: 1.25 }}>{label}</span>
        {age ? <span style={{ fontSize: 11, fontWeight: 500, color: late ? C.red : C.mut2 }}>{age}</span> : null}
      </span>
    </button>
  );
}

export function OverviewScreen() {
  const { go } = useAM();
  const q = useQueues();
  const sum = (l) => l.reduce((s, p) => s + p.amount, 0);
  const money = [
    { id: "payouts", label: "Payout requests", list: q.pay.payouts },
    { id: "refunds", label: "UGC refunds", list: q.pay.refunds },
    { id: "referral", label: "Referral withdrawals", list: q.pay.referral },
  ].filter((m) => m.list.length);
  const moneyAll = money.reduce((s, m) => s + sum(m.list), 0);
  const moneyOld = money.flatMap((m) => m.list).filter((p) => isOlderThan(p.at, 24)).length;
  const tile = (id, icon, color, tint, count, label, oldestAt, to, lateH = 24) => ({ id, icon, color, tint, count, label, age: oldestAt ? `Oldest ${ageShort(oldestAt)}` : "", late: isOlderThan(oldestAt, lateH), to });
  const reviews = [
    tile("kyc", ShieldCheck, "#3B82F6", "#EFF6FF", q.kycCount, "KYC reviews", q.kycOldest, { tab: "verifications" }),
    tile("waitlist", UserPlus, "#A855F7", "#FAF5FF", q.waitCount, "Waitlist", q.waitOldest, { tab: "waitlist" }),
    tile("campaigns", Megaphone, "#F59E0B", "#FFFBEB", q.campCount, "Campaign briefs", q.campOldest, { tab: "campaigns" }),
    tile("pitches", Lightbulb, "#8B5CF6", "#F5F3FF", q.pitchCount, "Pitch leads", null, { tab: "pitches" }),
  ].filter((t) => t.count > 0);
  const support = [
    tile("reports", TriangleAlert, "#EF4444", "#FEF2F2", q.reportCount, "Disputes", q.reportOldest, { tab: "reports" }),
    { ...tile("ugc", Activity, "#10B981", "#ECFDF5", q.ugcCount, "UGC deliveries", null, { tab: "ugc-orders" }), age: q.ugcOldest ? `Oldest ${ageShort(q.ugcOldest)}` : "" },
    tile("helpdesk", CircleHelp, "#EC4899", "#FDF2F8", q.ticketCount, "Help desk", q.ticketOldest, { tab: "helpdesk" }, 12),
  ].filter((t) => t.count > 0);
  const total = q.payCount + reviews.reduce((s, t) => s + t.count, 0) + support.reduce((s, t) => s + t.count, 0);
  const allQueues = 10, active = money.length + reviews.length + support.length, clear = allQueues - active;

  return (
    <Page gap={18} pad="6px 0 28px">
      <PageTitle title="Overview" sub={q.loading ? "Loading…" : total ? `${total} item${total === 1 ? "" : "s"} pending` : "Nothing pending right now"} />
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 18 }}>
        {q.loading ? <Loading lines={3} /> : null}
        {money.length ? (
          <Card style={{ borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 12 }} data-testid="am-money-card">
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.purple }}>Money to send</div>
                <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 2 }}>{inr(moneyAll)}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: moneyOld ? C.red : C.green, background: moneyOld ? "#FEF2F2" : "#ECFDF5", border: `1px solid ${moneyOld ? "#FEE2E2" : "#D1FAE5"}`, borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>
                {moneyOld ? `${moneyOld} waiting 24h+` : "All fresh"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", background: C.soft, borderRadius: 14, overflow: "hidden" }}>
              {money.map((m, i) => (
                <button key={m.id} type="button" className="ybam-press" onClick={() => go({ tab: "escrow", pay: m.id })} data-testid={`am-money-${m.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", minHeight: 48, background: "transparent", border: "none", borderTop: i ? `1px solid ${C.line}` : "none", cursor: "pointer", textAlign: "left", fontFamily: FONT }}>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{m.label} · {m.list.length}</span>
                    <span style={{ fontSize: 11.5, color: C.mut2 }}>Oldest {ago(oldest(m.list, (p) => p.at)) || "—"}</span>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", color: C.ink }}>{inr(sum(m.list))}</span>
                  <Chev />
                </button>
              ))}
            </div>
          </Card>
        ) : null}
        {[["Reviews", reviews], ["Support", support]].map(([title, tiles]) => tiles.length ? (
          <div key={title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Label>{title}</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
              {tiles.map((t) => <QueueTile key={t.id} testid={`am-tile-${t.id}`} {...t} onClick={() => go(t.to)} />)}
            </div>
          </div>
        ) : null)}
        {q.failed ? <ErrorBox onRetry={q.refresh} /> : null}
        {!q.loading && !q.failed ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: C.mut, padding: "4px 0" }}>
            <CircleCheck size={15} color={C.green} aria-hidden />{active === 0 ? "Everything is clear" : `${clear} other queue${clear === 1 ? "" : "s"} clear`}
          </div>
        ) : null}
      </div>
    </Page>
  );
}

// =============================== USERS ===============================
const ROLES = [["all", "All"], ["creator", "Creators"], ["brand", "Brands"], ["agency", "Agencies"], ["unclaimed", "Unclaimed"], ["admin", "Admins"], ["banned", "Banned"], ["deleted", "Recycle bin"]];
// v431 (audit #14 / #15 / #49): banned accounts (the server also marks them deleted) stay visible under All + "Banned";
// "Recycle bin" shows deleted accounts; a search box filters by name, email, handle or phone.
const roleMatch = (u, role) => role === "all" ? (!u.deleted || u.banned) : role === "banned" ? u.banned : role === "deleted" ? u.deleted && !u.banned : (!u.deleted || u.banned) && u.kind === role;
export function UsersScreen({ role = "all" }) {
  const { go } = useAM();
  const users = useAdminData("users");
  const [limit, setLimit] = useState(60);
  const [needle, setNeedle] = useState("");
  const all = users.data || [];
  const list = all.filter((u) => roleMatch(u, "all"));
  const nd = needle.trim().toLowerCase().replace(/^@/, "");
  const shown = all.filter((u) => roleMatch(u, role)).filter((u) => !nd || [u.name, u.email, u.handle, u.phone].some((x) => String(x || "").toLowerCase().includes(nd)));
  return (
    <Page pad="6px 0 28px">
      <PageTitle title="Users" sub={users.data ? `${list.length.toLocaleString("en-IN")} accounts` : "Loading…"} />
      <ChipRow>
        {ROLES.map(([id, label]) => (
          <Chip key={id} on={role === id} label={label} testid={`am-role-${id}`} count={users.data ? all.filter((u) => roleMatch(u, id)).length : ""}
            onClick={() => go({ tab: "users", role: id === "all" ? undefined : id }, { replace: true })} />
        ))}
      </ChipRow>
      <div style={{ padding: "0 16px" }}>
        <input value={needle} onChange={(e) => { setNeedle(e.target.value); setLimit(60); }} placeholder="Search name, email, @handle, phone" aria-label="Search users" data-testid="am-users-search"
          style={{ width: "100%", boxSizing: "border-box", height: 44, borderRadius: 14, border: `1px solid ${C.line}`, background: "#fff", padding: "0 14px", fontSize: 16, fontFamily: FONT, marginBottom: 12, outline: "none" }} />
        {users.loading ? <Loading lines={5} /> : users.error ? <ErrorBox onRetry={users.refresh} /> : !shown.length ? <Empty icon={Users} text={nd ? "No match." : "No accounts here."} /> : (
          <Card>
            {shown.slice(0, limit).map((u, i) => {
              const k = KIND[u.kind] || KIND.creator;
              const sub = [u.handle ? "@" + u.handle : u.email, u.followers ? fmtK(u.followers) + " followers" : "", u.city].filter(Boolean).join(" · ");
              return (
                <ListButton key={u.id} first={i === 0} onClick={() => go({ tab: "users", open: u.id })} testid="am-user-row" style={{ minHeight: 66 }}>
                  <Avatar name={initials(u.name)} seedColor={avatarColor(u.id)} photo={mediaHref(u.photo) || u.photo} />
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</span>
                      {u.banned ? <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: C.red, background: "#FEF2F2", borderRadius: 6, padding: "2px 6px" }}>BANNED</span>
                        : u.suspended ? <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "#B45309", background: "#FFFBEB", borderRadius: 6, padding: "2px 6px" }}>SUSPENDED</span>
                        : u.deleted ? <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: C.mut, background: C.soft, borderRadius: 6, padding: "2px 6px" }}>DELETED</span> : null}
                    </span>
                    <span style={{ fontSize: 12.5, color: C.mut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", border: `1px solid ${k.border}`, background: k.bg, color: k.fg, borderRadius: 8, padding: "4px 7px" }}>{k.label}</span>
                </ListButton>
              );
            })}
          </Card>
        )}
        {shown.length > limit ? <Btn kind="ghost" style={{ marginTop: 12, width: "100%" }} onClick={() => setLimit((l) => l + 60)} testid="am-users-more">Show more ({shown.length - limit} left)</Btn> : null}
      </div>
    </Page>
  );
}

export function UserDetailScreen({ id, setBar }) {
  const { go, openSheet } = useAM();
  const users = useAdminData("users");
  const kyc = useAdminData("kyc");
  const u = (users.data || []).find((x) => String(x.id) === String(id));
  const k = (kyc.data || []).find((r) => String(r.userId) === String(id));
  React.useEffect(() => {
    if (!u || u.kind === "admin") { setBar(null); return; }
    setBar({
      left: { label: u.banned ? "Unban" : "Ban user", kind: "danger", testid: "am-ban", onClick: () => openSheet({
        title: u.banned ? `Unban ${u.name}?` : `Ban ${u.name}?`, body: u.banned ? "They can log in and use Ybex again." : "Their account is closed and moved to the recycle bin, and they get an email that it was permanently terminated. You can unban later from Users → Banned.", // v431 (audit #13)
        confirm: u.banned ? "Unban" : "Ban user", color: C.red,
        onConfirm: async () => { await api.post(`/admin/users/${encodeURIComponent(u.id)}/${u.banned ? "unban" : "ban"}`); afterWrite("users"); toast.success(u.banned ? "User unbanned" : "User banned"); },
      }) },
      right: k ? { label: "Open KYC", onClick: () => go({ tab: "verifications", kyc: k.id }) }
        : u.handle ? { label: "Open on Instagram", href: igUrl(u.handle) } : { label: "All actions", onClick: () => go({ tab: "users", full: 1, open: u.id }) },
    });
    return () => setBar(null);
  }, [u?.id, u?.banned, k?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (users.loading) return <Page pad="16px"><Loading lines={4} /></Page>;
  if (users.error) return <Page pad="16px"><ErrorBox onRetry={users.refresh} /></Page>; // v431 (audit #10)
  if (!u) return <Page pad="16px"><Empty icon={Users} text="This account wasn't found." /></Page>;
  const kind = KIND[u.kind] || KIND.creator;
  const kycLabel = k ? STATUS[k.status]?.label : u.kycStatus && u.kycStatus !== "NOT_SUBMITTED" ? u.kycStatus.replace(/_/g, " ").toLowerCase() : "Not submitted";
  const rows = [["Email", u.email], ["Phone", u.phone], ["User ID", u.id], ["City", u.city], ["Joined", dateLong(u.joinedAt)],
    ["Followers", u.followers ? u.followers.toLocaleString("en-IN") : ""], ["Profile", u.profileStatus ? u.profileStatus.replace(/_/g, " ") : ""],
    ["KYC", kycLabel, k ? STATUS[k.status]?.fg : C.mut2]].filter((r) => r[1]);
  return (
    <Page gap={14} pad="16px 16px 28px">
      <Card style={{ borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar name={initials(u.name)} seedColor={avatarColor(u.id)} size={56} photo={mediaHref(u.photo) || u.photo} />
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 19, fontWeight: 600, overflowWrap: "anywhere" }}>{u.name}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", border: `1px solid ${kind.border}`, background: kind.bg, color: kind.fg, borderRadius: 8, padding: "3px 7px" }}>{kind.label}</span>
              {u.banned ? <span style={{ fontSize: 10.5, fontWeight: 700, color: C.red, background: "#FEF2F2", borderRadius: 8, padding: "3px 7px" }}>BANNED</span> : null}
              {u.suspended ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "#B45309", background: "#FFFBEB", borderRadius: 8, padding: "3px 7px" }}>SUSPENDED</span> : null}
            </div>
          </div>
        </div>
        {u.handle ? (
          <a href={igUrl(u.handle)} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "8px 14px", borderRadius: 14, background: C.soft, border: `1px solid ${C.line}`, color: C.ink, textDecoration: "none" }}>
            <IgIcon size={26} /><span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{u.handle}</span><ExternalLink size={17} color={C.purple} aria-hidden />
          </a>
        ) : null}
      </Card>
      <Card>{rows.map(([l, v, col], i) => <Row key={l} label={l} value={v} color={col} first={i === 0} />)}</Card>
      <Btn kind="soft" onClick={() => go({ tab: "users", full: 1, open: u.id })} testid="am-user-all-actions"><Settings size={16} aria-hidden />Warn, suspend, edit profile, history</Btn>
    </Page>
  );
}

// =============================== KYC ===============================
export function KycScreen() {
  const { go } = useAM();
  const kyc = useAdminData("kyc");
  const [kind, setKind] = useState("creator");
  const [filter, setFilter] = useState("PENDING");
  const all = kyc.data || [];
  const ofKind = all.filter((r) => r.type === kind);
  const pend = (t) => all.filter((r) => r.type === t && kycReviewable(r)).length;
  const list = ofKind.filter((r) => filter === "ALL" || (filter === "PENDING" ? kycReviewable(r) : r.status === filter)); // v431 (audit #8)
  const word = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected", ALL: "" }[filter];
  return (
    <Page>
      <PageTitle pad={false} title="KYC checks" sub="Check the Instagram account before you approve." />
      <Segmented value={kind} onChange={setKind} items={[{ id: "creator", label: "Creators", badge: pend("creator") || "" }, { id: "brand", label: "Brands", badge: pend("brand") || "" }]} />
      <div className="ybam-noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
        {[["PENDING", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["ALL", "All"]].map(([id, label]) => (
          <Chip key={id} on={filter === id} label={label} testid={`am-kyc-f-${id}`} count={kyc.data ? (id === "ALL" ? ofKind.length : ofKind.filter((r) => (id === "PENDING" ? kycReviewable(r) : r.status === id)).length) : ""} onClick={() => setFilter(id)} />
        ))}
      </div>
      {kyc.loading ? <Loading lines={3} /> : kyc.error ? <ErrorBox onRetry={kyc.refresh} /> : !list.length ? <Empty text={`No ${word ? word + " " : ""}${kind} applications.`} /> : list.map((r) => {
        const rate = r.followers ? r.reach / r.followers : 0;
        const pending = r.status === "PENDING";
        return (
          <Card key={r.id} style={{ borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 10 }} data-testid="am-kyc-card">
            <button type="button" onClick={() => go({ tab: "verifications", kyc: r.id })} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: FONT, color: C.ink }}>
              <Avatar name={initials(r.name)} seedColor={avatarColor(r.userId)} size={40} photo={mediaHref(r.photo) || r.photo} />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                  {pending ? <span style={{ width: 7, height: 7, borderRadius: 999, background: "#EF4444", flexShrink: 0 }} aria-label="Pending" /> : null}
                </span>
                <span style={{ fontSize: 12, color: C.mut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[r.type === "creator" ? r.niche : r.website, r.city].filter(Boolean).join(" · ") || r.email}</span>
              </span>
              <span style={{ flexShrink: 0, fontSize: 12, color: C.mut2, whiteSpace: "nowrap" }}>{dateShort(r.submittedAt)}</span>
            </button>
            {r.handle ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) repeat(3,minmax(0,1fr))", background: C.soft, borderRadius: 12, overflow: "hidden" }}>
                <a href={igUrl(r.handle)} target="_blank" rel="noopener noreferrer" aria-label={`Open @${r.handle} on Instagram`} style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 46, padding: "0 10px", color: C.ink, textDecoration: "none", minWidth: 0 }}>
                  <IgIcon size={20} /><span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{r.handle}</span>
                </a>
                {[[fmtK(r.followers), "Followers"], [r.reach ? fmtK(r.reach) : "—", "Reach"], [r.reach && r.followers ? Math.round(rate * 100) + "%" : "—", "Rate", rate >= 0.15 ? C.green : rate >= 0.08 ? "#D97706" : r.reach ? C.red : C.ink]].map(([v, l, col]) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8px", minWidth: 0, borderLeft: `1px solid ${C.line}` }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: col || C.ink }}>{v}</span><span style={{ fontSize: 10.5, color: C.mut }}>{l}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.mut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.docs.length ? r.docs.map((d) => d.label).join(" · ") : "No documents uploaded"}</span>
              <button type="button" onClick={() => go({ tab: "verifications", kyc: r.id })} data-testid="am-kyc-review"
                style={{ height: 36, padding: "0 14px", borderRadius: 999, border: "none", background: pending ? C.purple : "#F4F4F5", color: pending ? "#fff" : C.ink2, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: FONT, flexShrink: 0 }}>
                {pending ? "Review" : "View"}<ChevronRight size={15} aria-hidden />
              </button>
            </div>
          </Card>
        );
      })}
    </Page>
  );
}

const REASONS = ["PAN photo is blurry", "Name doesn't match PAN", "Instagram account looks fake", "Followers too low", "Documents missing"];
export function KycDetailScreen({ id, setBar, setPill }) {
  const { go, openSheet, zoom } = useAM();
  const kyc = useAdminData("kyc");
  const r = (kyc.data || []).find((x) => x.id === String(id));
  React.useEffect(() => {
    if (!r) { setBar(null); setPill(null); return; }
    setPill(STATUS[r.status] || STATUS.PENDING);
    if (r.status !== "PENDING") { setBar(null); return; }
    if (!kycReviewable(r)) { setBar(null); return; } // v431 (audit #8): nothing uploaded → nothing to approve
    const reject = () => openSheet({
      title: `Reject ${r.name}'s KYC?`, body: "Pick a reason or write one. They will see it and can submit again.", confirm: "Reject", color: C.red, needsReason: true, reasons: REASONS,
      onConfirm: async ({ reason }) => { await api.post(`/admin/verifications/${encodeURIComponent(r.id)}/reject`, { note: reason, reason, expect_status: "PENDING" }); afterWrite("kyc"); toast.success("KYC rejected"); go({ tab: "verifications" }, { back: true }); },
    });
    const approve = () => openSheet({
      title: `Approve ${r.name}?`, body: "They get the verified badge and can receive payouts.", confirm: "Approve", color: C.purple,
      onConfirm: async () => { await api.post(`/admin/verifications/${encodeURIComponent(r.id)}/approve`, { note: "", expect_status: "PENDING" }); afterWrite("kyc"); toast.success("KYC approved"); go({ tab: "verifications" }, { back: true }); },
    });
    setBar({ left: { label: "Reject", kind: "danger", onClick: reject, testid: "am-kyc-reject" }, right: { label: "Approve KYC", onClick: approve, testid: "am-kyc-approve" } });
    return () => { setBar(null); setPill(null); };
  }, [r?.id, r?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (kyc.loading) return <Page pad="16px"><Loading lines={4} /></Page>;
  if (kyc.error) return <Page pad="16px"><ErrorBox onRetry={kyc.refresh} /></Page>; // v431 (audit #10)
  if (!r) return <Page pad="16px"><Empty text="This KYC application wasn't found." /></Page>;
  const isC = r.type === "creator";
  const rate = r.followers && r.reach ? r.reach / r.followers : 0;
  const rows = (a) => a.filter((x) => x[1] && x[1] !== "N/A");
  const groups = isC ? [
    ["Personal & profile", CircleUser, "#3B82F6", rows([["Full name", r.name], ["Date of birth", r.dob], ["Phone", r.phone], ["State / address", r.city], ["Niche", r.niche], ["Languages", r.languages]])],
    ["Rates", Tag, "#D97706", rows([["Instagram reel", r.reel ? inr(r.reel) : "", C.green], ["Story shoutout", r.story ? inr(r.story) : "", C.green], ["YouTube video", r.yt ? inr(r.yt) : "", "#2563EB"], ["Commercial mode", r.mode, C.purple]])],
    ["Identity & tax", Fingerprint, "#9333EA", rows([["PAN number", r.pan], ["Aadhaar number", r.aadhaar], ["GSTIN", r.gstin]])],
    ["Payout details", CreditCard, C.green, rows([["Account holder", r.bankHolder], ["Account number", r.bankAcc], ["IFSC", r.ifsc], ["UPI ID", r.upi]])],
  ] : [
    ["Company", Building2, "#3B82F6", rows([["Company name", r.name], ["Website", r.website], ["Authorized contact", r.poc], ["Designation", r.designation], ["Work email", r.email], ["Work phone", r.phone]])],
    ["Identity & tax", Fingerprint, "#9333EA", rows([["PAN number", r.pan], ["Incorporation type", r.incType], ["GSTIN", r.gstin]])],
  ];
  return (
    <Page gap={16} pad="16px 16px 28px">
      <Card style={{ borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar name={initials(r.name)} seedColor={avatarColor(r.userId)} size={60} photo={mediaHref(r.photo) || r.photo} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>{r.name}</div>
            {r.email ? <div style={{ fontSize: 13, color: C.mut, overflowWrap: "anywhere" }}>{r.email}</div> : null}
            <div style={{ fontSize: 11.5, color: C.mut2, background: "#F4F4F7", borderRadius: 6, padding: "2px 6px", alignSelf: "flex-start", marginTop: 3, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>ID: {r.userId}</div>
          </div>
        </div>
        {r.handle ? (
          <a href={igUrl(r.handle)} target="_blank" rel="noopener noreferrer" data-testid="am-kyc-ig"
            style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "10px 14px", borderRadius: 15, background: "linear-gradient(90deg,#FFF5F8,#F7F2FF)", border: "1px solid #F3E1F0", color: C.ink, textDecoration: "none" }}>
            <IgIcon size={32} />
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 15.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{r.handle}</span>
              <span style={{ fontSize: 12, color: C.mut }}>Tap to check the account on Instagram</span>
            </span>
            <ExternalLink size={18} color={C.purple} aria-hidden />
          </a>
        ) : null}
        {isC ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            {[[r.followers ? r.followers.toLocaleString("en-IN") : "—", "Followers"], [r.reach ? r.reach.toLocaleString("en-IN") : "—", "Avg reach"], [rate ? Math.round(rate * 100) + "%" : "—", "Reach rate", rate >= 0.15 ? C.green : rate >= 0.08 ? "#D97706" : rate ? C.red : C.ink]].map(([v, l, col]) => (
              <div key={l} style={{ background: C.soft, borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: col || C.ink, overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span><span style={{ fontSize: 11.5, color: C.mut }}>{l}</span>
              </div>
            ))}
          </div>
        ) : null}
        <button type="button" onClick={() => go({ tab: "users", open: r.userId })} data-testid="am-kyc-profile"
          style={{ height: 44, borderRadius: 12, border: "1px solid #DDD6FE", background: "#FFFFFF", color: C.purple, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontFamily: FONT }}>
          <Eye size={16} aria-hidden />View complete profile
        </button>
      </Card>
      {r.status === "REJECTED" && r.reason ? <div style={{ background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: 16, padding: "12px 14px", fontSize: 13.5, color: "#991B1B", lineHeight: 1.45 }}><b>Rejection note:</b> {r.reason}</div> : null}
      {groups.map(([title, Icon, color, list]) => list.length ? (
        <div key={title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Label icon={Icon} color={color}>{title}</Label>
          <Card>{list.map(([l, v, col], i) => <Row key={l} label={l} value={v} color={col} first={i === 0} />)}</Card>
        </div>
      ) : null)}
      {r.bio ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Label icon={FileText} color={C.purple}>Bio</Label>
          <Card style={{ padding: 14, fontSize: 14, fontStyle: "italic", color: C.ink2, lineHeight: 1.5 }}>“{r.bio}”</Card>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Label icon={FileText} color="#E11D48">Documents ({r.docs.length})</Label>
        {r.docs.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
            {r.docs.map((d) => <DocTile key={d.label} doc={d} onZoom={() => zoom(d)} />)}
          </div>
        ) : <Empty icon={FileText} text="No documents uploaded." />}
      </div>
    </Page>
  );
}
const isPdf = (u) => /\.pdf($|\?)/i.test(String(u || ""));
function DocTile({ doc, onZoom }) {
  const href = mediaHref(doc.url);
  return (
    <button type="button" onClick={onZoom} data-testid="am-kyc-doc" aria-label={`Open ${doc.label}`}
      style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <span style={{ height: 104, background: "repeating-linear-gradient(135deg,#F4F4F7 0 10px,#EEEEF2 10px 20px)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {isPdf(doc.url) ? <FileText size={30} color={C.mut} aria-hidden /> : <img src={href} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      </span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 10px", fontSize: 13, fontWeight: 600, color: C.ink }}>{doc.label}<Maximize2 size={14} color={C.purple} aria-hidden /></span>
    </button>
  );
}

// =============================== PAYMENTS ===============================
export function PaymentsScreen({ tab = "payouts" }) {
  const { go, openSheet } = useAM();
  const escrow = useAdminData("escrow"), refunds = useAdminData("refunds"), referral = useAdminData("referral");
  const stats = useAdminData("stats");
  const q = payQueues({ escrow: escrow.data, refunds: refunds.data, referral: referral.data });
  const src = { payouts: escrow, refunds, referral }[tab] || escrow;
  const list = q[tab] || [];
  const isRefund = tab === "refunds";
  // v431 (audit #3): a creator payout is checked on the server BEFORE the sheet opens (KYC, freeze, refund, already
  // paid) — so nobody sends money from the bank app and then gets refused.
  const markPaid = async (p) => {
    if (p.list === "payouts") {
      const t = p.raw || {};
      try {
        const { data } = await api.get("admin/escrow/payout-check", { params: { transaction_id: t.id || undefined, deal_id: t.deal_id || undefined, ugc_order_id: t.ugc_order_id || undefined }, bypassCache: true });
        if (data && data.ok === false) {
          if (data.code === "ALREADY_PAID") { afterWrite("escrow", "stats"); toast.info("This payout is already marked paid."); return; }
          openSheet({ title: "Don't send this payout yet", body: data.error || "The server can't record this payout right now.", confirm: "OK", color: C.ink, onConfirm: async () => {} });
          return;
        }
        if (data?.ok && Number.isFinite(Number(data.payable)) && Number(data.payable) > 0 && Math.abs(Number(data.payable) - p.amount) >= 0.5) p = { ...p, amount: Number(data.payable) };
      } catch (e) {
        toast.error(e?.response?.data?.error || "Couldn't check this payout. Try again before sending money.");
        return;
      }
    }
    openPaidSheet(p);
  };
  const openPaidSheet = (p) => openSheet({
    title: `${isRefund ? "Refund sent" : "Paid"} ${inrExact(p.amount)} to ${p.name}?`, body: p.dest ? `Send exactly ${inrExact(p.amount)} to ${p.dest}, then add the UTR from your bank app.` : "No payout account on file — add the UTR of the transfer you made.",
    confirm: isRefund ? "Mark refund sent" : "Mark paid", color: C.green, needsUtr: true,
    onConfirm: async ({ utr }) => {
      if (p.list === "payouts") {
        const t = p.raw;
        const target = String(t.deal_id || t.ugc_order_id || t.id || "");
        let already = false;
        try {
          await api.post(`admin/escrow/${encodeURIComponent(target)}/release-payout`, { utr_number: utr, reason: "Payout released by admin (phone)", transaction_id: t.id, deal_id: t.deal_id, ugc_order_id: t.ugc_order_id, creator_id: t.creator_id, creator_net_amount: t.creator_net_amount, gross_amount: t.gross_amount, platform_fee_amount: t.platform_fee_amount });
        } catch (e) { if (e?.response?.data?.code !== "ALREADY_PAID") throw e; already = true; }
        afterWrite("escrow", "stats");
        if (already) { toast.info("This payout was already marked paid — your UTR was not saved."); return; } // v431 (audit #4)
      } else if (p.list === "refunds") { await api.post(`/admin/ugc-refunds/${encodeURIComponent(p.id)}/process`, { utr }); afterWrite("refunds"); }
      else { await api.post(`admin/referral-withdrawals/${encodeURIComponent(p.id)}/paid`, { utr }); afterWrite("referral"); }
      toast.success(isRefund ? "Refund marked as sent" : "Marked as paid · UTR saved");
    },
  });
  const secondary = (p) => {
    if (p.list === "payouts") return go({ tab: "escrow", full: 1, view: "requests", open: p.raw?.deal_id || p.raw?.ugc_order_id || p.id }); // v431 (audit #7)
    openSheet({
      // v431 (audit #5): this route marks the refund FAILED and tells the brand to update their account — say so
      title: isRefund ? "Mark this refund as failed?" : `Reject ${inr(p.amount)} request?`, body: isRefund ? `${p.name} · ${p.context}\nThe brand is told the refund couldn't be completed and asked to update their refund account.` : `${p.name} · ${p.context}`, confirm: isRefund ? "Mark failed" : "Reject", color: C.red, needsReason: isRefund,
      onConfirm: async ({ reason }) => {
        if (isRefund) { await api.post(`/admin/ugc-refunds/${encodeURIComponent(p.id)}/fail`, { reason }); afterWrite("refunds"); toast.success("Refund marked failed · brand asked to update their account"); }
        else { await api.post(`admin/referral-withdrawals/${encodeURIComponent(p.id)}/reject`, {}); afterWrite("referral"); toast.success("Request rejected"); }
      },
    });
  };
  const copy = async (p) => { try { await navigator.clipboard.writeText(p.copyText || p.dest); toast.success("Copied"); } catch { toast.error("Couldn't copy — long-press to select."); } };
  const escrowAmt = Number(stats.data?.escrowSecured || 0);
  return (
    <Page>
      <PageTitle pad={false} title="Payments" sub={stats.data ? `${inr(escrowAmt)} secured in escrow` : " "} />
      <Segmented value={tab} onChange={(id) => go({ tab: "escrow", pay: id === "payouts" ? undefined : id }, { replace: true })}
        items={[{ id: "payouts", label: "Payouts", badge: q.payouts.length || "" }, { id: "refunds", label: "UGC refunds", badge: q.refunds.length || "" }, { id: "referral", label: "Referral", badge: q.referral.length || "" }]} />
      {src.loading ? <Loading lines={2} /> : src.error ? <ErrorBox onRetry={src.refresh} /> : !list.length ? (
        <Empty icon={Wallet} text={{ payouts: "No payout requests waiting.", refunds: "No UGC refunds to send.", referral: "No referral withdrawals waiting." }[tab]} />
      ) : list.map((p) => (
        <Card key={p.id} style={{ borderRadius: 20, padding: 14, display: "flex", flexDirection: "column", gap: 12 }} data-testid="am-pay-card">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Avatar name={initials(p.name)} seedColor={avatarColor(p.name)} size={42} photo={p.photo ? (mediaHref(p.photo) || p.photo) : ""} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: C.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.context}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 600 }}>{inrExact(p.amount)}</div>
              <div style={{ fontSize: 11.5, color: C.mut2 }}>{ago(p.at)}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.soft, border: `1px solid ${C.line}`, borderRadius: 14 }}>
            {p.method === "UPI" ? <Smartphone size={17} color={C.mut} aria-hidden /> : <Landmark size={17} color={C.mut} aria-hidden />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.mut2 }}>{p.method === "UPI" ? "UPI ID" : p.method === "Bank" ? "Bank account" : isRefund ? "Refund account" : "Payout account"}</div>
              <div style={{ fontSize: 14.5, fontWeight: 600, overflowWrap: "anywhere", color: p.dest ? C.ink : "#B45309" }}>{p.dest || "Not added yet"}</div>
            </div>
            {p.dest ? <button type="button" onClick={() => copy(p)} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: C.purple, fontSize: 13.5, fontWeight: 600, cursor: "pointer", minHeight: 40, padding: "0 4px", fontFamily: FONT }}><Copy size={14} aria-hidden />Copy</button> : null}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn kind="ghost" onClick={() => secondary(p)} testid="am-pay-secondary" style={{ height: 46 }}>{p.list === "payouts" ? "Details" : isRefund ? "Failed" : "Reject"}</Btn>
            <Btn kind="green" onClick={() => markPaid(p)} testid="am-pay-paid" style={{ flex: 1.6, height: 46 }}>{isRefund ? "Mark refund sent" : "Mark paid"}</Btn>
          </div>
        </Card>
      ))}
      <button type="button" onClick={() => go({ tab: "escrow", full: 1, view: tab === "refunds" ? "ugc_refunds" : undefined })} data-testid="am-pay-desk"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 44, border: "none", background: "none", color: C.purple, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
        Open the full payments desk<ArrowRight size={16} aria-hidden />
      </button>
    </Page>
  );
}

// =============================== MORE ===============================
const NAV_ICON = { overview: Inbox, waitlist: ListChecks, kyc: ShieldCheck, campaigns: Megaphone, money: Wallet, help: CircleHelp, reports: TriangleAlert, chat: MessageSquare, bot: Bot,
  users: Users, coupon: Tag, invoice: FileText, ugc: Film, leads: Lightbulb, blog: BookOpen, push: Bell, mail: Inbox, promo: Sparkles, trophy: Trophy, sparkle: Sparkles,
  tools: Settings, speed: Activity, logs: Activity, settings: Settings };
export const SECTION_META = {
  users: ["Users", Users], waitlist: ["Waitlist", ListChecks], verifications: ["KYC checks", ShieldCheck], campaigns: ["Campaign approvals", Megaphone],
  pitches: ["Pitch leads", Lightbulb], invoices: ["Eva invoices", Lightbulb], challenge: ["Challenge entries", Trophy], "ugc-orders": ["UGC orders", Film], escrow: ["Payouts & refunds", Wallet],
  chat: ["Chat moderation", MessageSquare], reports: ["Reports & disputes", TriangleAlert], helpdesk: ["Help desk", CircleHelp], feedback: ["Eva feedback", Bot],
  support: ["Support & safety", CircleHelp], money: ["Money", Wallet], orders: ["Orders & leads", Film], marketing: ["Marketing", Bell], developer: ["Developer", Settings], // v419 hub pages
  blog: ["Blogs & content", BookOpen], "whats-new": ["What's new", Sparkles], push: ["Push notifications", Bell], "activity-logs": ["Activity logs", Activity], settings: ["Platform settings", Settings],
};
export const SECTION_PERM = {
  users: "manage_users", challenge: "manage_users", waitlist: "manage_waitlist", verifications: "manage_kyc", campaigns: "manage_campaigns", pitches: "manage_campaigns", invoices: "manage_campaigns",
  chat: "manage_chat", reports: "manage_disputes", escrow: "manage_escrow", "ugc-orders": "manage_ugc", "activity-logs": "manage_logs", blog: "manage_blog", push: "manage_blog",
  "whats-new": "manage_blog", helpdesk: "manage_helpdesk", feedback: "manage_helpdesk", settings: "manage_settings",
};
export function MoreScreen({ email, onLogout }) {
  const { go, can, isFull } = useAM();
  const q = useQueues();
  // v419: the same admin menu as the desktop sidebar (src/lib/adminSearch.js ADMIN_NAV), minus Overview (bottom bar).
  const count = { waitlist: q.waitCount, kyc: q.kycCount, campaigns: q.campCount, escrow: q.payCount, helpdesk: q.ticketCount, reports: q.reportCount, pitches: q.pitchCount };
  const { user: amUser } = useAuth() || {};
  const groups = adminNavFolded(adminNavFor(can, isFull, (it) => adminItemAllowed(amUser, it)), { collapseUsers: false }).filter((g) => g.group).map((g) => [g.group, g.items]); // v419: exact per-item
  return (
    <Page gap={16}>
      <PageTitle pad={false} title="More" sub={email} />
      {groups.map(([title, items]) => (
        <div key={title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Label>{title}</Label>
          <Card>
            {items.map((it, i) => {
              const Icon = NAV_ICON[it.icon] || Settings;
              return (
                <ListButton key={it.id} first={i === 0} onClick={() => go({ tab: it.tab, view: it.view, role: it.role })} testid={`am-more-${it.id}`}>
                  <Icon size={19} color={C.purple} aria-hidden />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500 }}>{it.label}</span>
                  <Badge n={it.badges ? it.badges.reduce((n, k) => n + (Number(count[k]) || 0), 0) : count[it.badge]} color={it.id === "reports" ? C.red : C.purple} /><Chev />
                </ListButton>
              );
            })}
          </Card>
        </div>
      ))}
      <button type="button" onClick={onLogout} data-testid="am-logout"
        style={{ height: 50, borderRadius: 16, background: "#FFFFFF", border: "1px solid #FDE2E2", color: C.red, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontFamily: FONT }}>
        <LogOut size={18} aria-hidden />Log out
      </button>
    </Page>
  );
}

// =============================== WAITLIST ===============================
// v431 (audit #22 / #27 / #28 / #45 / #46 / #47): Creators / Brands / Started tabs, search (opens filtered from global
// search), real Instagram handle only (no made-up @name, a YouTube link stays a YouTube link), brand company + website,
// KYC status on the card.
const waitKind = (w) => String(w?.source || "") === "join_started" ? "started" : (w?.role === "brand" || (w?.company_name && w?.role !== "creator")) ? "brand" : "creator";
export function waitIgHandle(w) {
  const link = String(w?.instagram_link || "");
  const fromLink = /instagram\.com\//i.test(link) ? cleanHandle(link) : "";
  const h = fromLink || cleanHandle(w?.instagram_handle || w?.social_handle || "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : "";
}
export function WaitlistScreen({ q: initialQ = "" }) {
  const { go, openSheet } = useAM();
  const wait = useAdminData("waitlist");
  const [busy, setBusy] = useState(null);
  const [limit, setLimit] = useState(40);
  const [kind, setKind] = useState(initialQ ? "all" : "creator");
  const [needle, setNeedle] = useState(initialQ);
  const pendingAll = (wait.data || []).filter(isWaitPending);
  const nd = needle.trim().toLowerCase().replace(/^@/, "");
  const list = pendingAll.filter((w) => kind === "all" || waitKind(w) === kind)
    .filter((w) => !nd || [w.name, w.company_name, w.email, w.handle, w.social_handle, w.phone, w.mobile].some((x) => String(x || "").toLowerCase().includes(nd)));
  const approve = async (w) => {
    if (busy) return;
    setBusy(w.id);
    try { await api.post(`/admin/waitlist/${encodeURIComponent(w.id)}/approve`, { expect_pending: true }); afterWrite("waitlist"); toast.success(`${w.name || "Applicant"} approved`); }
    catch (e) { toast.error(errMsg(e, "Couldn't approve. Try again.")); if (e?.response?.status === 409) afterWrite("waitlist"); }
    finally { setBusy(null); }
  };
  return (
    <Page>
      <Segmented value={kind} onChange={(id) => { setKind(id); setLimit(40); }}
        items={[{ id: "creator", label: "Creators", badge: pendingAll.filter((w) => waitKind(w) === "creator").length || "" }, { id: "brand", label: "Brands", badge: pendingAll.filter((w) => waitKind(w) === "brand").length || "" }, { id: "started", label: "Started", badge: pendingAll.filter((w) => waitKind(w) === "started").length || "" }]} />
      <input value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Search name, @handle, email, phone" aria-label="Search waitlist" data-testid="am-wait-search"
        style={{ width: "100%", boxSizing: "border-box", height: 44, borderRadius: 14, border: `1px solid ${C.line}`, background: "#fff", padding: "0 14px", fontSize: 16, fontFamily: FONT, outline: "none" }} />
      <div style={{ fontSize: 13.5, color: C.mut }}>{wait.data ? (kind === "started" ? `${list.length} only checked their handle — they haven't applied yet` : `${list.length} waiting for a decision`) : " "}</div>
      {wait.loading ? <Loading lines={3} /> : wait.error ? <ErrorBox onRetry={wait.refresh} /> : !list.length ? <Empty icon={ListChecks} text="No one is waiting." /> : list.slice(0, limit).map((w) => {
        const handle = waitIgHandle(w);
        const isBrandRow = waitKind(w) === "brand", started = waitKind(w) === "started";
        const otherLink = !handle ? String(w.youtube_link || w.youtube || w.instagram_link || w.website || "").trim() : "";
        const name = isBrandRow ? (w.company_name || w.name || "Brand") : (w.name || handle || "Applicant");
        const kycSt = String(w.kyc_status || "").toUpperCase();
        return (
          <Card key={w.id} style={{ borderRadius: 18, padding: 14, display: "flex", flexDirection: "column", gap: 12 }} data-testid="am-wait-card">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={initials(name)} seedColor={avatarColor(w.id)} size={42} photo={mediaHref(w.photo || w.profile_photo_url || w.picture || w.avatar_url || "") || w.photo || w.profile_photo_url || ""} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                <div style={{ fontSize: 12.5, color: C.mut }}>{[isBrandRow && w.name && w.name !== name ? w.name : "", w.city || w.location, w.category || w.niche, `${started ? "Checked" : "Applied"} ${dateShort(w.created_at || w.date)}`].filter(Boolean).join(" · ")}</div>
                {kycSt ? <div style={{ marginTop: 4, display: "inline-flex", fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: "2px 6px", color: kycSt === "APPROVED" ? C.green : "#B45309", background: kycSt === "APPROVED" ? "#ECFDF5" : "#FFFBEB" }}>KYC {kycSt.replace("_", " ").toLowerCase()}</div> : null}
              </div>
            </div>
            {isBrandRow && w.website ? <a href={/^https?:/i.test(w.website) ? w.website : `https://${w.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: C.purple, fontWeight: 600, overflowWrap: "anywhere" }}>{w.website}</a> : null}
            {!handle && otherLink && /^https?:\/\//i.test(otherLink) ? <a href={otherLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: C.purple, fontWeight: 600, overflowWrap: "anywhere" }}>{otherLink.replace(/^https?:\/\/(www\.)?/i, "")}</a> : null}
            {handle ? (
              <a href={igUrl(handle)} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 50, padding: "8px 12px", borderRadius: 13, background: C.soft, border: `1px solid ${C.line}`, color: C.ink, textDecoration: "none" }}>
                <IgIcon size={24} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{handle}</span>
                  {Number(w.followers) ? <span style={{ fontSize: 11.5, color: C.mut }}>{Number(w.followers).toLocaleString("en-IN")} followers</span> : null}
                </span>
                <ExternalLink size={16} color={C.purple} aria-hidden />
              </a>
            ) : null}
            {started ? <div style={{ fontSize: 12.5, color: C.mut }}>They checked their handle on the Join page but didn't finish applying.</div> : <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="danger" testid="am-wait-reject" onClick={() => openSheet({
                title: `Reject ${name}?`, body: "They get an email with this reason.", confirm: "Reject", color: C.red, needsReason: true,
                reasons: ["Followers too low", "Instagram account looks fake", "Profile is private", "Not a fit for Ybex right now"],
                onConfirm: async ({ reason }) => { await api.post(`/admin/waitlist/${encodeURIComponent(w.id)}/reject`, { reason, expect_pending: true }); afterWrite("waitlist"); toast.success("Application rejected"); },
              })}>Reject</Btn>
              <Btn testid="am-wait-approve" onClick={() => approve(w)} disabled={busy === w.id}>{busy === w.id ? "Approving…" : "Approve"}</Btn>
            </div>}
          </Card>
        );
      })}
      {list.length > limit ? <Btn kind="ghost" onClick={() => setLimit((l) => l + 40)}>Show more ({list.length - limit} left)</Btn> : null}
      <button type="button" onClick={() => go({ tab: "waitlist", full: 1 })} style={{ height: 44, border: "none", background: "none", color: C.purple, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Bulk approve, import CSV, approved list<ArrowRight size={16} aria-hidden /></button>
    </Page>
  );
}

// =============================== CAMPAIGN REVIEW ===============================
const money0 = (n) => (Number(n) ? "₹" + fmtK(n) : "");
export function CampaignsScreen() {
  const { go, openSheet } = useAM();
  const camps = useAdminData("campaigns");
  const [busy, setBusy] = useState(null);
  const list = (camps.data || []).filter(isCampaignInReview);
  const live = (camps.data || []).filter((c) => String(c.status || c.stage || "").toLowerCase() === "live").length;
  const setStage = async (c, stage, reason) => {
    await api.post(`/admin/campaigns/${encodeURIComponent(c.campaign_id || c.id)}/status`, { stage, status: stage, reason, expect_status: "under_review" });
    afterWrite("campaigns");
  };
  const approve = async (c) => {
    if (busy) return; setBusy(c.campaign_id || c.id);
    try { await setStage(c, "Live"); toast.success("Campaign approved · now live"); } catch (e) { toast.error(errMsg(e, "Couldn't approve. Try again.")); if (e?.response?.status === 409) afterWrite("campaigns"); } finally { setBusy(null); }
  };
  return (
    <Page>
      <div style={{ fontSize: 13.5, color: C.mut }}>{camps.data ? `${list.length} waiting for review · ${live} live` : " "}</div>
      {camps.loading ? <Loading lines={3} /> : camps.error ? <ErrorBox onRetry={camps.refresh} /> : !list.length ? <Empty icon={Megaphone} text="No campaigns waiting for review." /> : list.map((c) => {
        const id = c.campaign_id || c.id;
        const budget = c.budget_max && c.budget_min && c.budget_max !== c.budget_min ? `${money0(c.budget_min)}–${money0(c.budget_max)}` : money0(c.budget_max || c.budget_min || c.budget);
        const facts = [[budget || "—", "Budget"], [c.max_creators ? String(c.max_creators) : "—", "Creators"], [c.follower_min ? fmtK(c.follower_min) : "Any", "Min followers"]];
        const line = [Array.isArray(c.deliverables) ? c.deliverables.map((d) => (typeof d === "string" ? d : d?.type || d?.name)).filter(Boolean).join(", ") : c.deliverables, c.collab_mode, Array.isArray(c.locations) ? c.locations.join(", ") : c.locations].filter(Boolean).join(" · ");
        return (
          <Card key={id} style={{ borderRadius: 18, padding: 14, display: "flex", flexDirection: "column", gap: 12 }} data-testid="am-camp-card">
            {/* v431 (audit #48): cover, full brief and the brand's page before approving */}
            {(c.cover_image || c.cover_image_url || c.banner_url) ? <img src={mediaHref(c.cover_image || c.cover_image_url || c.banner_url) || c.cover_image || c.cover_image_url || c.banner_url} alt="" loading="lazy" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12, background: C.soft }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.purple }}>{c.brand_user_id || c.brand_id ? <a href={`/brand/${encodeURIComponent(c.brand_user_id || c.brand_id)}`} target="_blank" rel="noopener noreferrer" style={{ color: C.purple, textDecoration: "none" }}>{c.brand_name || "Brand"} ›</a> : (c.brand_name || "Brand")}</div>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, marginTop: 2 }}>{c.title || "Untitled campaign"}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
              {facts.map(([v, l]) => <div key={l} style={{ background: C.soft, borderRadius: 12, padding: 10, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div><div style={{ fontSize: 11.5, color: C.mut }}>{l}</div></div>)}
            </div>
            {line ? <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.45 }}>{line}</div> : null}
            {c.description ? <details style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}><summary style={{ cursor: "pointer", color: C.purple, fontWeight: 600 }}>Read the full brief</summary><div style={{ marginTop: 6, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{String(c.description)}</div></details> : null}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="danger" testid="am-camp-reject" onClick={() => openSheet({
                title: "Reject this campaign?", body: `${c.brand_name || "Brand"} · ${c.title || ""}`, confirm: "Reject", color: C.red, needsReason: true,
                reasons: ["Budget too low", "Brief is unclear", "Not allowed on Ybex", "Duplicate campaign"],
                onConfirm: async ({ reason }) => { await setStage(c, "Rejected", reason); toast.success("Campaign rejected"); },
              })}>Reject</Btn>
              <Btn testid="am-camp-approve" onClick={() => approve(c)} disabled={busy === id}>{busy === id ? "Approving…" : "Approve"}</Btn>
            </div>
          </Card>
        );
      })}
      <button type="button" onClick={() => go({ tab: "campaigns", full: 1 })} style={{ height: 44, border: "none", background: "none", color: C.purple, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>All campaigns, edit & pause<ArrowRight size={16} aria-hidden /></button>
    </Page>
  );
}

// =============================== SETTINGS LIST ===============================
export function SettingsListScreen({ allowed }) {
  const { go } = useAM();
  const DESC = { broadcast: "Send promotional emails to users", maintenance: "Turn maintenance mode on / off", fees: "Platform fee, GST, payout freeze, budget limits",
    coupons: "Create and manage coupon codes", referrals: "Referral rewards, rules and withdrawals", "whats-new": "New-feature popup for users", promos: "Poster popups when the app opens + profile banner",
    banners: "Home hero banners (Common / Creator / Brand)", landing: "Landing page brands and reviews", speed: "App speed report", signup: "Minimum Instagram followers to join" };
  const list = [...ADMIN_SETTINGS, { id: "signup", title: "Creator sign-up" }].filter((s) => allowed(s.id)).map((s) => ({ ...s, desc: DESC[s.id] }));
  return (
    <Page>
      {!list.length ? <Empty icon={Settings} text="You don't have access to any settings." /> : (
        <Card>
          {list.map((s, i) => (
            <ListButton key={s.id} first={i === 0} onClick={() => go({ tab: "settings", view: s.id })} testid={`am-set-${s.id}`}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.title}</span>
                {s.desc ? <span style={{ fontSize: 12.5, color: C.mut }}>{s.desc}</span> : null}
              </span>
              <Chev />
            </ListButton>
          ))}
        </Card>
      )}
    </Page>
  );
}

// v419 (Ravi): Ybex in-house brand switch — shown in Users → a brand → Enforcement (desktop and phone). On: ₹500
// minimum instead of ₹3,000, and "Pay" records the deal as funded by Ybex (brand pays ₹0); the creator is paid from
// Payouts as usual. Only a full admin can change it (the server checks).
export function InhouseBrandToggle({ userId, name }) {
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null); // v419 (security layer): { next } while the password box is open
  const [pw, setPw] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  React.useEffect(() => { let live = true; api.get("admin/inhouse-brands", { bypassCache: true }).then((r) => { if (live) setOn((r?.data?.brands || []).some((b) => String(b.id) === String(userId))); }).catch(() => { if (live) setOn(false); }); return () => { live = false; }; }, [userId]);
  const flip = () => { if (busy || on == null) return; setPw(""); setPin(""); setErr(""); setAsk({ next: !on }); };
  const save = async () => {
    if (!ask || busy) return;
    if (!pw) return setErr("Enter your admin password.");
    if (ask.next && !/^\d{4,8}$/.test(pin.trim())) return setErr("Set a pay PIN of 4 to 8 digits.");
    setBusy(true); setErr("");
    try {
      await api.post(`admin/brands/${encodeURIComponent(userId)}/inhouse`, { on: ask.next, password: pw, ...(ask.next ? { pin: pin.trim() } : {}) });
      setOn(ask.next); setAsk(null); setPw(""); setPin("");
      toast.success(ask.next ? "Marked as Ybex in-house brand" : "No longer an in-house brand");
    } catch (e) { setErr(e?.response?.data?.detail || "Couldn't change it — only a full admin can."); }
    finally { setBusy(false); }
  };
  const box = { width: "100%", boxSizing: "border-box", height: 42, borderRadius: 10, border: "1px solid #D1D5DB", padding: "0 12px", fontSize: 14, fontFamily: FONT, marginTop: 6, background: "#fff" };
  return (
    <div data-testid="inhouse-toggle" style={{ marginTop: 14, padding: 14, borderRadius: 16, border: "1px solid #E9D5FF", background: "#FAF5FF", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Ybex in-house brand</div>
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.45, marginTop: 2 }}>Our own brand: deals can start at ₹500 (not ₹3,000) and paying a deal costs them ₹0 — Ybex funds it. Each ₹0 payment asks for the pay PIN. Pay the creator from Payouts as usual.</div>
        </div>
        <button type="button" role="switch" aria-checked={Boolean(on)} aria-label="Ybex in-house brand" disabled={busy || on == null} onClick={flip} data-testid="inhouse-switch"
          style={{ width: 50, height: 30, borderRadius: 15, border: "none", padding: 3, background: on ? "#7C3AED" : "#D1D5DB", cursor: "pointer", flexShrink: 0, opacity: busy || on == null ? 0.6 : 1, display: "flex", justifyContent: on ? "flex-end" : "flex-start" }}>
          <span style={{ width: 24, height: 24, borderRadius: 12, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
        </button>
      </div>
      {ask && (
        <div data-testid="inhouse-confirm" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #E9D5FF" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{ask.next ? `Mark ${name || "this brand"} as in-house?` : `Remove ${name || "this brand"} from in-house?`}</div>
          <label style={{ display: "block", fontSize: 12, color: "#4B5563", marginTop: 10 }}>Your admin password
            <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} style={box} data-testid="inhouse-password" />
          </label>
          {ask.next && (
            <label style={{ display: "block", fontSize: 12, color: "#4B5563", marginTop: 10 }}>Set a pay PIN (4–8 digits) — asked every time this brand pays ₹0
              <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} style={box} data-testid="inhouse-pin" />
            </label>
          )}
          {err && <div style={{ color: "#B91C1C", fontSize: 12, marginTop: 8 }} data-testid="inhouse-error">{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setAsk(null)} disabled={busy} style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>Cancel</button>
            <button type="button" onClick={save} disabled={busy} data-testid="inhouse-save" style={{ flex: 1, height: 40, borderRadius: 10, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 600, fontFamily: FONT, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Checking…" : "Confirm"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
