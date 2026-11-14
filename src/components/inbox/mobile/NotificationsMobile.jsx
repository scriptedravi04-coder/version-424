import React, { useState, useEffect } from "react";
import { ChevronLeft, Bell, Clock, AlertCircle, CreditCard, MessageSquare, CheckCircle2 } from "lucide-react";
import { api, isBrandLike } from "../../../lib/api"; // v416: + isBrandLike
import { NotificationListSkeleton } from "../../common/MobileSkeletons";
import ButtonSpinner from "../../common/ButtonSpinner";
import { OfflineAware } from "../../common/OfflineState"; // v334
import { toast } from "sonner";


// Session 43 (Ravi: "only the red ones open"): every notification goes somewhere. A saved link
// wins; otherwise the thread / campaign ids it carries; otherwise its wording decides the page.
export function resolveNotificationTarget(n, role = "creator") {
  if (!n) return null;
  const meta = n.metadata && typeof n.metadata === "object" ? n.metadata : {};
  const path = n.redirect_path || n.action_url || n.link || meta.link || meta.redirect_path || "";
  if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) return path;
  const threadId = n.thread_id || n.deal_id || n.order_id || meta.thread_id || meta.deal_id || meta.order_id;
  if (threadId) return `/chat/${threadId}`;
  const isBrand = isBrandLike(role); // v416: agencies / talent managers are brands too
  const text = `${n.title || ""} ${n.message || n.content || n.body || ""} ${n.type || ""}`.toLowerCase();
  const campaignId = n.campaign_id || meta.campaign_id;
  if (/applied to your campaign|new application/.test(text)) {
    return isBrand ? (campaignId ? `/brand/campaigns/${campaignId}/applicants` : "/brand/campaigns") : "/campaigns";
  }
  if (/payout|payment|released|utr|earning|refund/.test(text)) return isBrand ? "/brand/payments" : "/earnings";
  if (/ugc/.test(text)) return isBrand ? "/brand/ugc/orders" : "/creator/ugc/orders";
  if (/campaign .*(live|under review|re-review|submitted successfully)|is now live/.test(text)) {
    return isBrand ? "/brand/campaigns" : (campaignId ? `/campaigns/${campaignId}` : "/campaigns");
  }
  return isBrand ? "/brand/inbox" : "/creator/inbox";
}

/** Session 43: a real title instead of the bare word "Notification". */
export function notificationTitle(n) {
  const raw = String(n?.title || "").trim();
  if (raw && raw.toLowerCase() !== "notification") return raw;
  const text = String(n?.message || n?.content || n?.body || "").toLowerCase();
  if (text.includes("applied to your campaign")) return "New application";
  if (text.includes("accepted your invitation")) return "Invitation accepted";
  if (text.includes("is now live")) return "Campaign is live";
  if (text.includes("re-review")) return "Campaign sent for review";
  if (text.includes("under review")) return "Campaign under review";
  if (text.includes("invited you")) return "New campaign invite";
  if (/payout|payment|released|\butr\b|₹/.test(text)) return "Payment update"; // v353: "₹3,000 released…" was "Update"
  if (/\boffer\b/.test(text)) return "New offer"; // v353
  if (/\bmessage\b/.test(text)) return "New message"; // v353
  return "Update";
}

/** Session 43 (Ravi): true when this phone has not turned notifications on yet. */
export function needsPushAllow() {
  try {
    if (typeof window === "undefined") return false;
    if (!("Notification" in window)) return true; // iPhone Safari tab: must install first
    return window.Notification.permission !== "granted";
  } catch {
    return false;
  }
}

function AllowPushButton() {
  const [need, setNeed] = useState(needsPushAllow);
  useEffect(() => {
    const recheck = () => setNeed(needsPushAllow());
    window.addEventListener("ybex:push-permission-changed", recheck);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("ybex:push-permission-changed", recheck);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);
  if (!need) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("ybex:open-push-ask"))}
      data-testid="notif-allow-push"
      className="h-8 pl-2.5 pr-3 rounded-full bg-[#F5F0FF] border border-[#DDD6FE] text-[12px] font-semibold text-[#6D28D9] inline-flex items-center gap-1.5 active:scale-95 transition-transform"
    >
      <Bell size={13} strokeWidth={2.4} />
      Allow notifications
    </button>
  );
}

export default function NotificationsMobile({ role = "brand", onBack, onSelectNotification = null }) {
  const [activeTab, setActiveTab] = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  // A failed load used to show "You're all caught up" — now it says so and offers a retry.
  const [loadFailed, setLoadFailed] = useState(false);

  const isBrand = isBrandLike(role); // v416: agencies / talent managers are brands too

  const tabs = isBrand
    ? [
        { id: "all", label: "All" },
        { id: "orders", label: "Orders" },
        { id: "payments", label: "Payments" },
      ]
    : [
        { id: "all", label: "All" },
        { id: "briefs", label: "Briefs" },
        { id: "payouts", label: "Payouts" },
      ];

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const { data } = await api.get("notifications", { bypassCache: true });
      if (Array.isArray(data)) {
        setNotifications(data);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setNotifications([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // v372 (Ravi's video: the bell kept saying "4" after opening and reading every notification): opening the list
  // counts as seen — the bell's number clears on the server. The new ones stay highlighted on this screen until you leave.
  useEffect(() => {
    if (loading || loadFailed || !notifications.some((n) => !n.read)) return undefined;
    const t = setTimeout(() => { api.post("notifications/read-all").catch(() => { /* bell stays — no harm */ }); }, 1200);
    return () => clearTimeout(t);
  }, [loading, loadFailed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkAllRead = async () => {
    try {
      setMarkingAll(true);
      await api.post("notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
      toast.error("Couldn't mark them as read. Please try again."); // v332: a failed tap used to do nothing at all
    } finally {
      setMarkingAll(false);
    }
  };

  const handleItemClick = async (item) => {
    if (!item.read) {
      try {
        await api.post(`notifications/${item.notif_id || item.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => ((n.notif_id || n.id) === (item.notif_id || item.id) ? { ...n, read: true } : n))
        );
      } catch (e) {
        // silent
      }
    }
    if (onSelectNotification) {
      onSelectNotification(item);
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    if (activeTab === "all") return true;
    const type = String(item.type || item.subtype || "").toLowerCase();
    const title = String(item.title || "").toLowerCase();
    const msg = String(item.message || "").toLowerCase();

    if (isBrand) {
      if (activeTab === "orders") {
        return (
          type.includes("order") ||
          type.includes("brief") ||
          type.includes("campaign") ||
          type.includes("draft") ||
          type.includes("deliverable") ||
          title.includes("order") ||
          title.includes("draft")
        );
      }
      if (activeTab === "payments") {
        return (
          type.includes("payment") ||
          type.includes("escrow") ||
          type.includes("payout") ||
          title.includes("payment") ||
          title.includes("escrow") ||
          msg.includes("₹")
        );
      }
    } else {
      if (activeTab === "briefs") {
        return (
          type.includes("brief") ||
          type.includes("campaign") ||
          type.includes("order") ||
          type.includes("draft") ||
          title.includes("brief") ||
          title.includes("campaign")
        );
      }
      if (activeTab === "payouts") {
        return (
          type.includes("payout") ||
          type.includes("payment") ||
          type.includes("escrow") ||
          title.includes("payout") ||
          title.includes("payment") // v419 (QA): "₹" in any message ("get ₹300 cash" promo) put it under Payouts
        );
      }
    }
    return true;
  });

  const getNotificationCategory = (item) => {
    const text = `${item.title || ""} ${item.message || ""} ${item.type || ""}`.toLowerCase();
    // v353: "sla" matched inside any word ("translation", "Islam"), and brand-only "review draft" text gave the
    // creator a "Reupload draft" button. Whole words, and each side only gets its own kind.
    const draftForBrand = /waiting on your review|review (the )?draft|\bsla\b/.test(text);
    const draftForCreator = /\bre-?upload|changes requested|revision requested/.test(text);
    if (isBrand ? draftForBrand : draftForCreator) {
      return {
        color: "amber",
        borderColor: "#F59E0B",
        bg: "#FFFBEB",
        icon: <Clock size={16} className="text-amber-600" />,
        actionLabel: isBrand ? "Review draft" : "Reupload draft",
      };
    }
    if (text.includes("counter") || text.includes("expire") || text.includes("declined") || text.includes("alert")) {
      return {
        color: "red",
        borderColor: "#EF4444",
        bg: "#FEF2F2",
        icon: <AlertCircle size={16} className="text-red-600" />,
        actionLabel: text.includes("counter") ? "Respond to counter" : null,
      };
    }
    if (text.includes("escrow") || text.includes("deposit") || text.includes("payment")) {
      return {
        color: "purple",
        borderColor: "#8B5CF6",
        bg: "#F5F3FF",
        icon: <CreditCard size={16} className="text-[#7C3AED]" />,
        actionLabel: null,
      };
    }
    if (text.includes("released") || text.includes("received") || text.includes("completed") || text.includes("approved")) {
      return {
        color: "green",
        borderColor: "#10B981",
        bg: "#ECFDF5",
        icon: <CheckCircle2 size={16} className="text-emerald-600" />,
        actionLabel: null,
      };
    }
    return {
      color: "gray",
      borderColor: "#9CA3AF",
      bg: "#F9FAFB",
      icon: <MessageSquare size={16} className="text-gray-500" />,
      actionLabel: null,
    };
  };

  // Group by calendar day (session 40: "yesterday" used to be "less than 48 hours ago", so an item
  // from two days back landed under Yesterday, and older items showed only a time).
  // v332: days are counted in IST (the times shown are IST) — on a phone set to another time zone,
  // an 11:30 pm IST item landed under the wrong day.
  const now = new Date();
  const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayKey = dayKey(now);
  const yest = new Date(now.getTime() - 86400000);
  const yesterdayKey = dayKey(yest);
  const todayItems = [];
  const yesterdayItems = [];
  const olderItems = [];

  filteredNotifications.forEach((item) => {
    const d = new Date(item.created_at || item.timestamp || Date.now());
    const k = Number.isNaN(d.getTime()) ? todayKey : dayKey(d);
    if (k === todayKey) todayItems.push(item);
    else if (k === yesterdayKey) yesterdayItems.push(item);
    else olderItems.push(item);
  });

  const whenText = (iso, older) => {
    if (!iso) return "Just now";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" /* v330: IST */ }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase());
    // v332: the date part was in the phone's time zone, the time in IST
    return older ? `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}, ${time}` : time;
  };

  const renderSection = (title, items) => {
    if (!items || items.length === 0) return null;
    return (
      <div key={title} className="mb-4">
        <div className="text-[11px] font-bold text-gray-500 tracking-wider px-4 py-2 uppercase">
          {title}
        </div>
        <div className="divide-y divide-gray-100 bg-white">
          {items.map((item) => {
            const meta = getNotificationCategory(item);
            const id = item.notif_id || item.id || item._id;
            return (
              <div
                key={id}
                role="button" /* v330: tappable row had no role / keyboard access */
                tabIndex={0}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); handleItemClick(item); } }}
                onClick={() => handleItemClick(item)}
                className={`p-4 flex gap-3.5 transition cursor-pointer relative ${
                  item.read ? "bg-white" : "bg-[#FAF8FF]"
                }`}
                style={{
                  borderLeft: `3px solid ${meta.borderColor}`,
                }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: meta.bg }}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-bold text-gray-900 truncate pr-2">
                      {notificationTitle(item)}
                    </span>
                    <span className="text-[11px] text-gray-500 shrink-0">
                      {whenText(item.created_at, title === "OLDER")}
                    </span>
                  </div>
                  <p className="text-[13px] text-gray-600 leading-relaxed mb-2 break-words [overflow-wrap:anywhere]">{/* v330: long links overflowed */}
                    {item.message || item.content || item.body || ""}
                  </p>
                  {meta.actionLabel && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold hover:bg-[#6D28D9] transition"
                    >
                      {meta.actionLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-[#F8F9FB] flex flex-col font-sans">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 pt-3 pb-3 z-10 shrink-0">
        {/* v332: wraps on 320–360px phones — title + "Allow notifications" + "Mark all read" overflowed the row */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onBack}
              className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center hover:bg-gray-100 transition active:scale-95" /* v332: 40px tap target */
              aria-label="Back to inbox"
            >
              <ChevronLeft size={22} className="text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
          <AllowPushButton />
          {false && notifications.some((n) => !n.read) && ( /* v426: opening the list already marks everything read (v372) — the button did nothing */
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="h-9 text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] px-2 rounded transition active:opacity-70 disabled:opacity-50" /* v332: 36px tap height (was ~24px) */
          >
            {markingAll ? <ButtonSpinner label="Mark all read" size={12} /> /* v332: spinner rule (was "Marking...") */ : "Mark all read"}
          </button>
          )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`h-8 px-3.5 rounded-full text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[#0A0A0A] text-white shadow-xs"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <NotificationListSkeleton count={6} />
        ) : loadFailed ? (
          <OfflineAware className="px-4 pt-6" onRetry={fetchNotifications}>{/* v334: offline → OfflineState */}
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <h3 className="text-base font-bold text-gray-900 mb-1">Couldn't load notifications</h3>
            <p className="text-xs text-gray-500 mb-4">Check your connection and try again.</p>
            <button
              onClick={fetchNotifications}
              className="px-4 py-2 bg-[#7C3AED] text-white rounded-lg text-xs font-semibold"
            >
              Retry
            </button>
          </div>
          </OfflineAware>
        ) : filteredNotifications.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500 mb-3">
              <Bell size={24} />
            </div>
            {/* v332: an empty Orders/Payments tab said "all caught up" even when other tabs had unread items */}
            <h3 className="text-base font-bold text-gray-900 mb-1">{activeTab !== "all" && notifications.length > 0 ? "Nothing in this tab" : "You're all caught up"}</h3>
            <p className="text-xs text-gray-500 max-w-[260px] leading-relaxed">
              {activeTab !== "all" && notifications.length > 0
                ? "Switch to All to see your other updates."
                : "Deadlines, secure payment hold movements and payouts show up here first."}
            </p>
          </div>
        ) : (
          <div className="pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">{/* v332: last item clear of the iPhone home bar */}
            {todayItems.length > 0 && renderSection("TODAY", todayItems)}
            {yesterdayItems.length > 0 && renderSection("YESTERDAY", yesterdayItems)}
            {olderItems.length > 0 && renderSection("OLDER", olderItems)}
          </div>
        )}
      </div>
    </div>
  );
}
