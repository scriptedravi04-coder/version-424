import React, { useState, useEffect } from "react";
import BriefRefundStatus from "../../components/brand/BriefRefundStatus";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { Briefcase, Plus, Target, Users, ArrowRight, Ban, RotateCcw } from "lucide-react";
import CancelBriefModal from "../../components/brand/CancelBriefModal";

import { Presence } from "../../components/common/Popup";
export default function BrandUGCBriefs() {
  const { user } = useAuth();
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBriefForCancel, setSelectedBriefForCancel] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false); // v332: a failed load is not "No UGC Briefs Found"

  const fetchBriefs = async () => {
    try {
      setLoading(true);
      const res = await api.get("ugc/briefs/my");
      // v332: the answer can be { briefs: [...] } (the home screen reads it that way) — an object here crashed .map
      const d = res?.data;
      setBriefs(Array.isArray(d) ? d : Array.isArray(d?.briefs) ? d.briefs : []);
      setLoadFailed(false);
    } catch (err) {
      console.error("Error fetching UGC Briefs:", err);
      setLoadFailed(true); // v332: calm retry card below instead of a raw error toast
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefs();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 bg-[var(--bg-base)] min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
          <div className="h-10 bg-slate-200/60 rounded-lg animate-pulse w-1/4 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent"></div>
          <div className="h-4 bg-slate-200/60 rounded animate-pulse w-1/2"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="h-32 bg-slate-200/60 rounded-xl animate-pulse relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent"></div>
            <div className="h-32 bg-slate-200/60 rounded-xl animate-pulse relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent"></div>
            <div className="h-32 bg-slate-200/60 rounded-xl animate-pulse relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent"></div>
          </div>
          <div className="h-64 bg-slate-200/60 rounded-xl animate-pulse mt-4 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent"></div>
        </div>
          <div className="text-[var(--text-tertiary)] text-sm font-mono tracking-widest uppercase">Loading UGC Briefs...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none text-left pb-8" data-testid="brand-ugc-briefs-page">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            My UGC Briefs
          </h1>
          <p className="text-[var(--text-secondary)] text-xs sm:text-sm mt-1">
            Review, track and recruit creators for your active User Generated Content briefs.
          </p>
        </div>

        <Link
          to="/brand/ugc/post"
          className="flex items-center gap-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus size={16} />
          Post UGC Brief
        </Link>
      </div>

      {loadFailed && briefs.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-10 text-center max-w-2xl mx-auto my-8 flex flex-col items-center" data-testid="brand-ugc-briefs-error">
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">Couldn't load your briefs</h3>
          <p className="text-xs text-[var(--text-secondary)] mb-5">Your briefs are safe. Please try again in a moment.</p>
          <button type="button" onClick={fetchBriefs} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-sm">
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      ) : briefs.length === 0 ? (
        <div className="bg-[var(--bg-card)]/80 border border-dashed border-[var(--border-default)] rounded-2xl p-16 text-center max-w-2xl mx-auto my-8 flex flex-col items-center">
          <div className="p-4 bg-[var(--violet)]/10 text-[#a38aff] rounded-full mb-4">
            <Briefcase size={32} />
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">No UGC Briefs Found</h3>
          <p className="text-xs text-[var(--text-secondary)] mb-6 max-w-md leading-relaxed">
            Create your first user-generated content brief to source high-quality custom videos from certified creator pros.
          </p>
          <Link
            to="/brand/ugc/post"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Post UGC Brief <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {briefs?.map((brief) => (
            <div
              key={brief.id}
              className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 shadow-sm hover:border-[var(--violet)]/30 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-extrabold text-[var(--violet)] bg-[var(--violet)]/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                    {/* v332: readable format names instead of raw codes ("ugc video edited") */}
                    {({ collaboration_reel: "Collab reel", ugc_video_edited: "Edited UGC video", ugc_video_raw: "Raw UGC clips" })[brief.deliverable_type] || (brief.deliverable_type ? brief.deliverable_type.replace(/_/g, " ") : "UGC video")}
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    brief.status === "OPEN" 
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" 
                      : "bg-gray-500/15 text-gray-500 border border-gray-500/20"
                  }`}>
                    {/* v332: "Open" / "Partly cancelled" instead of raw OPEN / PARTIALLY_CANCELLED */}
                    {({ OPEN: "Open", CLOSED: "Closed", FILLED: "Filled", CANCELLED: "Cancelled", PARTIALLY_CANCELLED: "Partly cancelled", COMPLETED: "Completed", DRAFT: "Draft", PAUSED: "Paused" })[String(brief.status || "OPEN").toUpperCase()] || String(brief.status).replace(/_/g, " ").toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase())}
                  </span>
                </div>

                <h3 className="font-sans font-bold text-base text-[var(--text-primary)] leading-snug mb-1 break-words">
                  {brief.title || brief.product_name || "UGC brief"}{/* v332: no blank title */}
                </h3>
                
                <p className="text-xs text-[var(--text-secondary)] mb-4 font-medium flex items-center gap-1.5">
                  <Target size={13} className="text-[var(--text-tertiary)]" /> Product: {brief.product_name || "N/A"}
                </p>

                {brief.detailed_requirements && (
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed line-clamp-3 mb-4">
                    {brief.detailed_requirements}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Budget in Payment Hold</span>
                  <span className="font-mono font-black text-emerald-400 text-sm">
                    ₹{Number(brief.budget || 0).toLocaleString("en-IN")}
                  </span>
                </div>
                
                <div className="text-right">
                  <span className="block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Creators Recruited</span>
                  <span className="font-semibold text-[var(--text-primary)] flex items-center justify-end gap-1 text-xs">
                    <Users size={12} className="text-[var(--text-tertiary)]" />
                    {brief.claimed_count || 0} / {brief.max_creators || 1}
                  </span>
                </div>
              </div>

              {/* Cancel Brief / Refund Action */}
              <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center justify-between gap-2">
                {brief.status === "CANCELLED" || brief.status === "PARTIALLY_CANCELLED" ? (
                  <BriefRefundStatus briefId={brief.id} />
                ) : (Number(brief.max_creators || 1) - Number(brief.claimed_count || 0)) > 0 ? (
                  <button
                    onClick={() => setSelectedBriefForCancel(brief)}
                    className="text-xs font-bold text-red-500 hover:text-red-600 hover:underline flex items-center gap-1 cursor-pointer transition-colors ml-auto min-h-[40px]" /* v332: tap target */
                  >
                    <Ban size={13} />
                    <span>Cancel & Refund</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-[var(--text-tertiary)]">All slots claimed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Presence>{selectedBriefForCancel && (
        <CancelBriefModal key="cancelbriefmodal"
          isOpen={Boolean(selectedBriefForCancel)}
          brief={selectedBriefForCancel}
          onClose={() => setSelectedBriefForCancel(null)}
          onSuccess={() => fetchBriefs()}
        />
      )}</Presence>
    </div>
  );
}
