import React, { useState } from "react";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import InstagramConnectCard, { disconnectInstagram } from "../../../components/instagram/InstagramConnectCard"; // v349
import { appConfirm } from "../../../components/common/Popup"; // v430: app confirm sheet


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word — the "platforms" screen.
// Everything it needs comes in as props from CreatorMobileProfile; no logic or server call changed.
// v363 (Ravi: "social handles wale page pe do do baar insta aa raha hai — ek hi rakho"; design 1c): Instagram shows
// ONCE — the live glass card on top. The typed-numbers Instagram card below is only used when the live fetch isn't
// switched on (the card hands it back as `fallback`). Then "Add more platforms", the no-access line and
// "Disconnect Instagram" at the very bottom (hard to tap by mistake).
export default function PlatformsScreen(props) {
  const { connectedSocials, handleOpenPlatformEdit, handleRemovePlatform, notConnectedSocials, profile, renderBackHeader, onInstagramChanged } = props;
  const [ig, setIg] = useState(null); // { available, synced, verified, handle } from the live card; null while loading
  const [reloadKey, setReloadKey] = useState(0);
  const [disconnecting, setDisconnecting] = useState(false);
  const liveIg = ig === null || ig.available; // while loading, keep Instagram out of the lists (no flash of a 2nd card)
  const isIg = (p) => p?.id === "instagram";
  const added = liveIg ? connectedSocials.filter((p) => !isIg(p)) : connectedSocials;
  const notAdded = liveIg ? notConnectedSocials.filter((p) => !isIg(p)) : notConnectedSocials;
  const doDisconnect = async () => {
    // v366: disconnect now removes the Instagram link fully (username, fetched numbers, verification)
    if (!(await appConfirm("Disconnect Instagram? Your Instagram username and its live numbers are removed from your profile and the Verified tick goes. You can connect again any time.", { ok: "Disconnect", danger: true }))) return;
    setDisconnecting(true);
    try { await disconnectInstagram(); toast.success("Instagram disconnected"); setReloadKey((k) => k + 1); onInstagramChanged?.(); }
    catch (e) { toast.error(e?.response?.data?.error || "Couldn't disconnect. Try again."); }
    finally { setDisconnecting(false); }
  };

    return (
      <div className="min-h-screen bg-white flex flex-col pb-28">
        {renderBackHeader("Social platforms")}

        <div className="p-5 space-y-6">
          {/* v349: live Instagram numbers (fetch by username, verify by DM code or Instagram Login); v363: the only Instagram card */}
          <InstagramConnectCard initialHandle={profile?.instagram_handle || ""} photo={profile?.photo || ""} compact onStatus={setIg} reloadKey={reloadKey} onUpdated={() => onInstagramChanged?.()} /* v366: hub strip refreshes */ />
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Add the other platforms you post on. Numbers you type yourself must be accurate — brands compare them against delivered results.
          </p>

          {/* Section: Added Platforms */}
          {added.length > 0 && (
            <div className="space-y-3">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Added · {added.length}
              </span>

              <div className="space-y-3">
                {added.map((platform) => {
                  const Icon = platform.icon;
                  const data = platform.data || {};
                  const followersFormatted = data.followers ? Number(data.followers).toLocaleString('en-IN') : "—";
                  const reachFormatted = data.reach ? Number(data.reach).toLocaleString('en-IN') : "—";
                  const engRate = data.followers && (data.likes || data.comments)
                    ? (((Number(data.likes || 0) + Number(data.comments || 0)) / Number(data.followers)) * 100).toFixed(2) + "%"
                    : "—"; // v330: no likes/comments entered → "—", not a misleading 0.00%

                  return (
                    <div
                      key={platform.id}
                      className="bg-[#FBF8FF] border border-[#7C3AED] rounded-2xl p-4 space-y-3 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-2 rounded-xl shrink-0 ${platform.bg} ${platform.text}`}>
                            <Icon size={18} />
                          </div>
                          <div className="min-w-0">{/* v330: long channel / profile URLs truncate instead of overflowing */}
                            <h4 className="text-xs font-black text-slate-900">{platform.name}</h4>
                            <span className="text-[11px] font-bold text-slate-500 block truncate">
                              {/* v332: a pasted link showed as "@https://…", and an empty one as "@handle" */}
                              {(() => { const h = String(data.handle || data.url || "").trim(); return !h ? "Handle not added" : /^https?:\/\//i.test(h) ? h.replace(/^https?:\/\/(www\.)?/i, "") : `@${h.replace(/^@/, "")}`; })()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 3-Column Stats Box (Instagram / Metrics) */}
                      {platform.hasMetrics && (
                        <div className="grid grid-cols-3 gap-2 bg-white rounded-xl p-2.5 border border-[#DDD6FE] text-center">
                          <div>
                            <span className="text-[11px] font-bold text-slate-500 uppercase block">Followers</span>
                            <span className="text-xs font-black text-slate-900">{followersFormatted}</span>
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-500 uppercase block">Avg Reach</span>
                            <span className="text-xs font-black text-slate-900">{reachFormatted}</span>
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-500 uppercase block">Engagement</span>
                            <span className="text-xs font-black text-[#7C3AED]">{engRate}</span>
                          </div>
                        </div>
                      )}

                      {/* Session 40: "Verified by Ybex" once the Ybex team approved the profile; until then Pending. */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500 font-medium">{/instagram/i.test(String(platform.name)) && profile?.instagram_synced_at && !profile?.instagram_stats?.error ? "Live from Instagram — updates every day." /* v349 */ : `Numbers you entered — not synced from ${platform.name}.`}</span>
                        {String(profile?.profile_status || "").toLowerCase() === "approved" ? (
                          <span className="shrink-0 text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Verified by Ybex</span>
                        ) : (
                          <span className="shrink-0 text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Pending</span>
                        )}
                      </div>

                      {/* Action buttons: Update / Remove */}
                      {/* v330: primary "Update" on the right, "Remove" on the left (app button rule); 36px tap height */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRemovePlatform(platform.id)}
                          className="min-h-9 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-xl hover:bg-red-50 transition-all"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPlatformEdit(platform.id)}
                          className="min-h-9 px-3 py-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold rounded-xl shadow-2xs transition-all"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Not Added Yet */}
          {notAdded.length > 0 && (
            <div className="space-y-3">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                {liveIg ? "Add more platforms" : "Not Added Yet"}
              </span>

              <div className="space-y-2.5">
                {notAdded.map((platform) => {
                  const Icon = platform.icon;
                  return (
                    <div
                      key={platform.id}
                      className="min-h-[66px] py-2 gap-2 bg-white border border-[#E5E5EA] rounded-2xl px-4 flex items-center justify-between shadow-2xs hover:border-slate-300 transition-all"
                    >
                      {/* v330: fixed 66px height + no min-w-0 squeezed the "+ Add" button at 320px */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-xl shrink-0 ${platform.bg} ${platform.text}`}>
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-extrabold text-slate-900">{platform.name}</h4>
                          <span className="text-[10px] text-slate-500 font-medium block">{platform.pitch}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenPlatformEdit(platform.id)}
                        className="shrink-0 min-h-9 px-3.5 py-1.5 bg-white border-1.5 border-[#7C3AED] text-[#7C3AED] hover:bg-[#F3EBFF] text-xs font-extrabold rounded-xl transition-all cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No account access assurance */}
          <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
            <Shield size={18} className="text-[#7C3AED] shrink-0 mt-0.5" />
            <div>
              <h5 className="text-xs font-bold text-slate-900">No account access</h5>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">
                Ybex never logs into your accounts — you enter and update these details yourself.
              </p>
            </div>
          </div>
          {ig?.synced && (
            <div className="flex justify-end">
              <button type="button" onClick={doDisconnect} disabled={disconnecting} className="min-h-10 px-2 text-[13px] font-bold text-[#E8552F] disabled:opacity-50" data-testid="ig-disconnect">
                {disconnecting ? "Disconnecting…" : "Disconnect Instagram"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  
}
