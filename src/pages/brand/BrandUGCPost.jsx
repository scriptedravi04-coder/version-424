import React, { useState, useEffect } from "react";
import PayConsentLine from "../../components/legal/PayConsentLine";
import BriefSafetyExplainer, { useBriefExplainer, HowItWorksLink } from "../../components/ugc/BriefSafetyExplainer";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { processRazorpayPayment } from "../../lib/razorpay";
import BrandFeeSummary from "../../components/payments/BrandFeeSummary"; // v364
import CheckoutPicker from "../../components/payments/checkout/CheckoutPicker"; // v366
import { CheckoutDealCard, RazorpayTrust } from "../../components/payments/checkout/CheckoutScreens"; // v366
import { choiceLabel } from "../../components/payments/checkout/checkoutMethods"; // v366
import { quoteTotal } from "../../components/payments/BrandFeeSummary"; // v366
import { getPaidBriefOrder, savePaidBriefOrder, clearPaidBriefOrder, FINAL_ORDER_CODES, isFinalBriefError, paidBriefTerms, goToPostedBriefs, watchPaidOrder, checkBriefOrderPaid, takeRecentBriefPost, BRIEF_POSTED_PATH, savePendingBriefOrder, recoverPendingBriefOrder } from "../../lib/briefPaymentRetry";
import { DELIVERY_OPTIONS, DEFAULT_DELIVERY_HOURS, deliveryHoursOf } from "../../utils/ugcTerms";
import { toast } from "sonner";
import { Check, Video, CheckCircle2, AlertCircle, Film, Camera, X, Lightbulb } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import useIsMobile from "../../hooks/useIsMobile";
import BrandUGCMobile, { UGC_MIN_BUDGET, UGC_MAX_BUDGET, ugcBudgetError } from "./BrandUGCMobile"; // v416: one budget rule for both screens
import AiPromptSheet from "./brandUgc/AiPromptSheet"; // v416 (U22): "Write my brief with Eva" on desktop too
import { draftGet, draftRemove, draftSet } from "../../lib/userDraft";

const SUGGESTED_DOS = [
  "Show product texture clearly in natural daylight",
  "Include strong hook in first 3 seconds",
  "Demonstrate product in actual daily use",
  "Include clear call-to-action (where to buy)",
  "Highlight unboxing & key benefits"
];

const SUGGESTED_DONTS = [
  "Do not mention competitor brand names or prices",
  "Do not use heavy artificial smoothing filters",
  "Avoid noisy background or distracting clutter",
  "Do not show damaged shipping boxes",
  "Do not publish without prior brand review approval"
];

function BrandUGCPostDesktop() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: "",
    detailed_requirements: "",
    product_name: "",
    product_description: "",
    product_url: "",
    sample_content_url: "",
    deliverable_type: "collaboration_reel",
    video_duration: "30s",
    dos: [""],
    donts: [""],
    budget: 2000, // v416: a real starting budget (was ₹1)
    max_creators: 1,
    delivery_hours: DEFAULT_DELIVERY_HOURS
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ugcFee, setUgcFee] = useState({ quote: null, couponCode: "" }); // v364
  const [ugcMethod, setUgcMethod] = useState("upi"); // v366: Ravi's checkout — Razorpay opens on the picked app / method
  // Session 24: "Your money stays safe" — first time the brand opens the post flow.
  const [explainerOpen, openExplainer, closeExplainer, explainerReopened] = useBriefExplainer(user?.user_id, true);
  const [isPosted, setIsPosted] = useState(false);
  // v415: each step starts at its top (Next kept the old scroll position, so step 2 opened half-way down)
  const firstStepRef = React.useRef(true);
  useEffect(() => {
    if (firstStepRef.current) { firstStepRef.current = false; return; }
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const box = document.getElementById("app-scroll-container");
      if (box) box.scrollTo({ top: 0, behavior: "smooth" });
    } catch { /* old browsers */ }
  }, [step]);

  useEffect(() => {
    const draft = draftGet("ugc_draft");
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed) {
          const loadedData = parsed.formData || parsed;
          if (loadedData.title || loadedData.product_name || loadedData.deliverable_type) {
            setFormData(prev => ({ ...prev, ...loadedData }));
          }
          if (parsed.step) {
            setStep(parsed.step);
          }
        }
      } catch (e) {
        console.error("Failed to parse UGC draft:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (!isPosted && (formData.title || formData.product_name || step > 1)) {
      draftSet("ugc_draft", JSON.stringify({ formData, step, updated_at: Date.now() }));
    }
  }, [formData, step, isPosted]);

  // v416 (CR19): real minimum (₹500) and maximum (₹5,00,000) per creator, shared with the phone screen
  const getMinBudget = (type) => UGC_MIN_BUDGET; // eslint-disable-line no-unused-vars
  const budgetError = ugcBudgetError(formData.budget);
  // v416 (U5): paid on this device but the brief wasn't saved → the button retries the save, no new charge
  const [paidRetry, setPaidRetry] = useState(() => Boolean(getPaidBriefOrder()));
  // v416 (U22): Eva brief writer (same sheet and server call as the phone)
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const handleGenerateWithAi = async (customPrompt = "") => {
    const typed = [formData.product_name, formData.title, formData.detailed_requirements, formData.product_description].some((v) => String(v || "").trim().length >= 2);
    if (!customPrompt && !typed) { toast.error("Type a product name or a few words about the video first — or pick a category.", { id: "ai-brief" }); return; }
    setAiGenerating(true);
    toast.loading("Writing your brief…", { id: "ai-brief" });
    try {
      const res = await api.post("/ugc/ai-generate-brief", {
        product_name: formData.product_name || "",
        ...(customPrompt ? { category: customPrompt } : {}),
        focus_area: customPrompt || formData.detailed_requirements || "Authentic viral conversion",
        current_title: formData.title,
        current_requirements: formData.detailed_requirements
      });
      const ai = res.data?.ok ? res.data.data : null;
      if (!ai) { toast.error("Couldn't write a brief right now. Please try again.", { id: "ai-brief" }); return; }
      setFormData((prev) => ({
        ...prev,
        title: ai.title || prev.title,
        product_description: ai.product_description || prev.product_description,
        detailed_requirements: ai.detailed_requirements || prev.detailed_requirements,
        dos: Array.isArray(ai.dos) && ai.dos.length > 0 ? ai.dos : prev.dos,
        donts: Array.isArray(ai.donts) && ai.donts.length > 0 ? ai.donts : prev.donts,
      }));
      toast.success("Brief written — review and edit it below.", { id: "ai-brief" });
      setShowAiAssist(false);
    } catch (e) {
      toast.error("Couldn't reach Ybex Eva right now. Your brief is unchanged — please try again.", { id: "ai-brief" });
    } finally {
      setAiGenerating(false);
    }
  };

  const getFormatLabel = (type) => {
    if (type === 'collaboration_reel') return 'COLLABORATION REEL';
    if (type === 'ugc_video_raw') return 'UGC VIDEO — RAW';
    if (type === 'ugc_video_edited') return 'UGC VIDEO — EDITED';
    return 'UGC BRIEF';
  };

  const handleFormatChange = (newType) => {
    setFormData(prev => ({
      ...prev,
      deliverable_type: newType, // v416: the budget is not changed behind the brand's back
      video_duration: newType === 'ugc_video_raw' ? 'Raw Clips' : (prev.video_duration === 'Raw Clips' ? '30s' : prev.video_duration)
    }));
  };

  // Session 26: one brief post per payment, even if the checkout callback and the safety net
  // both fire (the server is idempotent per order too).
  const postingRef = React.useRef(false);
  const stopWatchRef = React.useRef(null);
  React.useEffect(() => () => { if (stopWatchRef.current) stopWatchRef.current(); }, []);

  const handlePost = async () => {
    if (isSubmitting) return;
    // v416 (CR19): an invalid budget is an error, never raised / lowered silently
    if (budgetError && !getPaidBriefOrder()) { toast.error(budgetError, { id: "ugc-budget" }); setStep(4); return; }
    setIsSubmitting(true);
    postingRef.current = false;
    const minB = getMinBudget(formData.deliverable_type);
    // v423 (P7): retrying a PAID order posts exactly what was paid — not the form's current budget / creators.
    const paidTerms = getPaidBriefOrder() ? paidBriefTerms() : null;
    let finalBudget = paidTerms ? paidTerms.budget : Number(formData.budget);
    let numCreators = paidTerms ? paidTerms.max_creators : Math.max(1, Number(formData.max_creators) || 1);
    let totalEscrowAmount = finalBudget * numCreators;
    const payTerms = { budget: finalBudget, max_creators: numCreators };

    // Session 24: post against a PAID order; on failure keep the order so a retry never
    // charges again (src/lib/briefPaymentRetry.js).
    const postBrief = async (orderId) => {
      if (postingRef.current) return;
      postingRef.current = true;
      if (stopWatchRef.current) { stopWatchRef.current(); stopWatchRef.current = null; }
      try {
        await api.post("ugc/briefs", {
          // The server creates the brief only against this PAID order.
          razorpay_order_id: orderId || null,
          title: formData.title || `Review of ${formData.product_name}`,
          ...formData,
          budget: finalBudget,
          min_budget: minB,
          max_creators: numCreators,
          total_budget: totalEscrowAmount,
          dos: formData.dos?.filter(d => !!d.trim()),
          donts: formData.donts?.filter(d => !!d.trim()),
        });
        clearPaidBriefOrder();
        setPaidRetry(false); // v416
        setIsPosted(true);
        draftRemove("ugc_draft");
        toast.success("Brief posted — the payment is held safely until you approve the videos.", { id: "ugc-pay" }); // v416: one toast id
        setIsSubmitting(false);
        goToPostedBriefs(navigate);
      } catch (err) {
        postingRef.current = false;
        const code = err?.response?.data?.code;
        if (FINAL_ORDER_CODES.includes(code) || isFinalBriefError(err)) {
          clearPaidBriefOrder();
          setPaidRetry(false); // v416
          toast.error(`${err?.response?.data?.error || "This payment can't be used for the brief."} Contact support if you were charged.`, { id: "ugc-pay", duration: 10000 });
        } else {
          savePaidBriefOrder(orderId, totalEscrowAmount);
          setPaidRetry(true); // v416 (U5): the button now reads "Retry saving brief (no new charge)"
          // v416 (U5): one toast (id), and it names the button the brand will actually see
          toast.error("Payment received, but the brief couldn't be saved. Press “Retry saving brief” — you won't be charged again.", { id: "ugc-pay", duration: 10000 });
        }
        setIsSubmitting(false);
      }
    };

    const paid = getPaidBriefOrder();
    if (paid) {
      await postBrief(paid.order_id);
      return;
    }
    // Session 56: an order from an earlier try that got paid after the app/tab closed → use it.
    const recovered = await recoverPendingBriefOrder(undefined, undefined, undefined, totalEscrowAmount); // v423 (P8): + a paid order from another device
    if (recovered) {
      const rt = paidBriefTerms(); // v423 (P7): the recovered order's paid numbers
      if (rt) { finalBudget = rt.budget; numCreators = rt.max_creators; totalEscrowAmount = rt.budget * rt.max_creators; }
      await postBrief(recovered);
      return;
    }

    // v332: if the checkout can't even open, the button stayed on "Processing..." for good
    try {
    await processRazorpayPayment({
      grossAmount: totalEscrowAmount,
      couponCode: ugcFee.couponCode || "", // v364
      method: ugcMethod, // v366
      onOrderCreated: (orderId) => {
        savePendingBriefOrder(orderId, totalEscrowAmount, payTerms);
        // Safety net: payment done but the success callback never came → post anyway.
        stopWatchRef.current = watchPaidOrder(checkBriefOrderPaid, orderId, (paidId) => {
          savePaidBriefOrder(paidId, totalEscrowAmount, payTerms);
          postBrief(paidId);
        });
      },
      onSuccess: async (paymentData) => {
        const orderId = paymentData?.order_id || paymentData?.razorpay_order_id || null;
        savePaidBriefOrder(orderId, totalEscrowAmount, payTerms);
        await postBrief(orderId);
      },
      onError: () => {
        // Closing the checkout stops the button spinner, but the safety net keeps watching a
        // little longer in case a UPI payment still lands.
        setIsSubmitting(false);
      }
    });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't open the payment. Please try again.", { id: "ugc-pay" });
    } finally {
      // v416 (CR6): whatever way the checkout ended (closed, failed, SDK missing), the button leaves "Processing…".
      // A brief save still running keeps its own busy state (postBrief clears it).
      if (!postingRef.current) setIsSubmitting(false);
    }
  };

  const countWords = (str = "") => str.trim() ? str.trim().split(/\s+/).filter(Boolean).length : 0;

  const Step1 = () => {
    const reqWords = countWords(formData.detailed_requirements || "");
    const reqChars = (formData.detailed_requirements || "").length;
    const isOverWordLimit = reqWords > 200;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        {/* v416 (U22): same "Write my brief with Eva" helper as the phone */}
        <button type="button" onClick={() => setShowAiAssist(true)} className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-[var(--violet-border)] bg-[var(--violet-soft)] text-left hover:shadow-sm transition-all cursor-pointer" data-testid="ugc-eva-write">
          <span className="w-9 h-9 rounded-lg bg-white text-[var(--violet)] flex items-center justify-center shrink-0"><Lightbulb size={18} /></span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[var(--text-primary)]">Write my brief with Eva</span>
            <span className="block text-xs text-[var(--text-secondary)]">Pick a category or let Eva write from what you've typed. You can edit everything.</span>
          </span>
        </button>
        <div>
          <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">
            Campaign Title <span className="text-rose-500">*</span>
          </label>
          <input 
            type="text" 
            maxLength={100} 
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-4 text-[var(--text-primary)] focus:border-[var(--violet)] transition-colors outline-none font-medium" 
            placeholder="e.g. Summer Skincare Unboxing & Routine (Min 5 chars)" 
            value={formData.title} 
            onChange={e => setFormData({...formData, title: e.target.value})} 
          />
          {formData.title.trim().length > 0 && formData.title.trim().length < 5 && (
            <p className="text-amber-500 text-[11px] font-semibold mt-1.5 flex items-center gap-1">
              <AlertCircle size={12} /> Campaign title must be at least 5 characters long.
            </p>
          )}
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
              Detailed Requirements <span className="text-rose-500">*</span>
            </label>
            <span className={`text-[11px] font-mono font-medium ${isOverWordLimit ? 'text-red-400 font-bold' : reqWords > 160 ? 'text-amber-400' : 'text-[var(--text-tertiary)]'}`}>
              {reqWords} / 200 words ({reqChars} / 1000 chars)
            </span>
          </div>
          <textarea 
            rows={5} 
            maxLength={1000}
            className={`w-full bg-[var(--bg-elevated)] border rounded-xl px-4 py-4 text-[var(--text-primary)] focus:border-[var(--violet)] transition-colors outline-none font-medium leading-relaxed ${isOverWordLimit ? 'border-red-500' : 'border-[var(--border-default)]'}`} 
            placeholder="Describe what you expect from the creator: tone, key product benefits to highlight, call to action (Min 10 chars, Max 200 words)..." 
            value={formData.detailed_requirements || ''} 
            onChange={e => {
              const val = e.target.value;
              setFormData({...formData, detailed_requirements: val});
            }} 
          />
          {formData.detailed_requirements.trim().length > 0 && formData.detailed_requirements.trim().length < 10 && (
            <p className="text-amber-500 text-[11px] font-semibold mt-1.5 flex items-center gap-1">
              <AlertCircle size={12} /> Detailed requirements must be at least 10 characters long.
            </p>
          )}
          {isOverWordLimit && (
            <p className="text-red-400 text-xs mt-1.5 font-semibold flex items-center gap-1">
              <AlertCircle size={13} /> Description is too long. Please keep it under 200 words.
            </p>
          )}
        </div>

        <button 
          onClick={() => {
            if (formData.title.trim().length < 5) {
              toast.error("Campaign Title must be at least 5 characters long.");
              return;
            }
            if ((formData.detailed_requirements || "").trim().length < 10) {
              toast.error("Detailed Requirements must be at least 10 characters long.");
              return;
            }
            if (isOverWordLimit) {
              toast.error("Detailed requirements exceed 200 words limit. Please shorten it.");
              return;
            }
            setStep(2);
          }} 
          className="w-full bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold py-4 rounded-xl mt-4 active:scale-95 transition-all shadow-xl cursor-pointer"
        >
          Next: Product Info
        </button>
      </div>
    );
  };

  const Step2 = () => {
    const descWords = countWords(formData.product_description || "");
    const descChars = (formData.product_description || "").length;
    const isOverDescLimit = descWords > 100;

    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">
            Product Name <span className="text-rose-500">*</span>
          </label>
          <input 
            type="text" 
            maxLength={80} 
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-3.5 text-[var(--text-primary)] focus:border-[var(--violet)] transition-colors outline-none font-medium" 
            placeholder="e.g. Glowing Face Serum 50ml (Min 2 chars)" 
            value={formData.product_name} 
            onChange={e => setFormData({...formData, product_name: e.target.value})} 
          />
          {formData.product_name.trim().length > 0 && formData.product_name.trim().length < 2 && (
            <p className="text-amber-500 text-[11px] font-semibold mt-1 flex items-center gap-1">
              <AlertCircle size={12} /> Product Name must be at least 2 characters.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">Sample Content URL (Optional)</label>
          <input type="url" className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-3.5 text-[var(--text-primary)] focus:border-[var(--violet)] transition-colors outline-none font-mono text-xs" placeholder="https://instagram.com/p/... or moodboard link" value={formData.sample_content_url || ''} onChange={e => setFormData({...formData, sample_content_url: e.target.value})} />
        </div>

        <div>
          <div className="flex justify-between items-end mb-2">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
                Product Description <span className="text-rose-500">*</span>
              </label>
              <span className={`text-[10px] font-mono font-medium ${isOverDescLimit ? 'text-red-400 font-bold' : 'text-[var(--text-tertiary)]'}`}>
                {descWords}/100 words ({descChars}/500 chars)
              </span>
            </div>
          </div>
          
          <textarea 
            rows={3} 
            maxLength={500}
            className={`w-full bg-[var(--bg-elevated)] border rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--violet)] transition-colors outline-none font-medium leading-relaxed ${isOverDescLimit ? 'border-red-500' : 'border-[var(--border-default)]'}`} 
            placeholder="What makes it special? Key ingredients, features, or selling points (Min 10 chars, Max 100 words)..." 
            value={formData.product_description} 
            onChange={e => setFormData({...formData, product_description: e.target.value})} 
          />
          {formData.product_description.trim().length > 0 && formData.product_description.trim().length < 10 && (
            <p className="text-amber-500 text-[11px] font-semibold mt-1 flex items-center gap-1">
              <AlertCircle size={12} /> Product Description must be at least 10 characters.
            </p>
          )}
          {isOverDescLimit && (
            <p className="text-red-400 text-xs mt-1 font-semibold flex items-center gap-1">
              <AlertCircle size={12} /> Product description is too long (Max 100 words).
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-2">Product URL (Optional)</label>
          <input type="url" className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-3.5 text-[var(--text-primary)] focus:border-[var(--violet)] transition-colors outline-none font-mono text-xs" placeholder="https://yourbrand.com/product" value={formData.product_url} onChange={e => setFormData({...formData, product_url: e.target.value})} />
        </div>

        <div className="flex gap-3 pt-2">
           <button onClick={() => setStep(1)} className="flex-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold py-3.5 rounded-xl active:scale-95 transition-all mb-4 border border-[var(--border-default)] cursor-pointer">Back</button>
           <button 
             onClick={() => {
               if (formData.product_name.trim().length < 2) {
                 toast.error("Product Name must be at least 2 characters.");
                 return;
               }
               if ((formData.product_description || "").trim().length < 10) {
                 toast.error("Product Description must be at least 10 characters.");
                 return;
               }
               if (isOverDescLimit) {
                 toast.error("Product description exceeds 100 words limit.");
                 return;
               }
               setStep(3);
             }} 
             className="w-2/3 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold py-3.5 rounded-xl active:scale-95 transition-all mb-4 shadow-xl cursor-pointer"
           >
             Next: Deliverables
           </button>
        </div>
      </div>
    );
  };

  const Step3 = () => {
    const isRaw = formData.deliverable_type === 'ugc_video_raw';
    const isCollabReel = formData.deliverable_type === 'collaboration_reel';
    const isUgcVideo = formData.deliverable_type === 'ugc_video_raw' || formData.deliverable_type === 'ugc_video_edited';

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
            Select Campaign Format
          </label>

          {/* TWO TOP-LEVEL CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Collaboration Reel */}
            <div 
              onClick={() => handleFormatChange('collaboration_reel')}
              role="button" tabIndex={0} aria-pressed={isCollabReel} /* v415: keyboard reachable */
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleFormatChange('collaboration_reel'); } }}
              className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                isCollabReel 
                  ? 'border-[#7C3AED] bg-[#F5F0FF]/80 ring-2 ring-[#7C3AED]/20 shadow-md shadow-[#7C3AED]/10' 
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-xs'
              }`}
            >
              {isCollabReel && (
                <div className="absolute top-3.5 right-3.5 w-6 h-6 rounded-full bg-[#7C3AED] text-white flex items-center justify-center shadow-sm">
                  <Check size={14} strokeWidth={3} />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isCollabReel ? 'bg-[#7C3AED] text-white shadow-md shadow-[#7C3AED]/25' : 'bg-[#F5F0FF] text-[#7C3AED] border border-[#DDD6FE]'}`}>
                    <Film size={20} />
                  </div>
                </div>
                <h4 className={`text-base font-black mb-1 ${isCollabReel ? 'text-[#7C3AED]' : 'text-[var(--text-primary)]'}`}>
                  Collaboration Reel
                </h4>
                <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
                  Creator edits content & publishes directly on their own Instagram/social handle with brand collaboration tag.
                </p>
              </div>
            </div>

            {/* Card 2: UGC Video */}
            <div 
              onClick={() => {
                if (!isUgcVideo) {
                  handleFormatChange('ugc_video_edited');
                }
              }}
              role="button" tabIndex={0} aria-pressed={isUgcVideo} /* v415: keyboard reachable */
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !isUgcVideo) { e.preventDefault(); handleFormatChange('ugc_video_edited'); } }}
              className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                isUgcVideo 
                  ? 'border-[#7C3AED] bg-[#F5F0FF]/80 ring-2 ring-[#7C3AED]/20 shadow-md shadow-[#7C3AED]/10' 
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-xs'
              }`}
            >
              {isUgcVideo && (
                <div className="absolute top-3.5 right-3.5 w-6 h-6 rounded-full bg-[#7C3AED] text-white flex items-center justify-center shadow-sm">
                  <Check size={14} strokeWidth={3} />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isUgcVideo ? 'bg-[#7C3AED] text-white shadow-md shadow-[#7C3AED]/25' : 'bg-blue-50 text-[#7C3AED] border border-blue-100'}`}>
                    <Camera size={20} />
                  </div>
                </div>
                <h4 className={`text-base font-black mb-1 ${isUgcVideo ? 'text-[#7C3AED]' : 'text-[var(--text-primary)]'}`}>
                  UGC Video
                </h4>
                <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
                  Creator shoots video footage and uploads via Google Drive. Brand reviews & approves before payment.
                </p>
              </div>
            </div>
          </div>

          {/* SECONDARY SUB-TOGGLE FOR UGC VIDEO */}
          {isUgcVideo && (
            <div className="mt-4 p-4.5 rounded-2xl bg-slate-50/80 border border-slate-200 animate-in fade-in slide-in-from-top-2">
              <label className="block text-[11px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
                UGC Video Sub-Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleFormatChange('ugc_video_raw')}
                  className={`py-3.5 px-4 rounded-xl border-2 text-xs transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
                    formData.deliverable_type === 'ugc_video_raw'
                      ? 'border-[#7C3AED] bg-white text-[#7C3AED] ring-2 ring-[#7C3AED]/20 shadow-md shadow-[#7C3AED]/10'
                      : 'border-slate-200 bg-white text-gray-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {formData.deliverable_type === 'ugc_video_raw' && (
                    <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[#7C3AED] text-white flex items-center justify-center">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                  <span className="font-black uppercase tracking-wider text-[11px]">Completely Raw</span>
                  <span className={`text-[10px] font-bold ${formData.deliverable_type === 'ugc_video_raw' ? 'text-[#7C3AED]/90' : 'text-gray-500'}`}>No editing</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFormatChange('ugc_video_edited')}
                  className={`py-3.5 px-4 rounded-xl border-2 text-xs transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
                    formData.deliverable_type === 'ugc_video_edited'
                      ? 'border-[#7C3AED] bg-white text-[#7C3AED] ring-2 ring-[#7C3AED]/20 shadow-md shadow-[#7C3AED]/10'
                      : 'border-slate-200 bg-white text-gray-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {formData.deliverable_type === 'ugc_video_edited' && (
                    <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[#7C3AED] text-white flex items-center justify-center">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                  <span className="font-black uppercase tracking-wider text-[11px]">Edited</span>
                  <span className={`text-[10px] font-bold ${formData.deliverable_type === 'ugc_video_edited' ? 'text-[#7C3AED]/90' : 'text-gray-500'}`}>Fully edited</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* DURATION SELECTOR (HIDDEN FOR RAW CLIPS) */}
        {!isRaw ? (
          <div>
            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
              Video Duration
            </label>
            <div className="flex flex-wrap gap-2.5">
              {['15s', '30s', '60s', '90s'].map(dur => (
                <button 
                  key={dur} 
                  type="button"
                  onClick={() => setFormData({...formData, video_duration: dur})} 
                  className={`px-6 py-3 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer relative ${
                    formData.video_duration === dur 
                      ? 'border-[#7C3AED] bg-[#F5F0FF] text-[#7C3AED] ring-2 ring-[#7C3AED]/20 shadow-md shadow-[#7C3AED]/10 scale-105' 
                      : 'border-slate-200 text-gray-600 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {dur}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-2 text-xs text-[var(--text-secondary)] font-medium flex items-start gap-1.5">
            {/* v415: calm note (was a 🚨 alarm for a normal choice) */}
            <span className="leading-snug">Raw clips have no fixed length — creators upload unedited footage for your team to edit.</span>
          </div>
        )}

        {/* MUST DO */}
        <div className="pt-2">
          <div className="flex justify-between items-center mb-2">
            <label className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-widest">{/* v415: readable green (400 was too light on white) */}
              <CheckCircle2 size={16}/> Must DO
            </label>
            <span className="text-[11px] text-[var(--text-tertiary)]">Rules creators must follow</span>
          </div>

          {formData.dos?.map((v, i) => (
            <div key={"do" + i} className="flex items-center gap-2 mb-2">
              <input 
                type="text" 
                className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] focus:border-emerald-500 outline-none text-sm font-medium" 
                placeholder="e.g. Show product texture clearly in natural lighting" 
                value={v} 
                onChange={e => {
                  const newDos = [...formData.dos];
                  newDos[i] = e.target.value;
                  setFormData({...formData, dos: newDos});
                }}
              />
              {formData.dos.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const newDos = formData.dos.filter((_, idx) => idx !== i);
                    setFormData({...formData, dos: newDos.length ? newDos : [""]});
                  }}
                  className="p-2 text-gray-500 hover:text-rose-500 transition-colors cursor-pointer"
                  title="Remove rule"
                  aria-label="Remove rule" /* v415 */
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between mt-1 mb-3">
            <button 
              type="button" 
              onClick={() => setFormData({...formData, dos: [...formData.dos, ""]})} 
              className="text-emerald-700 text-xs font-bold transition-all hover:text-emerald-800 cursor-pointer" /* v415: contrast */
            >
              + Add Rule
            </button>
          </div>

          {/* Quick Suggestions for Must DO */}
          <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-default)] rounded-xl p-3">
            <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-2">
              💡 Suggestions (Click to add):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_DOS.map((sug, idx) => {
                const isAdded = formData.dos?.includes(sug);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (isAdded) {
                        setFormData({
                          ...formData,
                          dos: formData.dos.filter(d => d !== sug)
                        });
                      } else {
                        const emptyIdx = formData.dos?.findIndex(d => !d.trim());
                        if (emptyIdx !== -1 && emptyIdx !== undefined) {
                          const updated = [...formData.dos];
                          updated[emptyIdx] = sug;
                          setFormData({ ...formData, dos: updated });
                        } else {
                          setFormData({ ...formData, dos: [...(formData.dos || []), sug] });
                        }
                      }
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer text-left ${
                      isAdded
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 font-semibold'
                        : 'border-[var(--border-default)] hover:border-emerald-400/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {isAdded ? "✓ " : "+ "} {sug}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* MUST NOT DO */}
        <div className="pt-2">
          <div className="flex justify-between items-center mb-2">
            <label className="flex items-center gap-2 text-xs font-bold text-red-600 uppercase tracking-widest">{/* v415: contrast */}
              <AlertCircle size={16}/> Must NOT DO (DON'Ts)
            </label>
            <span className="text-[11px] text-[var(--text-tertiary)]">Strict restrictions</span>
          </div>

          {formData.donts?.map((v, i) => (
            <div key={"dont" + i} className="flex items-center gap-2 mb-2">
              <input 
                type="text" 
                className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] focus:border-red-500 outline-none text-sm font-medium" 
                placeholder="e.g. Do not mention competitor brand names or prices" 
                value={v} 
                onChange={e => {
                  const newDonts = [...formData.donts];
                  newDonts[i] = e.target.value;
                  setFormData({...formData, donts: newDonts});
                }}
              />
              {formData.donts.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const newDonts = formData.donts.filter((_, idx) => idx !== i);
                    setFormData({...formData, donts: newDonts.length ? newDonts : [""]});
                  }}
                  className="p-2 text-gray-500 hover:text-rose-500 transition-colors cursor-pointer"
                  title="Remove restriction"
                  aria-label="Remove restriction" /* v415 */
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between mt-1 mb-3">
            <button 
              type="button" 
              onClick={() => setFormData({...formData, donts: [...formData.donts, ""]})} 
              className="text-red-600 text-xs font-bold transition-all hover:text-red-700 cursor-pointer" /* v415: contrast */
            >
              + Add Rule
            </button>
          </div>

          {/* Quick Suggestions for Must NOT DO */}
          <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-default)] rounded-xl p-3">
            <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-2">
              💡 Suggestions (Click to add):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_DONTS.map((sug, idx) => {
                const isAdded = formData.donts?.includes(sug);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (isAdded) {
                        setFormData({
                          ...formData,
                          donts: formData.donts.filter(d => d !== sug)
                        });
                      } else {
                        const emptyIdx = formData.donts?.findIndex(d => !d.trim());
                        if (emptyIdx !== -1 && emptyIdx !== undefined) {
                          const updated = [...formData.donts];
                          updated[emptyIdx] = sug;
                          setFormData({ ...formData, donts: updated });
                        } else {
                          setFormData({ ...formData, donts: [...(formData.donts || []), sug] });
                        }
                      }
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer text-left ${
                      isAdded
                        ? 'border-red-500 bg-red-500/10 text-red-600 font-semibold'
                        : 'border-[var(--border-default)] hover:border-red-400/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {isAdded ? "✓ " : "+ "} {sug}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
           <button onClick={() => setStep(2)} className="flex-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold py-3.5 rounded-xl active:scale-95 transition-all border border-[var(--border-default)] cursor-pointer">Back</button>
           <button onClick={() => setStep(4)} className="w-2/3 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold py-3.5 rounded-xl active:scale-95 transition-all shadow-xl cursor-pointer">Next: Budget</button>
        </div>
      </div>
    );
  };

  const Step4 = () => {
    const minBudget = getMinBudget(formData.deliverable_type);

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
              Budget per Video (₹)
            </label>
            <span className="text-[10px] font-bold text-[var(--violet)] uppercase tracking-wider bg-[var(--violet)]/10 px-2.5 py-1 rounded-full border border-[var(--violet)]/20">
              Minimum: ₹{minBudget.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-4xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter">₹</span>
            <input 
              type="number"
              min={minBudget}
              max={UGC_MAX_BUDGET}
              aria-label="Budget per video in rupees"
              aria-invalid={Boolean(budgetError)}
              value={formData.budget === 0 ? '' : formData.budget}
              onChange={e => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                setFormData({...formData, budget: val});
              }}
              /* v416 (CR19 / U21): no silent clamp on blur — the error below says what is allowed */
              className={`text-4xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter bg-transparent border-b-2 border-dashed outline-none w-full max-w-[280px] ${budgetError ? "border-rose-400 focus:border-rose-500" : "border-[var(--border-default)] focus:border-[var(--violet)]"}`}
            />
          </div>
          <p className="text-xs text-[var(--text-tertiary)] font-medium mb-1">
            Between ₹{minBudget.toLocaleString("en-IN")} and ₹{UGC_MAX_BUDGET.toLocaleString("en-IN")} per video.
          </p>
          {budgetError ? <p className="text-xs font-semibold text-rose-600 mb-5" role="alert" data-testid="ugc-budget-error">{budgetError}</p> : <div className="mb-5" />}

          <input 
            type="range" 
            min={minBudget} 
            max="50000" 
            step="100"
            value={Math.min(50000, Math.max(minBudget, Number(formData.budget) || minBudget))} 
            aria-label="Budget per video slider"
            onChange={e => {
              const val = Number(e.target.value);
              setFormData({...formData, budget: Math.max(val, minBudget)});
            }} 
            className="w-full accent-[var(--violet)]" 
          />
        </div>

        <div className="pt-4">
          <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
            Number of Creators Needed
          </label>
          <div className="flex gap-2.5">
            {[1, 2, 3, 5, 10].map(num => (
              <button 
                key={num} 
                type="button"
                onClick={() => setFormData({...formData, max_creators: num})} 
                className={`w-12 h-12 rounded-xl border-2 font-black text-sm transition-all cursor-pointer ${
                  formData.max_creators === num 
                    ? 'border-[#7C3AED] bg-[#F5F0FF] text-[#7C3AED] ring-2 ring-[#7C3AED]/20 shadow-md shadow-[#7C3AED]/10 scale-105' 
                    : 'border-slate-200 text-gray-600 bg-white hover:border-slate-300'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Session 24: first-draft deadline the creator gets after claiming */}
        <div className="pt-4">
          <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
            When do you need the video?
          </label>
          <div className="flex gap-2.5" data-testid="delivery-hours-picker">
            {DELIVERY_OPTIONS.map(opt => {
              const active = deliveryHoursOf(formData.delivery_hours) === opt.hours;
              return (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => setFormData({...formData, delivery_hours: opt.hours})}
                  className={`px-4 py-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    active
                      ? 'border-[#7C3AED] bg-[#F5F0FF] text-[#7C3AED] ring-2 ring-[#7C3AED]/20'
                      : 'border-slate-200 text-gray-600 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="block text-sm font-black">{opt.label}</span>
                  <span className="block text-[11px] font-semibold opacity-80">{opt.sub}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">The first draft is due this long after a creator claims.</p>
        </div>

        <div className="flex gap-3 pt-8">
           <button onClick={() => setStep(3)} className="flex-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold py-3.5 rounded-xl border border-[var(--border-default)] active:scale-95 transition-all cursor-pointer">Back</button>
           <button onClick={() => { if (budgetError) { toast.error(budgetError, { id: "ugc-budget" }); return; } setStep(5); } /* v416 */} className="w-2/3 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold py-3.5 rounded-xl active:scale-95 transition-all shadow-xl cursor-pointer">Review & Pay</button>
        </div>
      </div>
    );
  };

  const Step5 = () => {
    // v416 (CR19): the real budget (never clamped); "—" if it is invalid (Pay then sends the brand back to step 4)
    const totalEscrow = budgetError ? 0 : Number(formData.budget) * formData.max_creators;
    const cleanDos = (formData.dos || []).filter((d) => String(d || "").trim());
    const cleanDonts = (formData.donts || []).filter((d) => String(d || "").trim());

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-[var(--bg-card)] rounded-3xl p-6 border border-[var(--border-default)] shadow-xl">
          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">{formData.title || `Review of ${formData.product_name}`}</h3>
          <p className="text-sm text-[var(--text-tertiary)] mb-6">{formData.product_name}</p>

          <div className="space-y-3 text-sm text-[var(--text-tertiary)] font-medium pb-6 border-b border-[var(--border-default)] mb-6">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)] uppercase tracking-widest text-[10px] font-bold">Format</span>
              <span className="uppercase tracking-wider font-bold text-[var(--violet)]">{getFormatLabel(formData.deliverable_type)}{formData.deliverable_type !== "ugc_video_raw" && formData.video_duration ? ` · ${formData.video_duration}` : ""}{/* v415: raw clips have no length */}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)] uppercase tracking-widest text-[10px] font-bold">Quantity</span>
              <span className="font-bold">{formData.max_creators} Creator{formData.max_creators > 1 ? 's' : ''}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)] uppercase tracking-widest text-[10px] font-bold">First draft</span>
              <span className="font-bold">Within {deliveryHoursOf(formData.delivery_hours)} hours</span>
            </div>
            <div className="flex justify-between text-[var(--text-primary)] font-bold">
              <span className="text-[var(--text-secondary)] uppercase tracking-widest text-[10px] font-bold">Total Budget in Payment Hold</span>
              <span className="text-[var(--violet)] font-black text-lg">{totalEscrow > 0 ? `₹${totalEscrow.toLocaleString("en-IN")}` : "—"}</span>
            </div>
          </div>
          {/* v416 (U22): the review step shows what creators will read — product, must-do and don'ts */}
          <div className="space-y-3 text-sm pb-6 border-b border-[var(--border-default)] mb-6" data-testid="ugc-review-brief">
            {formData.product_description && (
              <div>
                <p className="text-[var(--text-secondary)] uppercase tracking-widest text-[10px] font-bold mb-1">Product</p>
                <p className="text-[var(--text-primary)] leading-relaxed break-words">{formData.product_description}</p>
              </div>
            )}
            {cleanDos.length > 0 && (
              <div>
                <p className="text-emerald-700 uppercase tracking-widest text-[10px] font-bold mb-1">Must do</p>
                <ul className="space-y-1">{cleanDos.map((d, i) => <li key={"rd" + i} className="flex gap-1.5 text-[var(--text-primary)]"><Check size={14} className="shrink-0 mt-0.5 text-emerald-600" /><span className="break-words">{d}</span></li>)}</ul>
              </div>
            )}
            {cleanDonts.length > 0 && (
              <div>
                <p className="text-red-600 uppercase tracking-widest text-[10px] font-bold mb-1">Don'ts</p>
                <ul className="space-y-1">{cleanDonts.map((d, i) => <li key={"rn" + i} className="flex gap-1.5 text-[var(--text-primary)]"><X size={14} className="shrink-0 mt-0.5 text-red-500" /><span className="break-words">{d}</span></li>)}</ul>
              </div>
            )}
          </div>
          {/* v364 (Ravi: brand fee on UGC too): service fee + coupon + total from the server */}
          {/* v366: Ravi's checkout — You pay + lines, then UPI apps / other ways */}
          <div className="rounded-2xl bg-white p-3 space-y-4">
            <CheckoutDealCard testId="ugc-checkout-card" total={quoteTotal(ugcFee.quote, totalEscrow)} note="Held in Ybex escrow. Each creator is paid only after you approve their video.">
              <BrandFeeSummary grossAmount={totalEscrow} onQuote={setUgcFee} compact variant="checkout" />
            </CheckoutDealCard>
            <CheckoutPicker value={ugcMethod} onChange={setUgcMethod} disabled={isSubmitting} />
          </div>

          <div className="bg-[var(--violet-soft)] border border-[var(--violet-border)] rounded-xl p-4 flex gap-4">
             <div className="mt-1 flex-shrink-0 text-[var(--violet)]"><Check size={20}/></div>
             <div>
               <h4 className="font-bold text-[var(--violet)] text-[11px] uppercase tracking-widest mb-1.5">⚡ Delivery Promise</h4>
               <p className="text-sm text-[var(--violet)]/80 font-medium leading-relaxed">
                 {formData.deliverable_type === 'collaboration_reel' 
                   ? "Creator sends a draft by the deadline → you approve it → they post it and share the live link → you approve the link and the payment is released." /* v415: same steps as the phone screen (the draft review was missing) */
                   : `Creator delivers the video within ${deliveryHoursOf(formData.delivery_hours)} hours of claiming. You approve before any payment is released.`}
               </p>
               <p className="text-sm text-[var(--violet)]/80 font-semibold mt-1.5">✓ Only KYC-verified creators can claim your brief.</p>
             </div>
          </div>
        </div>

        <PayConsentLine />
        <div className="flex gap-3">
           <button disabled={isSubmitting} onClick={() => setStep(4)} className="bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold py-3.5 px-6 rounded-xl border border-[var(--border-default)] active:scale-95 transition-all disabled:opacity-50 cursor-pointer">Back</button>
           <button disabled={isSubmitting} onClick={handlePost} className="flex-1 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-black uppercase tracking-wider py-3.5 rounded-xl active:scale-95 transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
             {isSubmitting ? <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" /><span>{paidRetry ? "Saving brief…" : "Opening checkout…"}</span></> /* v415: spinner, not a blinking word */ : paidRetry ? "Retry saving brief (no new charge)" /* v416 (U5) */ : totalEscrow > 0 ? `Pay ₹${Math.round(quoteTotal(ugcFee.quote, totalEscrow)).toLocaleString("en-IN")} · via ${choiceLabel(ugcMethod)}` : "Fix the budget to pay" /* v366 (was "Secure Brief & Pay") */}
           </button>
        </div>
        <RazorpayTrust />
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-80px)] w-full max-w-[1200px] mx-auto md:pt-12 pb-28 flex flex-col relative">{/* v416 (U20): top-aligned, not centred */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-start">
      {/* LEFT COLUMN: FORM & STEPPER */}
      <div className="w-full flex-col flex max-w-xl mx-auto lg:mx-0">
        <div className="flex items-center justify-between gap-3 mb-8">
          <h1 className="text-3xl font-display font-bold text-[var(--text-primary)] tracking-tight">Post UGC Brief</h1>
          <HowItWorksLink onClick={openExplainer} />
        </div>
        <BriefSafetyExplainer open={explainerOpen} onClose={closeExplainer} reopened={explainerReopened} />
        <AiPromptSheet aiGenerating={aiGenerating} handleGenerateWithAi={handleGenerateWithAi} postData={formData} setShowAiAssist={setShowAiAssist} showAiAssist={showAiAssist} />{/* v416 (U22) */}
        {/* Stepper Header */}
        <div className="flex items-center gap-2 w-full mb-10 overflow-hidden">
          {[1,2,3,4,5].map(num => (
            <React.Fragment key={num}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${step === num ? 'bg-[var(--violet)] text-white shadow-md' : step > num ? 'bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)]' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)]'}`} aria-current={step === num ? "step" : undefined}>{/* v415: finished steps were near-invisible (white/20 on a light page) */}
                {step > num ? <Check size={14}/> : num}
              </div>
              {num < 5 && <div className={`h-1 flex-1 rounded-full transition-colors ${step > num ? 'bg-[var(--violet)]/40' : 'bg-[var(--bg-elevated)]'}`} />}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && Step1()}
        {step === 2 && Step2()}
        {step === 3 && Step3()}
        {step === 4 && Step4()}
        {step === 5 && Step5()}
      </div>

      {/* RIGHT COLUMN: LIVE PREVIEW */}
      <div className="w-full hidden lg:flex justify-center xl:justify-end items-start lg:sticky lg:top-6 self-start">{/* v416 (U20): the preview stays in view on long steps */}
         <div className="w-full max-w-[360px]">
           {/* Brief Live Preview Card - Compact Video Style */}
           <div className="w-full rounded-[2.5rem] overflow-hidden relative shadow-2xl bg-[var(--bg-card)] border border-[var(--border-default)] aspect-[9/16]">
              {/* Fake Video Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--violet)]/30 border-none to-[#3B82F6]/10 mix-blend-screen opacity-50"></div>
              <div className="absolute inset-0 bg-[var(--bg-card)] opacity-90 -z-10 text-[var(--text-primary)]"></div>
              
              {/* Centered Content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
                 <Video size={48} className="mx-auto mb-4 text-[var(--text-tertiary)] drop-shadow-xl" strokeWidth={1.5} />
                 <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-3 tracking-tight">{formData.title || `Review of ${formData.product_name || 'Product'}`}</h3>
                 <p className="text-[var(--text-secondary)] text-sm font-medium line-clamp-3 px-4">{formData.product_description || 'Product description goes here'}</p>
              </div>

              {/* Bottom Tags Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)]/80 to-transparent z-20">
                 <div className="flex flex-wrap items-center gap-2 mb-4">
                    <div className="bg-[var(--violet)] text-white px-3.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(124,58,237,0.4)]">
                       {getFormatLabel(formData.deliverable_type)}
                    </div>
                    <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] px-3.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                       {formData.video_duration || '—'}{/* v332: no placeholder word "DURATION" */}
                    </div>
                 </div>
                 <div className="flex justify-between items-end mt-2 border-t border-[var(--border-default)] pt-4">
                    <div className="text-[var(--text-primary)] w-full">
                      {step < 4 ? (
                        <>
                          {/* v415: a calm placeholder (was five blinking "₹" signs) */}
                          <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mb-1">Budget per video</p>
                          <p className="text-sm font-semibold text-[var(--text-tertiary)] mt-1">You set this in step 4</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mb-1">Budget per video</p>
                          <p className="font-display font-black text-2xl tracking-tight">{Number(formData.budget) > 0 ? `₹${Number(formData.budget).toLocaleString("en-IN")}` : "—"}{/* v415: no ₹0 while the field is empty */}</p>
                        </>
                      )}
                    </div>
                 </div>
              </div>
           </div>
         </div>
      </div>
      </div>
    </div>
  );
}

export default function BrandUGCPost() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  // Session 31: the payment checkout can send the browser "back" to this page right after a brief
  // was posted. Then go to My Briefs instead of showing an empty form.
  const [justPosted] = React.useState(() => takeRecentBriefPost());
  React.useEffect(() => {
    if (!justPosted) return;
    toast.success("Brief posted ✓", { id: "ugc-brief-posted" });
    navigate(BRIEF_POSTED_PATH, { replace: true });
  }, [justPosted, navigate]);
  if (justPosted) return null;
  if (isMobile) {
    return <BrandUGCMobile initialTab="briefs" initialView="post" />;
  }
  return <BrandUGCPostDesktop />;
}

