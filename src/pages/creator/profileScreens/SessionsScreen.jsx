import React from "react";
import { Smartphone, MonitorSmartphone } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word — the "sessions" screen.
// Everything it needs comes in as props from CreatorMobileProfile; no logic or server call changed.
export default function SessionsScreen(props) {
  const { handleLogoutAllOtherSessions, handleLogoutSession, renderBackHeader, sessionsList } = props;

    // v332: no made-up "Mobile Browser · India" when the list is empty
    const currentSession = sessionsList.find(s => s.isCurrent) || {
      device: "This device",
      location: "",
      isCurrent: true
    };
    const otherSessions = sessionsList.filter(s => !s.isCurrent);
    // Session 40: when each other device was last used.
    const lastActive = (iso) => {
      const t = Date.parse(iso || "");
      if (!t) return "";
      const m = Math.max(0, Math.round((Date.now() - t) / 60000));
      if (m < 2) return "Active now";
      if (m < 60) return `Active ${m} min ago`;
      const h = Math.round(m / 60);
      if (h < 24) return `Active ${h} h ago`;
      return `Active ${new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`; // v332: IST
    };

    return (
      <div className="min-h-screen bg-white flex flex-col pb-28">
        {renderBackHeader("Device sessions")}

        <div className="p-5 space-y-6">
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Everywhere your Ybex account is currently signed in.
          </p>

          {/* Current Device */}
          <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider -mb-3">This device</h4>
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                <Smartphone size={18} />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  {currentSession.device || currentSession.device_name || "This device"}
                  <span className="text-[11px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    Active now
                  </span>
                </h4>
                <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                  {currentSession.location || "Signed in now"}
                </span>
              </div>
            </div>
          </div>

          {/* Other Devices */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                OTHER DEVICES · {otherSessions.length}
              </h4>
              {otherSessions.length > 0 && (
                <button
                  onClick={handleLogoutAllOtherSessions}
                  className="text-xs font-bold text-rose-500 hover:text-rose-600 min-h-9 px-2 -mr-2" /* v332: 36px tap target */
                >
                  Log out all
                </button>
              )}
            </div>

            {otherSessions.length > 0 ? (
              <div className="space-y-2">
                {otherSessions.map((sess) => (
                  <div
                    key={sess.session_token}
                    className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-3.5 flex items-center justify-between shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MonitorSmartphone size={18} className="text-slate-500 shrink-0" />
                      <div className="min-w-0">{/* v330: long device names no longer push "End" off-screen */}
                        <h5 className="font-extrabold text-xs text-slate-800 truncate">
                          {sess.device || sess.device_name || "Web Browser"}
                        </h5>
                        <span className="text-[10px] text-slate-500 font-bold block">
                          {[lastActive(sess.last_active || sess.created_at), sess.location].filter(Boolean).join(" · ") || "Location unknown"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleLogoutSession(sess.session_token)}
                      className="shrink-0 min-h-9 px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" /* v330: 36px tap target */
                    >
                      End
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 text-center">
                <p className="text-xs text-slate-500 font-medium">No other active device logins.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  
}
