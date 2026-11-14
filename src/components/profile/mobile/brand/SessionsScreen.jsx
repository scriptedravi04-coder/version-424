import React, { useState, useEffect, useCallback } from "react";
import { Smartphone, Monitor, LogOut } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../contexts/AuthContext";
import { MobileScreen, Section, Card, Loader, Pill, EmptyState } from "./brandMobileUi";

// Screen 1i — devices & sessions. GET sessions, POST sessions/logout/:token and
// POST sessions/logout-others are the same three calls the desktop settings tab makes.

function relativeTime(iso) {
  if (!iso) return "Unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 2) return "Active now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); // v332: IST
}

// v415: a raw browser string ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 …)") was shown as the device name.
export function deviceLabel(raw) {
  const ua = String(raw || "").trim();
  if (!ua) return "Unknown device";
  if (!/mozilla\/|applewebkit|gecko|okhttp|dalvik|cfnetwork/i.test(ua)) return ua.length > 48 ? `${ua.slice(0, 45)}…` : ua; // already a name
  const os = /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : /android/i.test(ua) ? "Android"
    : /windows/i.test(ua) ? "Windows" : /mac os x|macintosh/i.test(ua) ? "Mac" : /cros/i.test(ua) ? "Chromebook" : /linux/i.test(ua) ? "Linux" : "";
  const app = /ybex/i.test(ua) || /okhttp|dalvik|cfnetwork|; wv\)/i.test(ua) ? "Ybex app"
    : /edg\//i.test(ua) ? "Edge" : /opr\/|opera/i.test(ua) ? "Opera" : /samsungbrowser/i.test(ua) ? "Samsung Internet"
    : /firefox|fxios/i.test(ua) ? "Firefox" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "";
  if (app && os) return `${app} on ${os}`;
  return app || os || "Unknown device";
}

export default function SessionsScreen({ onBack }) {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false); // v415: "couldn't load" only when the request failed

  const fetchSessions = useCallback(async () => {
    try {
      const { data } = await api.get("sessions", { bypassCache: true }).catch(() => ({ data: null }));
      setSessions(Array.isArray(data) ? data : []);
      setLoadFailed(!Array.isArray(data));
    } catch (e) {
      console.warn("Failed to load sessions:", e);
      setSessions([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const logoutSession = async (token) => {
    setBusy(token);
    try {
      await api.post(`sessions/logout/${token}`);
      toast.success("Logged out of that device."); // v415: same verb as the buttons
      await fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || "Couldn't end that session.");
    } finally {
      setBusy(null);
    }
  };

  const logoutOthers = async () => {
    setBusy("others");
    try {
      await api.post("sessions/logout-others");
      toast.success("Logged out of all other devices."); // v415
      await fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || "Couldn't end the other sessions.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <MobileScreen title="Devices & sessions" onBack={onBack}>
        <Loader label="Checking where you're signed in…" />
      </MobileScreen>
    );
  }

  const current = sessions.find((s) => s.isCurrent || s.is_current);
  const others = sessions.filter((s) => !(s.isCurrent || s.is_current));

  const nameOf = (s) => deviceLabel(s.device_name || s.device || s.user_agent); // v415
  const placeOf = (s) => s.location || s.city || "Location unknown";

  return (
    <MobileScreen title="Devices & sessions" onBack={onBack}>
      <Section hint={
        sessions.length
          ? `Signed in on ${sessions.length} device${sessions.length === 1 ? "" : "s"}. Logging out of this device logs you out of the app.` /* v415 */
          : undefined
      }>
        {sessions.length === 0 ? (
          <Card className="border-dashed">
            <EmptyState
              icon={Smartphone}
              title={loadFailed ? "Couldn't load your sessions" : "No other sessions"}
              body={loadFailed ? "We couldn't read your active sessions right now. Please try again in a moment." : "You're only signed in on this device."}
              action={
                // v332: there was no way to retry ("Pull back" did nothing) — same GET sessions call again
                <button type="button" onClick={() => { setLoading(true); fetchSessions(); }} className="h-11 px-5 rounded-xl bg-[#7C3AED] text-white font-bold text-sm">
                  Try again
                </button>
              }
            />
          </Card>
        ) : (
          <>
            {current && (
              <>
                <div className="text-xs font-bold text-gray-600 mb-2">This device</div>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Smartphone size={18} className="text-gray-900 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-gray-900 truncate min-w-0">{nameOf(current)}</span>
                        <Pill tone="green">Active now</Pill>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{placeOf(current)}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => { setBusy("self"); try { await logout(); } finally { setBusy(null); } }}
                    disabled={busy === "self"}
                    aria-busy={busy === "self" || undefined} // v415: busy state, no double tap
                    className="mt-3 disabled:opacity-60 w-full h-11 rounded-xl border border-gray-200 text-gray-900 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-50"
                  >
                    <LogOut size={14} /> {busy === "self" ? "Logging out…" : "Log out of this device"}
                  </button>
                </Card>
              </>
            )}

            {others.length > 0 && (
              <>
                <div className="text-xs font-bold text-gray-600 mt-5 mb-2">Other sessions</div>
                <Card>
                  {others.map((s, idx) => (
                    <div
                      key={s.session_token || idx}
                      className={`px-4 py-3.5 flex items-center gap-3 ${idx !== others.length - 1 ? "border-b border-gray-100" : ""}`}
                    >
                      <Monitor size={17} className="text-gray-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{nameOf(s)}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {placeOf(s)} · {relativeTime(s.last_active_at || s.updated_at || s.created_at)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => logoutSession(s.session_token)}
                        disabled={busy === s.session_token || !s.session_token}
                        className="text-xs font-bold text-red-600 flex-shrink-0 disabled:opacity-50 min-h-[40px] px-2 -mr-2"
                      >
                        {busy === s.session_token ? "Logging out…" : "Log out"}{/* v332: 40px tap target, readable busy text */}
                      </button>
                    </div>
                  ))}
                </Card>

                <button
                  type="button"
                  onClick={logoutOthers}
                  disabled={busy === "others"}
                  aria-busy={busy === "others" || undefined} // v415
                  className="mt-4 w-full h-12 rounded-xl bg-red-50 text-red-700 font-bold text-sm disabled:opacity-50"
                >
                  {busy === "others" ? "Logging out…" : "Log out of all other devices"}{/* v415: same verb everywhere */}
                </button>
              </>
            )}
          </>
        )}
      </Section>
    </MobileScreen>
  );
}
