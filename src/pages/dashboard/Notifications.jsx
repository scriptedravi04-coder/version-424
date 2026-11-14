import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { Bell, Check } from "lucide-react";
import { formatEnglishNotification } from "../../utils/translateNotification";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import { OfflineAware } from "../../components/common/OfflineState"; // v334
import { resolveNotificationTarget } from "../../components/inbox/mobile/NotificationsMobile";

const NOTI_ICONS = {
  KYC_APPROVED: '✅',
  KYC_REJECTED: '❌',
  CAMPAIGN_LIVE: '🚀',
  CAMPAIGN_REJECTED: '❌',
  NEW_APPLICATION: '📩',
  SHORTLISTED: '⭐',
  CHAT_UNLOCKED: '💬',
  OFFER_RECEIVED: '💰',
  DEAL_SIGNED: '🤝',
  CONTENT_SUBMITTED: '🎬',
  CONTENT_APPROVED: '✅',
  REVISION_REQUESTED: '✏️',
  PROOF_SUBMITTED: '📊',
  PAYMENT_RECEIVED: '💸',
  PAYMENT_PENDING: '⏳',
  PAYMENT_METHOD_APPROVED: '🏦',
  PAYMENT_METHOD_REJECTED: '🚫',
  WARNING_ISSUED: '⚠️',
  ACCOUNT_RESTRICTED: '🔒',
  campaign_application_approved: '✅',
  campaign_application_declined: '❌',
  collab_action: '🤝',
  wave: '👋',
  collab_request: '💼'
};

function formatTimeAgo(dateString) {
  try {
    const now = new Date();
    const past = new Date(dateString);
    const ms = now.getTime() - past.getTime();
    if (isNaN(ms)) return "just now";
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    
    return past.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }) /* v330: IST */;
  } catch (e) {
    return "recently";
  }
}

export default function Notifications() {
  const [items, setItems] = useState([]);
  // v330: loading + error states — a failed load used to show "No updates yet".
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isBusy, run } = useBusy();

  const load = async () => {
    try {
      const { data } = await api.get("notifications", { timeout: 10000 });
      if (Array.isArray(data)) { setItems(data); } else { setItems([]); }
      setLoadError(false);
    } catch (e) {
      setLoadError(true);
      if (e?.message?.includes("timeout") || e?.code === "ECONNABORTED") {
        console.warn("Loading notifications timed out; will retry on refresh.");
      } else {
        console.error("Error loading notifications:", e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // v332: busy state (double clicks sent it twice) and a calm message when it fails (was silent).
  const markAll = () => run("markAll", async () => {
    try {
      await api.post("notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      load();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't mark them as read. Please try again.");
    }
  });

  const markOneRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setItems((prev) =>
        prev?.map((n) => ((n.notif_id || n.id) === id ? { ...n, read: true } : n))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const hasUnread = items.some((n) => !n.read);

  return (
    <div className="w-full max-w-none px-4 md:px-8 py-10" data-testid="notifications-page">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8 border-b border-foreground/5 pb-4">{/* v332: wraps on narrow screens */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--violet)]/10 text-[var(--violet)] flex items-center justify-center shadow-inner">
            <Bell size={22} />
          </div>
          <div>
            <h1 className="font-sans font-bold text-2xl tracking-tight text-[var(--text-primary)]">Notifications</h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">Stay up to date with your collaborations and transactions</p>
          </div>
        </div>
        {hasUnread && (
          <button
            onClick={markAll}
            disabled={isBusy("markAll")}
            data-testid="mark-all-read"
            className="min-h-[36px] disabled:opacity-60 text-xs text-[var(--violet)] hover:text-[#7C5CFF] font-bold transition-all bg-[var(--violet)]/5 hover:bg-[var(--violet)]/10 px-3 py-1.5 rounded-lg border border-[var(--violet)]/20 cursor-pointer"
          >
            {isBusy("markAll") ? <ButtonSpinner label="Mark all read" size={12} /> : "Mark all read"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* v330: spinner while loading, retry card when the request failed */}
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-20" role="status" aria-label="Loading notifications">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--violet)]/20 border-t-[var(--violet)] animate-spin" />
          </div>
        ) : loadError && items.length === 0 ? (
          <OfflineAware className="max-w-lg mx-auto w-full" onRetry={() => load()}>{/* v334: offline → OfflineState */}
          <div className="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto w-full bg-[var(--bg-card)] rounded-2xl border border-foreground/5">
            <h2 className="font-sans text-lg font-bold text-[var(--text-primary)] mb-1">Couldn't load notifications</h2>
            <p className="text-sm text-[var(--text-secondary)] px-6 mb-4">Please check your connection and try again.</p>
            <button type="button" onClick={() => { setLoading(true); load(); }} className="min-h-[40px] px-5 rounded-xl bg-[var(--violet)] text-white text-sm font-bold cursor-pointer">Try again</button>
          </div>
          </OfflineAware>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center relative max-w-lg mx-auto w-full bg-[var(--bg-card)] rounded-2xl border border-foreground/5 shadow-inner">
            <div className="w-16 h-16 rounded-full bg-foreground/5 flex items-center justify-center text-3xl mb-4">🔔</div>
            <h2 className="font-sans text-lg font-bold text-[var(--text-primary)] mb-1">No updates yet</h2>
            <p className="text-sm text-[var(--text-secondary)] px-6">We will notify you here as soon as there is activity on your profile, campaigns, or deals.</p>
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-foreground/5 rounded-2xl overflow-hidden divide-y divide-foreground/5 shadow-md">
            {items?.map((n, idx) => {
              const icon = NOTI_ICONS[n.type] || "📢";
              const timeAgo = formatTimeAgo(n.created_at);
              const isRead = n.read;
              // v332: rows only marked themselves read and went nowhere; now they open the deal / page
              // (same rule as the mobile list). Rows saved with "id" instead of "notif_id" sent ".../undefined/read".
              const nid = n.notif_id || n.id;
              const target = resolveNotificationTarget(n, user?.role === "brand" ? "brand" : "creator");
              const open = () => {
                if (!isRead && nid) markOneRead(nid);
                if (target && !/\/(brand|creator)\/inbox\/?$/.test(target)) navigate(target);
              };

              return (
                <div
                  key={`${nid}-${idx}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
                  onClick={open}
                  className={`flex items-start gap-4 p-5 transition-all select-none cursor-pointer hover:bg-foreground/5 ${
                    !isRead ? "bg-[var(--violet)]/5 border-l-2 border-l-[#7C5CFF]" : ""
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    !isRead ? "bg-[var(--violet)]/20 text-[var(--violet)]" : "bg-foreground/5"
                  }`}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm break-words ${isRead ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)] font-medium"}`}>
                      {formatEnglishNotification(n.message)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{timeAgo}</span>
                      {!isRead && (
                        <span className="inline-block w-1.5 h-1.5 bg-[var(--violet)] rounded-full" />
                      )}
                    </div>
                  </div>
                  {isRead && <Check size={16} className="text-[var(--text-tertiary)] shrink-0 self-center" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
