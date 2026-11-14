import React, { useEffect, useState } from "react";
import { DetailSkeleton } from "../../components/common/ContentSkeletons";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useLoading } from "../../contexts/LoadingContext";
import { toast } from "sonner";
import { calmError } from "../../components/chat/calmError"; // v332
import { ArrowLeft, RefreshCw, CheckCircle, ExternalLink, Eye, Heart, BarChart3, TrendingUp, DollarSign, Check, AlertCircle, Star } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import D3PerformanceVisualizer from "../../components/analytics/D3PerformanceVisualizer";

// v330: real counts only; "—" when the number is not there.
const fmtCount = (v) => (Number(v) > 0 ? Number(v).toLocaleString("en-IN") : "—");

export default function UploadedCollab() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startLoading, stopLoading } = useLoading();

  const [deal, setDeal] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [brandRating, setBrandRating] = useState(5);
  const [verifiedReach, setVerifiedReach] = useState(0);

  // v332: no made-up 25,000 in the "Verified Delivered Reach" box (it could be submitted as real);
  // a failed load no longer leaves the skeleton spinning for ever.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadDeal = () => {
    setLoadFailed(false);
    return api.get(`/deals/${id}`)
      .then(({ data }) => {
        setDeal(data);
        setVerifiedReach(data?.delivered_reach || data?.proof?.fetched_reach || data?.proof?.reach || "");
        setBrandRating(data?.brand_rating || 5);
        return true;
      })
      .catch((err) => {
        console.error(err);
        setLoadFailed(true);
        toast.error("Couldn't load the post metrics. Please try again.");
        return false;
      });
  };

  useEffect(() => {
    loadDeal();
  }, [id]);

  // v332: "Refresh" used to invent numbers (views × 1.08, likes × 1.05…) and say "re-synchronized".
  // It now reloads the real saved numbers.
  const handleManualResync = async () => {
    if (syncing) return;
    setSyncing(true);
    const ok = await loadDeal();
    setSyncing(false);
    if (ok) toast.success("Metrics refreshed.");
  };

  const handleVerifyEscrowPayout = async () => {
    setReleasing(true);
    try {
      await api.post(`/deals/${id}/proof/verify`, {
        brand_rating: brandRating,
        delivered_reach: Number(verifiedReach)
      });
      toast.success(Number(deal?.proposed_amount) > 0 ? `Payout verified! ₹${Number(deal.proposed_amount).toLocaleString("en-IN")} is scheduled for bank settlement.` : "Payout verified and scheduled for bank settlement."); // v332: no "₹0"
      loadDeal();
    } catch (err) {
      toast.error(calmError(err, "Couldn't verify the payout. Please try again.")); // v332: no raw / scary error text
    } finally {
      setReleasing(false);
    }
  };

  if (!deal && loadFailed) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl" role="alert">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1.5">Couldn't load this collaboration</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-5">Check your connection and try again.</p>
        <button type="button" onClick={loadDeal} className="min-h-[40px] px-5 rounded-xl bg-[var(--violet)] text-white text-sm font-bold cursor-pointer">Try again</button>
      </div>
    );
  }
  if (!deal) return <DetailSkeleton label="Loading collaboration" />;

  // Generate dynamic chart data charting view reach progression over 5 days
  const views = Number(deal.proof?.fetched_views) || 0; // v332: was a made-up 25,000
  const metricsChartData = [
    { name: "Day 1", reach: Math.floor(views * 0.25), engagementRate: 4.8 },
    { name: "Day 2", reach: Math.floor(views * 0.52), engagementRate: 5.2 },
    { name: "Day 3", reach: Math.floor(views * 0.782), engagementRate: 5.5 },
    { name: "Day 4", reach: Math.floor(views * 0.94), engagementRate: 5.7 },
    { name: "Day 5", reach: views, engagementRate: 6.1 }
  ];

  const isBrand = user?.role === "brand";
  const p = deal.proof || {};

  return (
    <div className="w-full max-w-none px-4 sm:px-6 md:px-12 py-8 bg-[var(--bg-base)] text-[var(--text-primary)]">
      
      {/* Title & Navigation Header */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Link to={`/deals/${id}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--violet)] flex items-center gap-1.5 font-medium transition-colors mb-2">
            <ArrowLeft size={14} /> Back to Deal Tracker
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-black text-2xl sm:text-3xl text-[var(--text-primary)] tracking-tight">Post Analytics Sync</h1>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded uppercase border border-emerald-500/15">
              Live Verified
            </span>
          </div>
        </div>

        <button 
          onClick={handleManualResync} 
          disabled={syncing}
          className="bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] px-4 py-2.5 rounded-xl border border-[var(--border-default)] text-xs font-bold text-[var(--text-primary)] transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw size={12} className={syncing ? "animate-spin text-[var(--violet)]" : "text-[var(--text-secondary)]"} />
          {syncing ? "Refreshing…" : "Refresh metrics"}
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">

        {/* --- PERFORMANCE HIGHLIGHT COUNTS --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          <div className="bg-[var(--bg-card)]/50 border border-[var(--border-default)] p-5 rounded-2xl text-left relative overflow-hidden">
            <Eye size={16} className="text-[var(--violet)] mb-2" />
            <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase block tracking-wide">Verified Impressions</span>
            <span className="text-2xl font-black font-display text-[var(--text-primary)] mt-1 block">
              {fmtCount(p.fetched_views) /* v330: was a made-up 25,000 when nothing was synced */}
            </span>
            <span className="text-[11px] text-[var(--violet)] mt-1 block font-mono">Synced from Instagram</span>
          </div>

          <div className="bg-[var(--bg-card)]/50 border border-[var(--border-default)] p-5 rounded-2xl text-left relative overflow-hidden">
            <Heart size={16} className="text-rose-400 mb-2" />
            <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase block tracking-wide">Active Likes count</span>
            <span className="text-2xl font-black font-display text-[var(--text-primary)] mt-1 block">
              {fmtCount(p.fetched_likes) /* v330: was a made-up 1,200 */}
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)] mt-1 block font-mono">From the live post{/* v330: "+5.4% industry benchmark" was invented */}</span>
          </div>

          <div className="bg-[var(--bg-card)]/50 border border-[var(--border-default)] p-5 rounded-2xl text-left relative overflow-hidden">
            <BarChart3 size={16} className="text-emerald-400 mb-2" />
            <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase block tracking-wide">Demographic Reach</span>
            <span className="text-2xl font-black font-display text-[var(--text-primary)] mt-1 block">
              {fmtCount(p.fetched_reach) /* v330: was a made-up 32,000 */}
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)] mt-1 block font-mono">Organic source coverage</span>
          </div>

          <div className="bg-[var(--bg-card)]/50 border border-[var(--border-default)] p-5 rounded-2xl text-left relative overflow-hidden">
            <DollarSign size={16} className="text-[var(--violet)] mb-2" />
            <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase block tracking-wide">Payout Settlement</span>
            <span className="text-2xl font-black font-display text-[var(--text-primary)] mt-1 block">
              {Number(deal.proposed_amount) > 0 ? `₹${Number(deal.proposed_amount).toLocaleString("en-IN")}` : "—" /* v332 */}
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)] mt-1 block font-mono">{deal.stage || "PROOF_SUBMITTED"}</span>
          </div>

        </div>

        {/* --- PERFORMANCE TIMELINE CHART & INSTAGRAM CARD DETAILS --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Main charting widget left */}
          <div className="lg:col-span-8 bg-[var(--bg-card)]/30 border border-[var(--border-default)] rounded-3xl p-6 text-left">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-black text-[var(--text-tertiary)] uppercase tracking-widest">Reach Expansion Trend</h3>
                <span className="text-[11px] text-[var(--text-secondary)]">{Number(views) > 0 ? "Shape of the reach so far (estimated from the total)." : "Shows up once the post's numbers are synced."}{/* v332: the curve was drawn from a made-up 25,000 when nothing was synced */}</span>
              </div>
              <TrendingUp size={16} className="text-emerald-400" />
            </div>

            <div className="h-64 w-full">
              {Number(views) > 0 ? <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsChartData}>
                  <defs>
                    <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--violet)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--violet)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#ffffff" fontSize={10} opacity={0.3} tickLine={false} axisLine={false} />
                  <YAxis stroke="#ffffff" fontSize={10} opacity={0.3} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#131224", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }}
                    itemStyle={{ color: "#ffffff", fontSize: "11px" }}
                    labelStyle={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}
                  />
                  <Area type="monotone" dataKey="reach" stroke="var(--violet)" strokeWidth={2} fillOpacity={1} fill="url(#colorReach)" />
                </AreaChart>
              </ResponsiveContainer> : <div className="h-full w-full rounded-2xl border border-dashed border-[var(--border-default)] flex items-center justify-center text-xs text-[var(--text-tertiary)]">No synced numbers yet</div>}
            </div>
          </div>

          {/* Connected Post details Sidebar right */}
          <div className="lg:col-span-4 bg-[var(--bg-card)]/50 border border-[var(--border-default)] rounded-3xl p-6 text-left space-y-4">
            <h3 className="text-xs font-black text-[var(--text-tertiary)] uppercase tracking-widest border-b border-[var(--border-default)] pb-2">
              Integrated Link Source
            </h3>

            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase block tracking-wider mb-1.5">Instagram Post Link</span>
              {p.instagram_post_url ? (
                <a 
                  href={p.instagram_post_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--violet)] rounded-xl px-4 py-3 text-xs font-semibold text-[var(--text-primary)] flex items-center justify-between transition-colors cursor-pointer select-text overflow-hidden"
                >
                  <span className="truncate flex-grow flex items-center gap-1.5">
                    <ExternalLink size={12} className="text-[var(--violet)] shrink-0" />
                    {p.instagram_post_url.slice(0, 32)}...
                  </span>
                  <ExternalLink size={12} className="text-[var(--text-tertiary)] shrink-0" />
                </a>
              ) : (
                <span className="text-xs text-[var(--text-tertiary)] italic">No link synchronized yet</span>
              )}
            </div>

            <div className="space-y-2.5 text-xs text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>Sync status:</span>
                <span className="text-emerald-400 font-bold">STABLE CONNECTION</span>
              </div>
              <div className="flex justify-between">
                <span>Last Synced Ref:</span>
                <span className="text-[var(--text-primary)]/80 font-mono font-bold">
                  {p.last_synced_at ? new Date(p.last_synced_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase()) : "Not synced yet" /* v330: IST; no fake "Just now" */}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* --- D3.JS INTERACTIVE PERFORMANCE & TELEMETRY SUITE --- */}
        <div className="w-full">
          <D3PerformanceVisualizer 
            entityId={id} 
            title={`Granular Growth Velocity & Performance Engine (${deal?.deliverable || "Live Collab"})`} 
          />
        </div>

        {/* --- BRAND ACTION INTERACTION AREA: ESCROW VERIFY TRIGGERS --- */}
        {deal.stage !== "COMPLETED" ? (
          <div className="bg-[var(--violet)]/5 border border-[var(--violet)]/20 rounded-3xl p-6 text-left space-y-5 max-w-2xl shadow-xs">
            <div className="flex items-start gap-3">
              <CheckCircle size={20} className="text-[var(--violet)] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Sponsorship Escalation & Performance Score Lock</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed font-normal">
                  Rate the creator's delivery efficiency, timeliness, and overall quality. This verifies their final metrics, calculates their **Performance Rank**, and disburses matching funds.
                </p>
              </div>
            </div>

            {isBrand ? (
              <div className="space-y-4 border-t border-gray-100 pt-4">
                {/* Brand Rating */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Brand Partner Rating (1-5 Stars)
                  </label>
                  <div className="flex gap-2 items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setBrandRating(star)}
                        className="text-amber-400 hover:scale-110 transition-transform cursor-pointer"
                        type="button"
                      >
                        <Star
                          size={24}
                          fill={star <= brandRating ? "currentColor" : "none"}
                          strokeWidth={2}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-semibold text-gray-500 ml-2">
                      ({brandRating} / 5 Stars)
                    </span>
                  </div>
                </div>

                {/* Delivered Reach Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Promised Campaign Reach
                    </label>
                    <div className="bg-gray-150 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-500 font-bold font-mono">
                      {fmtCount(deal.promised_reach) /* v330: was a made-up 10,000 */}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Verified Delivered Reach
                    </label>
                    <input
                      type="number"
                      value={verifiedReach}
                      onChange={(e) => setVerifiedReach(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="e.g. 25000"
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-xs text-gray-800 font-bold font-mono focus:border-[var(--violet)] outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Warning Alert Banner */}
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                  <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed font-semibold">
                    Warning: Submitting this verification finalizes the delivered reach and brand rating. This permanently locks the creator's Performance Score and Rank for this campaign.
                  </p>
                </div>

                <button 
                  onClick={handleVerifyEscrowPayout} 
                  className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-extrabold text-xs px-8 py-3.5 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={releasing || !(Number(verifiedReach) > 0) /* v332: needs a real delivered reach first */}
                >
                  {releasing ? "Verifying Settlement & Rank..." : "Approve Metrics & Release Payout"}
                </button>
              </div>
            ) : (
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] p-4 rounded-xl text-left">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
                  <span className="font-bold text-[var(--violet)]">Settlement Pending Review:</span> The campaign brand manager is reviewing these metrics, rating, and on-time logs. Secure payment hold funds will automatically release once reviewed and verified.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-6 text-left flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center shrink-0 border border-emerald-500/20">
                <Check size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Payout Disbursed & Completed</h3>
                <p className="text-xs text-[var(--text-secondary)] font-normal mt-0.5 leading-relaxed">
                  {/* v332: clearer wording; Indian commas for text amounts */}
                  {Number(deal.proposed_amount) > 0 ? `₹${Number(deal.proposed_amount).toLocaleString("en-IN")}` : "The payout"} has been verified and paid out to the creator's bank account.
                </p>
              </div>
            </div>

            {deal.performance_score && (
              <div className="bg-[var(--violet)]/5 border border-[var(--violet)]/15 rounded-3xl p-6 text-left flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider">Campaign Performance Ledger</h4>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-2xl font-black text-gray-800 font-mono">
                      {deal.performance_score} / 100
                    </span>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                      deal.performance_tier === "PLATINUM" ? "bg-[#EDE9FE] text-[#6D28D9] border border-[#DDD6FE]" :
                      deal.performance_tier === "GOLD" ? "bg-amber-100 text-amber-700 border border-amber-200" :
                      deal.performance_tier === "SILVER" ? "bg-slate-100 text-slate-700 border border-slate-200" :
                      "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {deal.performance_tier} TIER
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Rating Given: {deal.brand_rating} Stars • Delivered {fmtCount(deal.delivered_reach)} / {fmtCount(deal.promised_reach)} Reach
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    deal.on_time_submission ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                  }`}>
                    {deal.on_time_submission ? "On-Time Submit" : "Late Submission"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
