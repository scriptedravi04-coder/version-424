import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { isBrandLike } from "../../lib/api"; // v416 (CR4): one brand-role check
import { formatEnglishNotification } from "../../utils/translateNotification";
import { resolveNotificationTarget } from "../inbox/mobile/NotificationsMobile";

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

// v416 (CR13): which UGC order a notification is about (event_ref_id is the order id on UGC events)
export function ugcOrderIdOf(notification) {
  const n = notification || {};
  const cand = [n.metadata?.order_id, n.metadata?.ugc_order_id, n.order_id, n.event_ref_id, n.ref_id];
  for (const c of cand) { const v = String(c || ""); if (/^ugcord_/i.test(v)) return v; }
  return "";
}
/** v416 (CR13): "/brand/ugc/orders" → "/brand/ugc/orders?order=<id>" so the screen opens that order. */
export function withUgcOrderLink(path, notification) {
  if (typeof path !== "string" || !/^\/brand\/ugc\/orders\/?$/.test(path)) return path;
  const id = ugcOrderIdOf(notification);
  return id ? `${path.replace(/\/$/, "")}?order=${encodeURIComponent(id)}` : path;
}

export function getNotificationRedirectPath(notification, role) {
  if (!notification) return null;
  
  const event_type = notification.event_type || notification.type;
  const event_ref_id = notification.event_ref_id || notification.ref_id;
  const subtype = notification.subtype;
  
  if (subtype === 'announcement' || (subtype === 'general' && !event_type)) {
    return null;
  }
  
  switch (event_type) {
    case 'application_shortlisted':
    case 'application_accepted':
    case 'application_rejected':
      return role === 'brand' 
        ? `/brand/campaigns` 
        : (event_ref_id ? `/campaigns/${event_ref_id}` : `/collabs`);
        
    case 'new_application':
      return event_ref_id ? `/brand/campaigns/${event_ref_id}/applicants` : `/brand/campaigns`;
      
    case 'deliverable_submitted':
    case 'deliverable_approved':
    case 'deliverable_revision':
      if (ugcOrderIdOf(notification)) return role === 'brand' ? `/brand/ugc/orders` : `/creator/ugc/orders`; // v416: a UGC order is not a deal page
      return event_ref_id ? `/deals/${event_ref_id}` : (role === 'brand' ? `/brand/ugc/orders` : `/creator/ugc/orders`);
      
    case 'escrow_deposited':
    case 'payout_success':
      return role === 'brand' ? `/brand/payments` : `/earnings`;
      
    case 'new_message':
    case 'new_message_brand':
      return event_ref_id ? `/chat/${event_ref_id}` : (role === 'brand' ? `/brand/inbox` : `/chat`);
      
    case 'new_kyc_submission':
      return event_ref_id ? `/admin?tab=kyc&user_id=${event_ref_id}` : `/admin`;
      
    case 'dispute_raised':
      return event_ref_id ? `/admin?tab=disputes&dispute_id=${event_ref_id}` : `/admin`;
      
    case 'new_support_ticket':
      return event_ref_id ? `/support/tickets/${event_ref_id}` : `/help/tickets`;
      
    case 'kyc_approved':
    case 'kyc_rejected':
    case 'brand_kyc_approved':
    case 'brand_kyc_rejected':
    case 'KYC_APPROVED':
    case 'KYC_REJECTED':
      return `/kyc/status`;

    case 'CONTENT_REJECTED':
    case 'PROOF_REJECTED':
    case 'content_rejected':
    case 'proof_rejected':
      if (ugcOrderIdOf(notification)) return role === 'brand' ? `/brand/ugc/orders` : `/creator/ugc/orders`; // v416: a UGC order is not a deal page
      return event_ref_id ? `/deals/${event_ref_id}` : (role === 'brand' ? `/brand/ugc/orders` : `/creator/ugc/orders`);

    case 'PROFILE_SAVED':
    case 'profile_saved':
      return role === 'brand' ? `/brand/profile` : `/creator/profile`;

    case 'COST_REQUEST':
    case 'cost_request':
      return `/collabs`;

    case 'UGC_READY':
    case 'UGC_REMINDER':
    case 'UGC_CANCELLED_REFUND':
    case 'ugc_ready':
    case 'ugc_reminder':
    case 'ugc_cancelled_refund':
      return role === 'brand' ? `/brand/ugc/orders` : `/creator/ugc/orders`;
      
    default: {
      const message = (notification.message || "").toLowerCase();
      const type = notification.type;
      
      // 1. Chat / DMs
      if (type === "CHAT_UNLOCKED" || type === "message" || type === "chat" || message.includes("message") || message.includes("chat") || message.includes("dm") || message.includes("msg")) {
        return role === "brand" ? "/brand/inbox" : "/chat";
      }

      // 2. Deals / UGC Orders
      if (
        type === "SHORTLISTED" || 
        type === "OFFER_RECEIVED" || 
        type === "DEAL_SIGNED" || 
        type === "CONTENT_SUBMITTED" || 
        type === "CONTENT_APPROVED" || 
        type === "REVISION_REQUESTED" || 
        type === "collab_action" || 
        type === "collab_request" ||
        message.includes("deal") || 
        message.includes("collab") || 
        message.includes("contract") || 
        message.includes("brief") || 
        message.includes("order")
      ) {
        return role === "brand" ? "/brand/ugc/orders" : "/creator/ugc/orders";
      }

      // 3. Campaigns
      if (
        type === "CAMPAIGN_LIVE" || 
        type === "CAMPAIGN_REJECTED" || 
        type === "campaign_application_approved" || 
        type === "campaign_application_declined" ||
        message.includes("campaign") || 
        message.includes("applicant") || 
        message.includes("application")
      ) {
        return role === "brand" ? "/brand/campaigns" : "/collabs";
      }

      // 4. Payments
      if (
        type === "PAYMENT_RECEIVED" || 
        type === "PAYMENT_PENDING" || 
        type === "PROOF_SUBMITTED" ||
        message.includes("payment") || 
        message.includes("payout") || 
        message.includes("money") || 
        message.includes("earning") || 
        message.includes("rupees") || 
        message.includes("₹")
      ) {
        return role === "brand" ? "/brand/payments" : "/earnings";
      }

      // 5. KYC / Settings
      if (type === "KYC_APPROVED" || type === "KYC_REJECTED" || message.includes("kyc") || message.includes("verification")) {
        return "/settings?section=kyc"; // Session 53: mobile reads "section" (desktop reads both)
      }

      return null;
    }
  }
}

export default function NotificationItem({ notification, onRead, onNavigate }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // v332: agency / talent-manager accounts are brands — their taps opened creator pages.
  const rawRole = String(user?.role || "creator");
  const role = isBrandLike(rawRole) ? "brand" : rawRole; // v416 (CR4): shared helper

  const icon = NOTI_ICONS[notification.type] || '🔔';
  const timeAgo = formatTimeAgo(notification.created_at);
  const isRead = notification.read;

  const handleClick = () => {
    // Mark as read if unread
    if (!isRead) {
      onRead(notification.notif_id);
    }
    
    // Session 58 (bug hunt): the link the server sends comes first (it was ignored, so admin messages with a link and
    // many events went nowhere); then the type rules; then the same fallback the phone bell uses.
    const own = notification.redirect_path || notification.link || notification?.metadata?.link || "";
    const path = (typeof own === "string" && own.startsWith("/") && !own.startsWith("//") ? own : null)
      || getNotificationRedirectPath(notification, role)
      || ((role === "brand" || role === "creator") && notification.subtype !== "welcome" ? resolveNotificationTarget(notification, role) : null);
    if (path) {
      navigate(withUgcOrderLink(path, notification)); // v416 (CR13): open the order itself
      onNavigate?.(); // v330: the bell drawer closes instead of staying open over the new page
    }
  };

  return (
    <div
      onClick={handleClick}
      role="button" tabIndex={0} /* v330: keyboard / screen-reader reachable row */
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(e); } }}
      className={`flex items-start gap-3 p-4 border-b border-foreground/5 hover:bg-foreground/5 cursor-pointer transition-colors ${
        !isRead ? 'bg-[var(--violet)]/5 border-l-2 border-l-[var(--violet)]' : ''
      }`}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-t-[14px] rounded-bl-[14px] rounded-br-[4px] flex items-center justify-center text-lg shrink-0 ${
        !isRead ? 'bg-[var(--violet)]/20 text-[var(--text-primary)]' : 'bg-foreground/5'
      }`}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug break-words ${isRead ? 'text-sm text-gray-500' : 'font-bold text-sm'}`}>
          {formatEnglishNotification(notification.message)}
        </p>
        <p className={`font-mono font-medium tracking-tight text-[11px] mt-1`}>{timeAgo}</p>
      </div>

      {/* Unread dot */}
      {!isRead && (
        <div className="w-2 h-2 bg-[var(--violet)] rounded-full shrink-0 mt-1.5" />
      )}
    </div>
  );
}
