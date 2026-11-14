import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { formatBudget, getDeliverablesCount } from "../../utils/invitationUtils";
import CreatorReviewInvitationModal from "./CreatorReviewInvitationModal";

// Session 26 (Ravi): direct campaign invitations on the MOBILE creator home, like the desktop
// dashboard's "Important for you" card. Basic UI only — the design comes later from Claude
// Design. Review opens the same CreatorReviewInvitationModal as desktop (Decline left,
// "Accept & open deal room" right); accepting opens the new deal chat.
export default function MobileCreatorInvites({ refreshKey = 0 }) {
  const navigate = useNavigate();
  const [invites, setInvites] = useState([]);
  const [reviewing, setReviewing] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("creators/invitations");
      const pending = Array.isArray(data?.pending) ? data.pending : [];
      setInvites(pending);
    } catch {
      // No invites shown is the safe fallback; the home screen keeps working.
      setInvites([]);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  // New invites show without a reload (session 27): on a socket event, on return to the app,
  // and once a minute as a safety net.
  useEffect(() => {
    const onFocus = () => { if (!document.hidden) load(); };
    window.addEventListener("ybex:invitation", load);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const t = setInterval(onFocus, 60000);
    return () => {
      window.removeEventListener("ybex:invitation", load);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(t);
    };
  }, [load]);

  if (invites.length === 0 && !reviewing) return null;

  return (
    <div style={{ padding: "14px 14px 0" }} data-testid="mobile-creator-invites">
      <div
        style={{
          background: "#fff",
          border: "1px solid #EAEAF2",
          borderRadius: 18,
          padding: 14,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: "#E11D48" }} />
          <span style={{ font: "800 10px 'DM Sans', sans-serif", letterSpacing: "0.9px", color: "#BE123C" }}>
            {invites.length === 1 ? "NEW CAMPAIGN INVITATION" : `${invites.length} CAMPAIGN INVITATIONS`}
          </span>
        </div>

        {invites.map((inv) => {
          const count = getDeliverablesCount(inv.deliverables);
          return (
            <div
              key={inv.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderTop: "1px solid #F0F0F5",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "700 13px 'DM Sans', sans-serif", color: "#0A0A0A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {inv.campaign_title || "Campaign invitation" /* v332: no blank title line */}
                </div>
                <div style={{ font: "500 11px 'DM Sans', sans-serif", color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {inv.brand_name || "A brand" /* v332: no lone " · " */} · {formatBudget(inv.proposed_budget || inv.budget_range)} · {count} {count === 1 ? "deliverable" : "deliverables"}
                </div>
              </div>
              {/* Primary action on the right (docs/code/ARCHITECTURE.md button rule). */}
              <button
                type="button"
                onClick={() => setReviewing(inv)}
                style={{
                  height: 40, // v332: 40px tap target (was 36)
                  padding: "0 14px",
                  borderRadius: 12,
                  background: "#7C3AED",
                  color: "#fff",
                  border: "none",
                  font: "800 12px 'DM Sans', sans-serif",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Review
              </button>
            </div>
          );
        })}
      </div>

      {reviewing && (
        <CreatorReviewInvitationModal
          isOpen={!!reviewing}
          invite={reviewing}
          onClose={() => setReviewing(null)}
          onAccepted={(_inv, threadId) => {
            setReviewing(null);
            load();
            navigate(threadId ? `/chat/${threadId}` : "/inbox");
          }}
          onDeclined={() => {
            setReviewing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
