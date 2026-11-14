// v419 (Ravi: "admin panel ki mobile UI de di, achhe se bana dena, sab API se connect") — the admin panel on a phone.
// Built from the "Admin Mobile" design: search + notifications on top, Overview / Users / KYC / Payments / More at the
// bottom, pushed screens with a back arrow, bottom sheets for every money / ban / approve / reject action.
// Every screen reads the same admin APIs as the desktop admin; sections that have no phone screen yet open the
// existing desktop component inside the phone frame (same data and actions).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  LayoutGrid, Users, ShieldAlert, Wallet, Menu, Search, Bell, X, ArrowLeft, ShieldCheck, Landmark, Percent, Megaphone, CircleHelp,
  ListChecks, Settings, User, Building2, Shield, ClipboardList, LayoutDashboard, UserPlus, Loader2,
} from "lucide-react";
import { api } from "../../../lib/api";
import { mediaHref } from "../../../lib/mediaUrl";
import { searchAdmin } from "../../../lib/adminSearch";
import { useAuth } from "../../../contexts/AuthContext";
import { userHasAnyKey, settingsTabAllowed, hasAnySettingsPerm } from "../../../lib/adminPermissions";
import { useAdminData, ago, afterWrite, initials } from "./adminMobileData";
import useBackToClose from "../../../lib/popupRules"; // v431 (audit #26)
import {
  C, FONT, AM_CSS, AdminMobileCtx, KIND, Card,
  OverviewScreen, UsersScreen, UserDetailScreen, KycScreen, KycDetailScreen, PaymentsScreen, MoreScreen, WaitlistScreen, CampaignsScreen,
  SettingsListScreen, SECTION_META, SECTION_PERM, useQueues,
} from "./AdminMobileScreens";

const ROOTS = ["dashboard", "users", "verifications", "escrow", "more"];
const PERM_ALIASES = {
  manage_waitlist: ["manage_waitlist", "manage_users"], manage_chat: ["manage_chat", "manage_campaigns"], manage_disputes: ["manage_disputes", "manage_reports"],
  manage_ugc: ["manage_ugc", "manage_escrow"], manage_logs: ["manage_logs", "manage_activity_logs", "manage_users"],
};

/** Which screen the URL asks for. */
export function screenFor(params) {
  const tab = params.get("tab") || "dashboard";
  const full = params.get("full") === "1";
  if (tab === "users" && params.get("open") && !full) return { kind: "user", id: params.get("open") };
  if (tab === "verifications" && params.get("kyc")) return { kind: "kyc", id: params.get("kyc") };
  if (tab === "waitlist" && !full) return { kind: "waitlist" };
  if (tab === "campaigns" && !full && !params.get("open")) return { kind: "campaigns" }; // v431 (audit #23): a search result opens that campaign in the full queue
  if (tab === "settings" && !params.get("view")) return { kind: "settings" };
  if (full || !ROOTS.includes(tab)) return { kind: "section", tab };
  return { kind: "root", tab };
}

export default function AdminMobile({ renderSection }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth() || {};
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tab = params.get("tab") || "dashboard";
  const sc = screenFor(params);
  const ov = params.get("ov"); // search | notif — in the URL so the phone's Back closes it
  const scrollRef = useRef(null);
  const [sheet, setSheet] = useState(null);
  const [zoomDoc, setZoomDoc] = useState(null);
  // v431 (audit #26): phone Back closes an open sheet / document zoom first (it used to leave the page, even mid-payment)
  useBackToClose(Boolean(sheet), () => setSheet(null));
  useBackToClose(Boolean(zoomDoc), () => setZoomDoc(null));
  const [bar, setBar] = useState(null);
  const [pill, setPill] = useState(null);

  const can = useCallback((key) => {
    if (!key) return true;
    if (key === "manage_settings") return userHasAnyKey(user, ["manage_settings"]) || hasAnySettingsPerm(user);
    return userHasAnyKey(user, PERM_ALIASES[key] || [key]);
  }, [user]);

  const go = useCallback((p, opts = {}) => {
    if (opts.back && location.key !== "default" && window.history.length > 1) { navigate(-1); return; }
    const q = new URLSearchParams();
    Object.entries(p || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") q.set(k, String(v)); });
    navigate(`/admin?${q.toString()}`, { replace: !!opts.replace || !!opts.back });
  }, [navigate, location.key]);

  const setOv = useCallback((which) => {
    const q = new URLSearchParams(location.search);
    if (which) { q.set("ov", which); navigate(`/admin?${q.toString()}`); }
    else if (q.get("ov")) { if (location.key !== "default") navigate(-1); else { q.delete("ov"); navigate(`/admin?${q.toString()}`, { replace: true }); } }
  }, [location.search, location.key, navigate]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [tab, sc.kind, sc.id]);
  useEffect(() => { setSheet(null); setZoomDoc(null); }, [location.search]);

  const isFull = user?.role === "admin" && user?.team_role !== "sub_admin"; // v419: Developer menu = full admins
  const ctx = useMemo(() => ({ go, can, isFull, openSheet: setSheet, zoom: setZoomDoc }), [go, can, isFull]);
  const q = useQueues(can); // v431: only the queues this admin may open
  const root = sc.kind === "root";
  const activeNav = tab === "dashboard" ? "dashboard" : ["users", "verifications", "escrow"].includes(tab) ? tab : "more";

  const doLogout = async () => { try { await logout?.(); } finally { window.location.href = "/login"; } };

  let title = "", body = null;
  const NO_ACCESS = <div style={{ padding: 24, textAlign: "center", color: C.mut }} data-testid="am-no-access">You don't have access to this section. Ask a full admin to turn it on for you (Team → permissions).</div>;
  if (sc.kind === "root") {
    if (tab === "dashboard") body = <OverviewScreen />;
    // v430: a sub-admin without the permission got "Couldn't load — check your internet" (the server said 403)
    else if (tab === "users") body = can("manage_users") ? <UsersScreen role={params.get("role") || "all"} /> : NO_ACCESS;
    else if (tab === "verifications") body = can("manage_kyc") ? <KycScreen /> : NO_ACCESS;
    else if (tab === "escrow") body = can("manage_escrow") ? <PaymentsScreen tab={params.get("pay") || "payouts"} /> : NO_ACCESS;
    else body = <MoreScreen email={user?.email} onLogout={doLogout} />;
  } else if (sc.kind === "user") { body = <UserDetailScreen id={sc.id} setBar={setBar} />; title = "Account"; }
  else if (sc.kind === "kyc") { body = <KycDetailScreen id={sc.id} setBar={setBar} setPill={setPill} />; title = "KYC review"; }
  else if (sc.kind === "waitlist") { body = can("manage_waitlist") ? <WaitlistScreen q={params.get("q") || ""} /> : NO_ACCESS; title = "Waitlist"; }
  else if (sc.kind === "campaigns") { body = can("manage_campaigns") ? <CampaignsScreen /> : NO_ACCESS; title = "Campaign review"; }
  else if (sc.kind === "settings") { body = <SettingsListScreen allowed={(id) => settingsTabAllowed(user, id) || userHasAnyKey(user, ["manage_settings"])} />; title = "Platform settings"; }
  else {
    const meta = SECTION_META[sc.tab];
    title = sc.tab === "settings" ? (params.get("view") ? "Platform settings" : "Settings") : meta ? meta[0] : "Admin";
    const allowed = can(SECTION_PERM[sc.tab]);
    body = allowed ? <div style={{ padding: "12px 12px 28px", overflowX: "auto", maxWidth: "100vw", boxSizing: "border-box" }} data-testid="am-section">{renderSection(sc.tab)}</div>
      : <div style={{ padding: 24, textAlign: "center", color: C.mut }}>You don't have access to this section.</div>;
  }
  // KYC detail title follows the type
  if (sc.kind === "kyc") title = "KYC review";

  const back = () => {
    if (location.key !== "default" && window.history.length > 1) navigate(-1);
    else go(sc.kind === "kyc" ? { tab: "verifications" } : sc.kind === "user" ? { tab: "users" } : { tab: "more" }, { replace: true });
  };

  return (
    <AdminMobileCtx.Provider value={ctx}>
      <style>{AM_CSS}</style>
      <div data-testid="admin-mobile" style={{ position: "fixed", inset: 0, zIndex: 35, background: C.page, fontFamily: FONT, color: C.ink, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {root ? (
          <header style={{ flexShrink: 0, padding: "calc(var(--yb-sat, 0px) + 10px) 16px 10px", display: "flex", alignItems: "center", gap: 10, background: C.page }}>
            <button type="button" onClick={() => setOv("search")} aria-label="Search the admin panel" data-testid="am-search-open"
              style={{ flex: 1, minWidth: 0, height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", background: "#FFFFFF", border: `1px solid ${C.line}`, borderRadius: 14, cursor: "pointer", textAlign: "left", boxShadow: "0 1px 2px rgba(0,0,0,0.03)", fontFamily: FONT }}>
              <Search size={18} color={C.mut2} aria-hidden />
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: "#8A8A94", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Search creators, brands, settings…</span>
            </button>
            <BellButton onClick={() => setOv("notif")} />
          </header>
        ) : (
          <header style={{ flexShrink: 0, padding: "calc(var(--yb-sat, 0px) + 6px) 8px 6px", display: "flex", alignItems: "center", gap: 4, background: C.page, borderBottom: "1px solid #E7E7EC" }}>
            <button type="button" onClick={back} aria-label="Back" data-testid="am-back"
              style={{ width: 44, height: 44, border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 12 }}>
              <ArrowLeft size={22} color={C.ink} aria-hidden />
            </button>
            <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 17, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
            {pill && sc.kind === "kyc" ? <span style={{ flexShrink: 0, marginRight: 8, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "5px 9px", whiteSpace: "nowrap", background: pill.bg, color: pill.fg }}>{pill.label}</span> : null}
          </header>
        )}
        <main ref={scrollRef} key={root ? "root" : `${sc.kind}-${sc.id || sc.tab}`} className={root ? "" : "ybam-anim"}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", animation: root ? "none" : "ybamPush .22s cubic-bezier(.22,1,.36,1)" }}>
          {body}
        </main>
        {!root && bar ? (
          <div style={{ flexShrink: 0, display: "flex", gap: 10, padding: "10px 16px", background: "#FFFFFF", borderTop: "1px solid #E5E5E2" }} data-testid="am-actionbar">
            <BarButton b={bar.left} flex={1} />
            <BarButton b={bar.right} flex={1.4} primary />
          </div>
        ) : null}
        <nav aria-label="Admin sections" style={{ flexShrink: 0, background: "#FFFFFF", borderTop: "1px solid #E5E5E2", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div style={{ display: "flex", height: 60 }}>
            {[["dashboard", "Overview", LayoutGrid, 0], ["users", "Users", Users, 0, "manage_users"], ["verifications", "KYC", ShieldAlert, q.kycCount, "manage_kyc"], ["escrow", "Payments", Wallet, q.payCount, "manage_escrow"], ["more", "More", Menu, 0]].filter((t) => !t[4] || can(t[4])).map(([id, label, Icon, badge]) => { /* v430: only tabs this admin may open */
              const on = activeNav === id;
              const color = on ? C.purple : "#767680";
              return (
                <button key={id} type="button" aria-current={on ? "page" : undefined} data-testid={`am-nav-${id}`}
                  onClick={() => { if (on && root) { if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: "smooth" }); } else go({ tab: id }); }}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>
                  <span style={{ position: "relative", display: "flex" }}>
                    <Icon size={22} color={color} aria-hidden />
                    {badge > 0 ? <span style={{ position: "absolute", top: -6, right: -11, height: 16, minWidth: 16, padding: "0 4px", borderRadius: 999, background: C.purple, color: "#FFFFFF", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px #FFFFFF" }} aria-label={`${badge} waiting`}>{badge > 9 ? "9+" : badge}</span> : null}
                  </span>
                  <span style={{ fontSize: 11, letterSpacing: "-0.01em", fontWeight: on ? 700 : 600, color }}>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {ov === "search" ? <SearchOverlay can={can} onClose={() => setOv(null)} go={go} /> : null}
        {ov === "notif" ? <NotifPanel onClose={() => setOv(null)} go={go} queues={q} /> : null}
        {sheet ? <ConfirmSheet sheet={sheet} onClose={() => setSheet(null)} /> : null}
        {zoomDoc ? <ZoomDoc doc={zoomDoc} onClose={() => setZoomDoc(null)} /> : null}
      </div>
    </AdminMobileCtx.Provider>
  );
}

function BarButton({ b, flex, primary }) {
  if (!b) return <span style={{ flex }} />;
  const st = { flex, height: 50, borderRadius: 14, fontSize: 15.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
    ...(primary ? { border: "none", background: C.purple, color: "#FFFFFF" } : { border: "1px solid #FDE2E2", background: "#FFFFFF", color: b.kind === "danger" ? C.red : C.ink2 }) };
  if (b.href) return <a href={b.href} target="_blank" rel="noopener noreferrer" style={st} data-testid={b.testid}>{b.label}</a>;
  return <button type="button" onClick={b.onClick} style={st} data-testid={b.testid}>{b.label}</button>;
}

function BellButton({ onClick }) {
  const notes = useAdminData("notifications");
  const unread = (notes.data || []).filter(isUnread).length;
  return (
    <button type="button" onClick={onClick} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} data-testid="am-bell"
      style={{ position: "relative", width: 46, height: 46, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", border: `1px solid ${C.line}`, borderRadius: 14, cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
      <Bell size={20} color={C.ink} aria-hidden />
      {unread ? <span style={{ position: "absolute", top: -5, right: -5, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 999, background: C.red, color: "#FFFFFF", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 2px ${C.page}` }}>{unread > 99 ? "99+" : unread}</span> : null}
    </button>
  );
}

// ---------------- bottom sheet (approve / reject / mark paid / ban) ----------------
function ConfirmSheet({ sheet, onClose }) {
  const [reason, setReason] = useState("");
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  // v431 (audit #57): the same UTR rule as the server (letters, digits, "-", 6–40) — checked BEFORE money moves
  const ready = (!sheet.needsUtr || /^[A-Za-z0-9-]{6,40}$/.test(utr.trim())) && (!sheet.needsReason || reason.trim().length >= 3);
  useEffect(() => { const k = (e) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [busy, onClose]);
  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try { await sheet.onConfirm({ reason: reason.trim(), utr: utr.trim() }); onClose(); }
    catch (e) {
      const st = e?.response?.status, msg = e?.response?.data?.error || e?.response?.data?.detail;
      const reloadAll = () => { try { window.dispatchEvent(new CustomEvent("ybex:data-changed", { detail: { url: "/admin/escrow /admin/ugc-refunds /admin/referral /admin/verifications /admin/waitlist /admin/campaigns /admin/users" } })); } catch { /* old browser */ } };
      if (!e?.response) {
        // v431 (audit #62): no answer (timeout / network) — the server may have done it. Don't say "nothing changed".
        toast.error("Not sure it went through — the connection dropped. Refresh and check before trying again.");
        reloadAll(); onClose();
      } else if (st === 409) {
        // v431 (audit #60): another admin got there first — show why, close the sheet and refresh the list
        toast.error(msg || "Someone else already changed this. The list is refreshed.");
        reloadAll(); onClose();
      } else toast.error(msg || "That didn't go through. Nothing was changed — try again.");
    }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={() => !busy && onClose()} className="ybam-anim" style={{ position: "absolute", inset: 0, background: "rgba(10,10,10,0.42)", animation: "ybamFade .18s ease-out" }} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="ybam-sheet-title" className="ybam-anim" data-testid="am-sheet"
        style={{ position: "relative", background: "#FFFFFF", borderRadius: "22px 22px 0 0", padding: "8px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", display: "flex", flexDirection: "column", gap: 12, maxHeight: "88%", overflowY: "auto", animation: "ybamUp .26s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><span style={{ width: 38, height: 5, borderRadius: 999, background: "#D4D4D8" }} /></div>
        <div>
          <h2 id="ybam-sheet-title" style={{ margin: 0, fontSize: 19, fontWeight: 600, overflowWrap: "anywhere" }}>{sheet.title}</h2>
          {sheet.body ? <p style={{ margin: "4px 0 0", fontSize: 14, color: C.mut, lineHeight: 1.45, overflowWrap: "anywhere" }}>{sheet.body}</p> : null}
        </div>
        {sheet.reasons?.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {sheet.reasons.map((r) => {
              const on = reason === r;
              return <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={on} style={{ height: 36, padding: "0 12px", borderRadius: 999, border: `1px solid ${on ? "#FCA5A5" : "#E5E5EA"}`, background: on ? "#FEF2F2" : "#FFFFFF", color: on ? "#B91C1C" : C.ink2, fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}>{r}</button>;
            })}
          </div>
        ) : null}
        {sheet.needsReason || sheet.reasonOptional ? (
          <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={3} placeholder={sheet.needsReason ? "Reason the person will see" : "Reason (optional)"} aria-label="Reason" data-testid="am-sheet-reason"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E5E5EA", borderRadius: 14, padding: 12, fontSize: 16, fontFamily: FONT, resize: "none", outline: "none", background: C.soft }} />
        ) : null}
        {sheet.needsUtr ? (
          <input value={utr} onChange={(e) => setUtr(e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40))} placeholder="UTR / reference number" aria-label="UTR / reference number" inputMode="text" autoCapitalize="characters" data-testid="am-sheet-utr"
            style={{ width: "100%", boxSizing: "border-box", height: 50, border: "1px solid #E5E5EA", borderRadius: 14, padding: "0 14px", fontSize: 16, fontFamily: FONT, outline: "none", background: C.soft }} />
        ) : null}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ flex: 1, height: 50, borderRadius: 14, border: "1px solid #E5E5EA", background: "#FFFFFF", color: C.ink, fontSize: 15.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          <button type="button" onClick={confirm} disabled={!ready || busy} data-testid="am-sheet-confirm"
            style={{ flex: 1.4, height: 50, borderRadius: 14, border: "none", background: sheet.color || C.purple, color: "#FFFFFF", fontSize: 15.5, fontWeight: 600, cursor: ready && !busy ? "pointer" : "default", opacity: ready ? 1 : 0.45, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: FONT }}>
            {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : null}{sheet.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZoomDoc({ doc, onClose }) {
  const href = mediaHref(doc.url);
  const pdf = /\.pdf($|\?)/i.test(String(doc.url || ""));
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={doc.label} onClick={onClose} data-testid="am-zoom"
      style={{ position: "absolute", inset: 0, zIndex: 55, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "calc(var(--yb-sat, 0px) + 24px) 16px 24px" }}>
      {pdf ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#fff", fontSize: 15, fontWeight: 600, padding: "14px 20px", border: "1px solid #fff", borderRadius: 14, textDecoration: "none" }}>Open PDF</a>
        : <img src={href} alt={doc.label} style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: 12, background: "#111" }} />}
      <div style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 600 }}>{doc.label}</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#C4B5FD", fontSize: 13.5, fontWeight: 600 }}>Open full size</a>
        <span style={{ color: "#A1A1AA", fontSize: 13 }}>Tap anywhere to close</span>
      </div>
    </div>
  );
}

// ---------------- search ----------------
const QUICK = [["Waitlist", ListChecks, { tab: "waitlist" }], ["KYC checks", ShieldCheck, { tab: "verifications" }], ["Payouts", Wallet, { tab: "escrow" }], ["Campaigns", Megaphone, { tab: "campaigns" }],
  ["Creators", User, { tab: "users", role: "creator" }], ["Brands", Building2, { tab: "users", role: "brand" }], ["Help desk", CircleHelp, { tab: "helpdesk" }], ["Settings", Settings, { tab: "settings" }]];
const KIND_ICON = { section: LayoutDashboard, setting: Settings, creator: User, unclaimed: User, brand: Building2, agency: Building2, admin: Shield, waitlist: ClipboardList, campaign: Megaphone };
function SearchOverlay({ onClose, go, can = () => true }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  // v431 (audit #24 / #29): the people lists load only once something is typed, and only the ones this admin may open
  const typed = q.trim().length >= 2;
  const users = useAdminData("users", { enabled: typed && can("manage_users") }), wait = useAdminData("waitlist", { enabled: typed && can("manage_waitlist") }), camps = useAdminData("campaigns", { enabled: typed && can("manage_campaigns") });
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 40); return () => clearTimeout(t); }, []);
  const results = useMemo(() => searchAdmin(q, { users: (users.data || []).map((u) => u.raw), waitlist: wait.data || [], campaigns: camps.data || [] }), [q, users.data, wait.data, camps.data]);
  const open = (to) => {
    const p = Object.fromEntries(new URLSearchParams(String(to).split("?")[1] || ""));
    if (p.tab === "users" && p.role === "all") delete p.role;
    if (p.tab === "users" && p.role === "deleted") { p.full = 1; }
    go(p, { replace: true });
  };
  const loadingPeople = typed && ((can("manage_users") && users.loading) || (can("manage_waitlist") && wait.loading) || (can("manage_campaigns") && camps.loading));
  return (
    <div className="ybam-anim" style={{ position: "absolute", inset: 0, zIndex: 40, background: C.page, display: "flex", flexDirection: "column", animation: "ybamFade .15s ease-out" }} role="dialog" aria-modal="true" aria-label="Search the admin panel" data-testid="am-search">
      <div style={{ flexShrink: 0, padding: "calc(var(--yb-sat, 0px) + 10px) 16px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 6px 0 14px", background: "#FFFFFF", border: "1.5px solid #C084FC", borderRadius: 14, boxShadow: "0 0 0 3px #F3E8FF" }}>
          <Search size={18} color={C.mut2} aria-hidden />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators, brands, settings…" aria-label="Search the admin panel" enterKeyHint="search" data-testid="am-search-input"
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) open(results[0].to); if (e.key === "Escape") onClose(); }}
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 16, fontWeight: 500, color: C.ink, fontFamily: FONT }} />
          {q ? <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear" style={{ width: 34, height: 34, border: "none", background: "#F1F1F4", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={15} color={C.ink2} aria-hidden /></button> : null}
        </div>
        <button type="button" onClick={onClose} data-testid="am-search-cancel" style={{ border: "none", background: "none", color: C.purple, fontSize: 15.5, fontWeight: 600, cursor: "pointer", padding: "10px 2px", fontFamily: FONT }}>Cancel</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        {!q.trim() ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.mut, padding: "6px 4px 10px" }}>Jump to</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {QUICK.map(([label, Icon, to]) => (
                <button key={label} type="button" onClick={() => go(to, { replace: true })} style={{ height: 40, padding: "0 14px", borderRadius: 999, border: `1px solid ${C.line}`, background: "#FFFFFF", display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 600, color: C.ink, cursor: "pointer", fontFamily: FONT }}>
                  <Icon size={15} color={C.purple} aria-hidden />{label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 13, color: C.mut, lineHeight: 1.5, margin: "16px 4px 0" }}>Type a name, @handle, email, phone, campaign, or a word like “coupon”, “popup”, “maintenance”.</p>
          </>
        ) : results.length ? (
          <Card>
            {results.map((r, i) => {
              const k = KIND[r.kind] || KIND.section;
              const Icon = KIND_ICON[r.kind] || LayoutDashboard;
              const person = !["section", "setting"].includes(r.kind);
              return (
                <button key={`${r.kind}-${r.id}-${i}`} type="button" onClick={() => open(r.to)} data-testid="am-search-result" className="ybam-press"
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", minHeight: 58, background: "#FFFFFF", border: "none", borderTop: i ? `1px solid ${C.line2}` : "none", cursor: "pointer", textAlign: "left", fontFamily: FONT }}>
                  <span style={{ width: 36, height: 36, borderRadius: person ? 999 : 10, background: k.bg, color: k.fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700 }}>
                    {person && r.kind !== "campaign" ? initials(r.title) : <Icon size={16} aria-hidden />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
                    <span style={{ fontSize: 12, color: C.mut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", border: `1px solid ${k.border}`, background: k.bg, color: k.fg, borderRadius: 8, padding: "4px 7px" }}>{k.label}</span>
                </button>
              );
            })}
          </Card>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 10px", color: C.mut, fontSize: 14.5 }}>{loadingPeople ? "Searching…" : <>No results for “{q.trim()}”.</>}</div>
        )}
      </div>
    </div>
  );
}


// v431 (audit #25 / #53): broadcast ("all") notifications can't be marked read on the server — remember them on this
// phone so the bell clears.
const SEEN_ALL_KEY = "ybex_am_seen_all";
const seenAll = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_ALL_KEY) || "[]")); } catch { return new Set(); } };
const markSeenAll = (ids) => { try { const s = seenAll(); ids.forEach((i) => s.add(String(i))); localStorage.setItem(SEEN_ALL_KEY, JSON.stringify([...s].slice(-500))); } catch { /* storage off */ } };
const isUnread = (n) => !n.read && !n.is_read && !(n.user_id === "all" && seenAll().has(String(n.notif_id || n.id)));

// ---------------- notifications ----------------
function notifTarget(n) {
  const link = String(n.link || n.action_url || n.redirect_path || "");
  if (link.startsWith("/admin")) return Object.fromEntries(new URLSearchParams(link.split("?")[1] || ""));
  const t = `${n.type || ""} ${n.event_type || ""} ${n.title || ""}`.toLowerCase();
  if (/kyc|verification/.test(t)) return { tab: "verifications" };
  if (/payout|withdraw/.test(t)) return { tab: "escrow" };
  if (/refund/.test(t)) return { tab: "escrow", pay: "refunds" };
  if (/waitlist|signup|sign-up|registration/.test(t)) return { tab: "waitlist" };
  if (/campaign/.test(t)) return { tab: "campaigns" };
  if (/ticket|support|help/.test(t)) return { tab: "helpdesk" };
  if (/report|dispute|flag/.test(t)) return { tab: "reports" };
  if (/ugc|order/.test(t)) return { tab: "ugc-orders" };
  return null;
}
function NotifPanel({ onClose, go, queues }) {
  const notes = useAdminData("notifications");
  const list = (notes.data || []).slice(0, 60);
  const unread = list.filter(isUnread).length;
  const [marking, setMarking] = useState(false);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const markAll = async () => {
    if (marking) return; setMarking(true);
    markSeenAll(list.filter((n) => n.user_id === "all").map((n) => n.notif_id || n.id));
    try { await api.post("notifications/read-all"); afterWrite("notifications"); } catch { toast.error("Couldn't mark them read. Try again."); } finally { setMarking(false); }
  };
  const openNote = (n) => {
    if (n.user_id === "all") { markSeenAll([n.notif_id || n.id]); afterWrite("notifications"); }
    else if (!n.read && !n.is_read) api.post(`/notifications/${encodeURIComponent(n.notif_id || n.id)}/read`).then(() => afterWrite("notifications")).catch(() => {});
    const to = notifTarget(n);
    if (to) go(to, { replace: true }); else onClose();
  };
  const waiting = [
    ["Payout requests", Wallet, "#16A34A", queues.pay.payouts.length, { tab: "escrow" }],
    ["UGC refunds", Landmark, "#0EA5E9", queues.pay.refunds.length, { tab: "escrow", pay: "refunds" }],
    ["Referral withdrawals", Percent, "#D946EF", queues.pay.referral.length, { tab: "escrow", pay: "referral" }],
    ["KYC reviews", ShieldCheck, "#3B82F6", queues.kycCount, { tab: "verifications" }],
    ["Waitlist", UserPlus, "#A855F7", queues.waitCount, { tab: "waitlist" }],
    ["Help desk", CircleHelp, "#EC4899", queues.ticketCount, { tab: "helpdesk" }],
  ].filter((w) => w[3] > 0);
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 45, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} className="ybam-anim" style={{ position: "absolute", inset: 0, background: "rgba(10,10,10,0.42)", animation: "ybamFade .18s ease-out" }} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="ybam-notif-title" className="ybam-anim" data-testid="am-notif"
        style={{ position: "relative", maxHeight: "86%", background: C.page, borderRadius: "22px 22px 0 0", display: "flex", flexDirection: "column", animation: "ybamUp .26s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}><span style={{ width: 38, height: 5, borderRadius: 999, background: "#D4D4D8" }} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 10px 18px" }}>
          <h2 id="ybam-notif-title" style={{ flex: 1, margin: 0, fontSize: 19, fontWeight: 600 }}>Notifications</h2>
          {unread ? <button type="button" onClick={markAll} disabled={marking} data-testid="am-notif-readall" style={{ border: "none", background: "none", color: C.purple, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 6px", fontFamily: FONT }}>Mark all read</button> : null}
          <button type="button" onClick={onClose} aria-label="Close" data-testid="am-notif-close" style={{ width: 40, height: 40, borderRadius: 999, border: "none", background: "#E4E4EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={17} color={C.ink2} aria-hidden /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px calc(env(safe-area-inset-bottom, 0px) + 18px)", display: "flex", flexDirection: "column", gap: 16 }}>
          {waiting.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.mut, paddingLeft: 4 }}>Waiting on you</div>
              <div className="ybam-noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "0 16px", scrollbarWidth: "none" }}>
                {waiting.map(([label, Icon, color, n, to]) => (
                  <button key={label} type="button" onClick={() => go(to, { replace: true })} style={{ flexShrink: 0, width: 128, background: "#FFFFFF", border: `1px solid ${C.line}`, borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 8, cursor: "pointer", textAlign: "left", fontFamily: FONT }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Icon size={18} color={color} aria-hidden /><span style={{ fontSize: 18, fontWeight: 600, color: C.ink }}>{n}</span></span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, color: C.ink2 }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.mut, paddingLeft: 4 }}>Activity</div>
            {notes.loading ? <div className="ybam-skel" style={{ height: 120, borderRadius: 16 }} /> : !list.length ? (
              <Card style={{ padding: 24, textAlign: "center", fontSize: 14, color: C.mut }}>No notifications yet.</Card>
            ) : (
              <Card>
                {list.map((n, i) => {
                  const un = isUnread(n);
                  return (
                    <button key={n.notif_id || n.id || i} type="button" onClick={() => openNote(n)} data-testid="am-notif-row" className="ybam-press"
                      style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: un ? "#FBF9FF" : "#FFFFFF", border: "none", borderTop: i ? `1px solid ${C.line2}` : "none", cursor: "pointer", textAlign: "left", fontFamily: FONT }}>
                      <span style={{ width: 32, height: 32, borderRadius: 10, background: "#F5F0FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Bell size={16} color={C.purple} aria-hidden /></span>
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 14.5, fontWeight: un ? 600 : 500, color: C.ink, lineHeight: 1.35, overflowWrap: "anywhere" }}>{n.title || n.message}</span>
                        {n.title && n.message ? <span style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.35, overflowWrap: "anywhere" }}>{String(n.message).slice(0, 140)}</span> : null}
                        <span style={{ fontSize: 12, color: C.mut2 }}>{ago(n.created_at)}</span>
                      </span>
                      {un ? <span style={{ width: 8, height: 8, borderRadius: 999, background: C.purple, flexShrink: 0, marginTop: 6 }} aria-label="Unread" /> : null}
                    </button>
                  );
                })}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
