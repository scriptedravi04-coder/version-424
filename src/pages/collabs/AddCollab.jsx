import React, { useEffect, useState } from "react";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useLoading } from "../../contexts/LoadingContext";
import { toast } from "sonner";
import { calmError } from "../../components/chat/calmError"; // v332
import { ArrowLeft, CheckCircle, Eye, Heart, BarChart3, RefreshCw } from "lucide-react";

export default function AddCollab() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  // Button actions show a spinner in the tapped button, not the global bar (ARCHITECTURE "Loading states").
  const { isBusy, anyBusy, begin, end } = useBusy();

  const [deal, setDeal] = useState(null);
  const [postUrl, setPostUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchSuccess, setFetchSuccess] = useState(false);

  // Simulated metrics fetched from postUrl
  const [previewMetrics, setPreviewMetrics] = useState({
    views: 0,
    likes: 0,
    reach: 0,
    thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800",
    caption: "",
    author: ""
  });

  // v332: a failed load left "Fetching deal context..." on screen for ever
  const [loadFailed, setLoadFailed] = useState(false);
  const loadDeal = () => {
    setLoadFailed(false);
    startLoading();
    api.get(`/deals/${id}`)
      .then(({ data }) => {
        setDeal(data);
        stopLoading();
      })
      .catch((err) => {
        console.error(err);
        setLoadFailed(true);
        stopLoading();
      });
  };

  useEffect(() => {
    loadDeal();
  }, [id]);

  const handleFetchPreview = (e) => {
    e.preventDefault();
    if (!postUrl.trim()) {
      toast.error("Please enter your live Instagram post link");
      return;
    }
    if (!postUrl.includes("instagram.com")) {
      toast.error("Please enter a valid Instagram URL (e.g., instagram.com/p/...)");
      return;
    }

    // Session 53 (Ravi: "Instagram post stats … hata do"): there is no Instagram API here. This used to
    // invent 15k–47k views, likes and reach plus a stock photo and call it "fetched". Now the link is
    // checked and the creator types the numbers from their own Instagram insights.
    setPreviewMetrics({ views: "", likes: "", reach: "", thumbnail: "", caption: "", author: user?.name || "creator" });
    setFetchSuccess(true);
    toast.success("Link added. Now type the numbers from your Instagram insights.");
  };

  const handleSubmitProof = async () => {
    if (!fetchSuccess) {
      toast.error("Please add your post link first."); // v332: plain words
      return;
    }

    const num = (v) => Math.max(0, Math.round(Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0));
    if (!num(previewMetrics.views)) {
      toast.error("Please enter the views from your Instagram insights");
      return;
    }
    begin("submit");
    try {
      await api.post(`/deals/${id}/add-collab`, {
        instagram_post_url: postUrl,
        fetched_views: num(previewMetrics.views),
        fetched_likes: num(previewMetrics.likes),
        fetched_reach: num(previewMetrics.reach),
        manual_screenshot_url: null,
        fetch_status: "MANUAL"
      });

      toast.success("Proof uploaded successfully! Redirecting to synced dashboard...");
      navigate(`/deals/${id}/uploaded-collab`);
    } catch(err) {
      toast.error(calmError(err, "Couldn't save your post numbers. Please try again.")); // v332
    } finally {
      end("submit");
    }
  };

  if (!deal) {
    return (
      <div className="w-full max-w-none px-6 py-16 text-center text-[var(--text-secondary)] bg-[var(--bg-base)]">
        {loadFailed ? (
          <div role="alert">
            <p className="font-bold text-[var(--text-primary)] mb-1">Couldn't load this deal</p>
            <p className="text-sm mb-4">Check your connection and try again.</p>
            <button type="button" onClick={loadDeal} className="min-h-[40px] px-5 rounded-xl bg-[var(--violet)] text-white text-sm font-bold cursor-pointer">Try again</button>
          </div>
        ) : "Loading deal…"}
      </div>
    );
  }

  return (
    <div className="w-full max-w-none px-4 sm:px-6 md:px-12 py-8 bg-[var(--bg-base)] text-[var(--text-primary)]">
      
      {/* Navigation and Title */}
      <div className="max-w-3xl mx-auto mb-6">
        <Link to={`/deals/${id}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--violet)] flex items-center gap-1.5 font-medium transition-colors mb-4">
          <ArrowLeft size={14} /> Back to Deal Tracker
        </Link>
        <span className="text-[10px] bg-[#7C3AED]/10 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider">
          LIVE POST INTEGRATION WORKSPACE
        </span>
        <h1 className="font-display font-black text-2xl sm:text-3xl text-[var(--text-primary)] mt-2 leading-tight">
          Add Live Instagram Post Metrics
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1 font-normal">
          Contract target: {deal.deliverable || "Collab contract details"}
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">

        {/* Input pasting URL Form card */}
        <div className="bg-[var(--bg-card)]/50 border border-[var(--border-default)] rounded-3xl p-6 sm:p-8 text-left space-y-4">
          <h3 className="text-sm font-black text-[var(--text-tertiary)] uppercase tracking-widest border-b border-[var(--border-default)] pb-2">
            Paste Instagram link
          </h3>

          <form onSubmit={handleFetchPreview} className="space-y-4">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
              Paste the live link to your Instagram post or reel, then type its views, likes and reach from your Instagram insights.
            </p>

            <div className="flex gap-3">
              <div className="relative flex-grow">
                <img src="/assets/instagram.png" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 object-contain pointer-events-none" alt="" />{/* v332: the icon sat above the box, leaving an empty gap inside it */}
                <input 
                  type="url" 
                  value={postUrl} 
                  onChange={(e) => setPostUrl(e.target.value)} 
                  disabled={fetching}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl pl-12 pr-4 py-3.5 text-base sm:text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--violet)]" 
                  placeholder="https://www.instagram.com/p/..."
                  aria-label="Instagram post link" /* v332: placeholder was near-invisible in light mode; 16px text on phones */
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={fetching} 
                className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-extrabold text-xs px-6 py-3.5 rounded-2xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {fetching ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {fetching ? "Checking…" : "Add link"}
              </button>
            </div>
          </form>
        </div>

        {/* Session 53: the creator's own numbers (no fake "synced" metrics, no stock photo). */}
        {fetchSuccess && (
          <div className="bg-[var(--bg-card)]/30 border border-[var(--border-default)] rounded-3xl p-6 sm:p-8 text-left space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3">
              <h3 className="text-sm font-black text-[var(--text-tertiary)] uppercase tracking-widest">Post numbers</h3>
              <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1 font-bold">
                <CheckCircle size={10} /> LINK ADDED
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[["views", "Views", Eye], ["likes", "Likes", Heart], ["reach", "Reach", BarChart3]].map(([key, label, Icon]) => (
                <label key={key} className="bg-[var(--bg-elevated)] border border-[var(--border-default)] p-4 rounded-xl block">
                  <Icon size={16} className="text-[var(--violet)] mb-1.5" />
                  <span className="text-[11px] uppercase font-bold text-[var(--text-tertiary)] block">{label}</span>
                  <input inputMode="numeric" value={previewMetrics[key]} onChange={(e) => setPreviewMetrics((m) => ({ ...m, [key]: e.target.value }))}
                    placeholder="0" className="mt-1 w-full bg-transparent text-base font-black font-display text-[var(--text-primary)] focus:outline-none" />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">The brand can check these against your post. Please enter them exactly as Instagram shows.</p>
            <button 
              onClick={handleSubmitProof}
              className="disabled:opacity-60 disabled:cursor-not-allowed w-full bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-extrabold text-xs py-3.5 rounded-2xl transition-all shadow-md uppercase tracking-wider cursor-pointer"
              disabled={anyBusy}>{isBusy("submit") && <ButtonSpinner className="mr-1.5" />}
              Submit proof
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
