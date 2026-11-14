import React from "react";
import { useNavigate } from "react-router-dom";
import InboxNotificationsMobile, { resolveNotificationTarget } from "../../inbox/mobile/NotificationsMobile";

// Session 24. /creator/notifications and /brand/notifications on mobile.
//
// This screen used to be its own copy that crashed on the first notification: it rendered
// <notif.icon /> but never set `icon` (React: "Element type is invalid… got: undefined"). The
// server always returns at least the "Welcome to YBEX!" item, so it crashed for nearly everyone.
// It also had a dead back button, no mark-read, and put the title through dangerouslySetInnerHTML.
//
// Now it is the same screen the inbox already opens (inbox/mobile/NotificationsMobile: plain-text
// rendering, mark one / mark all read via the desktop endpoints), with page navigation around it.
export function notificationTarget(n) {
  const path = n?.redirect_path || n?.action_url || n?.link || "";
  // Only in-app paths; never send the user to an outside URL from a notification.
  if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) return path;
  const threadId = n?.thread_id || n?.deal_id || n?.order_id;
  return threadId ? `/chat/${threadId}` : null;
}

export default function NotificationsMobile({ role = "brand" }) {
  const navigate = useNavigate();
  const home = role === "brand" ? "/brand" : "/dashboard";
  return (
    <InboxNotificationsMobile
      role={role}
      onBack={() => {
        if (typeof window !== "undefined" && window.history.length > 1) navigate(-1);
        else navigate(home);
      }}
      onSelectNotification={(n) => {
        // Session 43: every row opens something (see resolveNotificationTarget).
        const target = notificationTarget(n) || resolveNotificationTarget(n, role);
        if (target) navigate(target);
      }}
    />
  );
}
