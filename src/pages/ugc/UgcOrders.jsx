import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { PlusCircle, LayoutGrid, Clock, Film, CheckCircle2, ExternalLink, Send, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { mediaHref } from "../../lib/mediaUrl";
import ButtonSpinner from "../../components/common/ButtonSpinner";

import { Presence, PopupBackdrop, PopupPanel } from "../../components/common/Popup";
import { initialsAvatarUrl } from "../../utils/initials"; // v423 (S11): no third-party avatar service
export default function UgcOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false); // v330: a failed load said "No UGC orders are currently open"
  const [submitting, setSubmitting] = useState(false); // v330: no double submit of the delivery link
  const [showPostModal, setShowPostModal] = useState(false);

  // Post form state
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("Fashion");
  const [videoLength, setVideoLength] = useState("30s");
  const [instructions, setInstructions] = useState("");
  const [refLink, setRefLink] = useState("");
  const [budget, setBudget] = useState("");

  // Submission video state for creator
  const [submitOrderId, setSubmitOrderId] = useState(null);
  const [deliveryUrl, setDeliveryUrl] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    api.get("ugc-orders")
      .then(({ data }) => setOrders(Array.isArray(data) ? data : [])) // v330: a non-list answer crashed the page
      .catch((e) => { setLoadFailed(true); /* v332: the page already shows "Couldn't load… try again" — no extra error pop-up */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!productName || !budget) {
      toast.error("Please fill in required fields.");
      return;
    }
    // Briefs are posted through the paid brief flow, which secures the escrow first. This modal
    // posted to POST /ugc-orders — a route that never existed — so every post here failed.
    setShowPostModal(false);
    navigate("/brand/ugc/post");
  };

  // Session 24 (strict): claiming = signing the agreement with an OTP, and the timer starts then.
  // That only happens in the claim flow (KYC check → agreement → OTP), so send the creator there.
  const handleAccept = () => {
    navigate("/creator/ugc?tab=explore");
  };

  const triggerInHouse = async (orderId) => {
    try {
      await api.post(`/ugc-orders/${orderId}/in-house`);
      toast.success("SLA backup triggered! In-house team assigned.");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.response?.data?.detail || e?.message || "Failed to trigger in-house override.");
    }
  };

  const submitVideo = async (e) => {
    e.preventDefault();
    if (!deliveryUrl) {
      toast.error("Please provide link.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/ugc-orders/${submitOrderId}/submit`, { video_url: deliveryUrl });
      toast.success("Success! UGC Video project submitted to brand.");
      setSubmitOrderId(null);
      setDeliveryUrl("");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Couldn't send the link. Please try again."); // v332: calm wording
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10" data-testid="ugc-orders-page">
      {/* SLA Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-tr from-card via-background/80 to-card border border-[var(--border-default)] xl:bg-gradient-to-r rounded-[28px] p-6 sm:p-10 md:p-12 mb-10 shadow-lg shadow-foreground/5 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="relative z-10 max-w-2xl">
          
          <h1 className="font-display text-4xl sm:text-5xl font-black text-[var(--text-primary)] leading-none tracking-tight">
            Live UGC <br />
            <span className="text-[#a18bf1] font-black drop-shadow-sm">Video Orders</span>
          </h1>
          <p className="text-[var(--text-secondary)] mt-4 text-sm leading-relaxed">
            Bridge the content gap instantly. Brands post high-priority product video briefs, and creators claim orders to produce original, mobile-optimized reviews within <span className="font-bold border-b-2 border-foreground/30 pb-0.5">24 hours</span>.
            {user?.role === "brand" && (
              <>
                <br /><br />
                <span className="text-[var(--text-primary)] font-black">🤝 Secure payment hold:</span> Your payouts are safely held in the Ybex secure payment hold prior to submission.
                {/* v332: removed the "in-house agency takes over after 15 hours" promise — that backup is switched off (Session 58) */}
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-4 mt-6">
            {user?.role === "brand" ? (
              <button
                onClick={() => navigate("/brand/ugc/post") /* v332: the old form was thrown away on submit and sent here anyway */}
                className="px-6 py-3 bg-[var(--violet)] text-white hover:bg-[var(--violet-hover)] rounded-xl text-xs font-black uppercase tracking-wider transition-all transform hover:scale-[1.03] shadow-[0_4px_20px_rgba(124,58,237,0.35)] flex items-center gap-2"
              >
                <PlusCircle size={15}/> Post UGC Requirement
              </button>
            ) : user?.role === "creator" ? (
              <div className="text-xs text-[var(--text-secondary)] bg-foreground/5 px-4 py-2 rounded-xl border border-foreground/5">
                👋 You are logged in as a <span className="text-[var(--violet)] font-bold">Creator</span>. Scroll below to claim live orders and start earning!
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => navigate("/signup?role=brand")}
                  className="px-5 py-2.5 bg-[var(--violet)] text-white hover:bg-[var(--violet-hover)] rounded-xl text-xs font-black uppercase tracking-wider transition-all transform hover:scale-[1.03] shadow-lg"
                >
                  Post as Brand
                </button>
                <button
                  onClick={() => navigate("/signup?role=creator")}
                  className="px-5 py-2.5 bg-foreground/10 hover:bg-foreground/15 text-[var(--text-primary)] rounded-xl text-xs font-bold uppercase tracking-wider border border-[var(--border-default)] transition-all"
                >
                  Apply as Creator
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Dynamic decorative icon */}
        <div className="relative flex justify-center items-center h-48 w-48 bg-[var(--violet)]/10 border border-[var(--violet)]/20 rounded-full shadow-[inset_0_0_30px_rgba(124,92,255,0.2)] animate-pulse hidden md:flex">
          <Film size={60} className="text-[var(--violet)] opacity-75"/>
        </div>
      </div>

      {/* Main List */}
      <div className="grid grid-cols-1 gap-6">
        <div className="flex items-center justify-between pb-3 border-b border-foreground/5">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <LayoutGrid size={18} className="text-[#7C5CFF]"/> Open UGC Video Briefs
          </h2>
          <button onClick={load} className="text-xs font-black text-[var(--text-secondary)] hover:text-[var(--violet)]">Refresh List ↺</button>
        </div>

        {loading ? (
          <div className="py-24 text-center text-[var(--text-tertiary)]">Loading digital requests...</div>
        ) : loadFailed ? (
          <div className="bg-[var(--bg-card)]/60 border border-foreground/5 rounded-2xl p-10 text-center text-[var(--text-tertiary)]">
            Couldn't load UGC orders. Check your connection and{" "}
            <button type="button" onClick={load} className="font-bold text-[var(--violet)] underline">try again</button>.
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-[var(--bg-card)]/60 border border-foreground/5 rounded-2xl p-16 text-center text-[var(--text-tertiary)]">
            No UGC orders are currently open. Check back shortly.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            <AnimatePresence mode="popLayout">
              {orders?.map((o, idx) => {
                const mine = o.brand_user_id === user?.user_id;
                const statusLower = (o.status || "").toLowerCase();
                const isAccepted = statusLower === "accepted" || statusLower === "in_progress";
                const isSubmitted = statusLower === "submitted" || statusLower === "completed";
                const isInHouse = statusLower === "in_house_backup" || statusLower === "in_house_assigned" || !!o.in_house_assigned;
                const isOpen = statusLower === "open";
                
                return (
                  <motion.div 
                    key={`${o.order_id}-${idx}`}
                    layout
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    whileHover={{ y: -4, scale: 1.01 }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className={`card-dark p-4 sm:p-6 flex flex-col justify-between border ${isSubmitted ? "border-emerald-500/30" : isAccepted ? "border-[var(--violet)]/20" : "border-[var(--border-default)]"} hover:border-foreground/20 transition-all hover:shadow-[0_8px_32px_rgba(124,92,255,0.12)]`}
                  >
                  <div>
                    {/* Header: Company and Status */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-2 mb-3">
                      <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto">
                        <div className="flex items-center gap-2.5">
                          <img 
                            src={o.brand_logo || initialsAvatarUrl(encodeURIComponent(o.brand_name || 'Brand'), "e5e7eb")} 
                            alt="" 
                            className="w-8 h-8 rounded-lg bg-foreground/10 object-cover shrink-0"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = initialsAvatarUrl(encodeURIComponent(o.brand_name || 'Brand'), "e5e7eb");
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-[10px] sm:text-xs font-black text-[var(--text-secondary)] truncate uppercase tracking-widest">{o.brand_name}</div>
                            <div className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] line-clamp-2 leading-tight">{o.product_name}</div>
                          </div>
                        </div>
                        <div className="sm:hidden">
                           {/* Status Pills (Mobile duplicate) */}
                           <div className="flex overflow-x-auto hide-scrollbar snap-x max-w-[120px] justify-end">
                           {isSubmitted ? (
                             <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 text-[11px] font-black uppercase tracking-widest flex items-center gap-1 whitespace-nowrap shrink-0 snap-end">
                               <CheckCircle2 size={10}/> Delivered
                             </span>
                           ) : isInHouse ? (
                             <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/35 text-[11px] font-black uppercase tracking-widest flex items-center gap-1 whitespace-nowrap shrink-0 snap-end">
                               Backup Assigned
                             </span>
                           ) : isAccepted ? (
                             <span className="px-2 py-0.5 rounded bg-[#4F46E5]/15 text-[var(--violet)] border border-[#4F46E5]/35 text-[11px] font-black uppercase tracking-widest flex items-center gap-1 animate-pulse whitespace-nowrap shrink-0 snap-end">
                               <Clock size={10}/> In production{/* v332: was "24h timer" — orders can have 24/48/72h */}
                             </span>
                           ) : (
                             <span className="px-2 py-0.5 rounded bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)] text-[11px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 snap-end">
                               Open
                             </span>
                           )}
                           </div>
                        </div>
                      </div>
                      
                      {/* Status Pills (Desktop) */}
                      <div className="hidden sm:flex overflow-x-auto hide-scrollbar max-w-[200px] justify-end">
                        {isSubmitted ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 text-[11px] font-black uppercase tracking-widest flex items-center gap-1 whitespace-nowrap shrink-0">
                            <CheckCircle2 size={11}/> Delivered
                          </span>
                        ) : isInHouse ? (
                          <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/35 text-[11px] font-black uppercase tracking-widest flex items-center gap-1 whitespace-nowrap shrink-0">
                            🔥 Ybex Studio SLA Backup Assigned
                          </span>
                        ) : isAccepted ? (
                          <span className="px-2 py-0.5 rounded bg-[#4F46E5]/15 text-[var(--violet)] border border-[#4F46E5]/35 text-[11px] font-black uppercase tracking-widest flex items-center gap-1 animate-pulse whitespace-nowrap shrink-0">
                            <Clock size={11}/> In production
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)] text-[11px] font-black uppercase tracking-widest whitespace-nowrap shrink-0">
                            Open request
                          </span>
                        )}
                      </div>
                    </div>


                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4 font-sans line-clamp-3">
                      {o.instructions || o.product_description || o.title}
                    </p>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      {/* v330: no empty pill / "Length: undefined" when a field is missing */}
                      {o.category && <span className="text-[10px] px-2 py-0.5 rounded bg-foreground/2 border border-foreground/5 text-[var(--text-secondary)]">{o.category}</span>}
                      {o.video_length && <span className="text-[10px] px-2 py-0.5 rounded bg-foreground/2 border border-foreground/5 text-[var(--text-secondary)]">Length: {o.video_length}</span>}
                      {o.ref_link && (
                        <a href={o.ref_link} target="_blank" rel="noreferrer" className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 inline-flex items-center gap-1">
                          Reference <ExternalLink size={9}/>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Pricing and Action Footer */}
                  <div className="pt-4 border-t border-foreground/5 flex items-center justify-between gap-4 mt-auto">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] leading-none mb-1">Payout Budget</div>
                      <div className="text-lg font-display font-black text-[var(--text-primary)]">
                        {Number(o.budget) > 0 ? `₹${new Intl.NumberFormat("en-IN").format(Number(o.budget))}` : "—" /* v330: no "₹NaN"; v332: no "₹0" */}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {/* Session 58: "Manager Override" is switched off — it only changed a local copy (no team was ever
                          assigned, no admin told) while saying "In-house team assigned". */}
                      {false && mine && (isOpen || isAccepted) && (
                        <button
                          onClick={() => triggerInHouse(o.order_id)}
                          className="px-3 py-2 border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-wide rounded-lg flex items-center gap-1.5"
                          title="Instantly deploy internal team to produce"
                        >
                          Manager Override
                        </button>
                      )}

                      {/* Case 2: Deliver Completed (Submit delivery link modal) */}
                      {isAccepted && (o.accepted_by_creator_id === user?.user_id || user?.role === "admin" || !o.accepted_by_creator_id) && (
                        <button
                          onClick={() => setSubmitOrderId(o.order_id)}
                          className="px-4 py-2 bg-[#D1F23F] text-black font-black text-[10px] uppercase tracking-wider rounded-lg hover:scale-105 transition-all flex items-center gap-1"
                        >
                          <Send size={11}/> Submit Delivery
                        </button>
                      )}

                      {/* Case 3: Claim / Apply actions */}
                      {isOpen && (
                        user?.role === "creator" || user?.role === "admin" ? (
                          <button
                            onClick={() => handleAccept(o.order_id)}
                            className="px-4 py-2 bg-[var(--violet)] text-white font-black text-[10px] uppercase tracking-wider rounded-lg hover:bg-[#6849E0] transition-all flex items-center gap-1"
                          >
                            Claim Brief <ArrowRight size={11}/>
                          </button>
                        ) : !user ? (
                          <button
                            onClick={() => {
                              toast.info("Please sign up first to claim this live order brief!");
                              navigate("/signup?role=creator");
                            }}
                            className="px-4 py-2 bg-[var(--violet)] text-white font-black text-[10px] uppercase tracking-wider rounded-lg hover:bg-[#6849E0] transition-all flex items-center gap-1"
                          >
                            Claim Brief <ArrowRight size={11}/>
                          </button>
                        ) : user?.role === "brand" ? (
                          <span className="text-[10px] text-[var(--text-tertiary)] italic font-medium pt-2">Open to Vetted Creators</span>
                        ) : null
                      )}

                      {/* View Submission if ready */}
                      {isSubmitted && o.submitted_video_url && (
                        <a
                          href={mediaHref(o.submitted_video_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-wider rounded-lg inline-flex items-center gap-1"
                        >
                          Watch Video <ExternalLink size={11}/>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Status subtitle info */}
                  {(isAccepted || isInHouse) && (
                    <div className="mt-4 pt-2.5 border-t border-foreground/5 flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                      <Clock size={11} className="text-[var(--violet)]"/>
                      <span>
                        Claimed by: <span className="text-[var(--text-primary)] font-semibold">{o.accepted_by_creator_name || "a creator" /* v332: no made-up "Vetted Creator" name */}</span>
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          </div>
        )}
      </div>

      {/* POST UGC ORDER MODAL */}
      <Presence>{showPostModal && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-[var(--border-default)] mb-6">
              <h3 className="font-display font-bold text-lg text-[var(--text-primary)] flex items-center gap-2">
                 Create 24h UGC Brief
              </h3>
              <button type="button" aria-label="Close" onClick={() => setShowPostModal(false)} className="w-9 h-9 flex items-center justify-center text-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] font-bold">&times;</button>
            </div>

            <form onSubmit={handlePost} className="space-y-4 text-sm text-[var(--text-primary)]">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--text-secondary)]">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wireless Noise-Cancelling Earbuds Max"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[#7C5CFF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--text-secondary)]">Product Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[#7C5CFF]"
                  >
                    <option value="Fashion">Fashion</option>
                    <option value="Beauty">Beauty</option>
                    <option value="Tech">Tech</option>
                    <option value="Lifestyle">Lifestyle</option>
                    <option value="Food & Beverages">Food & Beverages</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--text-secondary)]">Video Length</label>
                  <select
                    value={videoLength}
                    onChange={(e) => setVideoLength(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[#7C5CFF]"
                  >
                    <option value="15s">15s Short Hook</option>
                    <option value="30s">30s Key Features</option>
                    <option value="60s">60s Full Review</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--text-secondary)]">Brief / Instructions *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Clearly detail key talking points, hooks, the style of recording, or background aesthetic requirements."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[#7C5CFF]"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--text-secondary)]">Reference Product URL</label>
                <input
                  type="url"
                  placeholder="https://amazon.in/product-page"
                  value={refLink}
                  onChange={(e) => setRefLink(e.target.value)}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[#7C5CFF]"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--text-secondary)]">Offer Payout Budget (₹) *</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 4500"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[#7C5CFF]"
                />
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowPostModal(false)} className="px-4 py-2 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-[var(--violet)] text-white font-black text-xs uppercase tracking-wide rounded-xl">Create Live Order</button>
              </div>
            </form>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* SUBMIT RECORDED LINK MODAL */}
      <Presence>{submitOrderId && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl w-full max-w-md p-6">
            <h3 className="font-display font-black text-base uppercase text-[var(--text-primary)] mb-3">Submit your Completed UGC Video</h3>
            <p className="text-xs text-[var(--text-primary)]/55 leading-relaxed mb-4">Paste the link where the brand or admin can download or review your raw or produced MP4 video file (e.g. Google Drive, YouTube link, Dropbox, Dropbox Replay, cloud storage, etc.).</p>
            <form onSubmit={submitVideo} className="space-y-4">
              <input
                type="url"
                required
                placeholder="https://drive.google.com/your-drive-link-path"
                value={deliveryUrl}
                onChange={(e) => setDeliveryUrl(e.target.value)}
                className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 text-base sm:text-sm text-[var(--text-primary)] outline-none focus:border-[#7C5CFF]"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setSubmitOrderId(null)} className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-[#D1F23F] text-black font-black uppercase tracking-wide rounded-xl disabled:opacity-60">{submitting ? <ButtonSpinner label="Sending…" /> /* v332: standard spinner; 16px link field on phones */ : "Deliver Video"}</button>
              </div>
            </form>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
    </div>
  );
}
