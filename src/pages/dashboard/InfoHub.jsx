import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ChevronRight, Send, Shield, Target } from "lucide-react";

import LegalSections from "../../components/legal/LegalSections";
import { PUBLIC_TERMS, REFUND_POLICY, roleTermsPage } from "../../lib/legal/legalContent";

export default function InfoHub() {
  const navigate = useNavigate();
  const [isPhone, setIsPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 767px)");
    if (!mq) return undefined;
    const on = () => setIsPhone(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const { slug } = useParams();
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [careerApplied, setCareerApplied] = useState(false);
  const [activeTab, setActiveTab] = useState("about");

  // Scroll to top on page render
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [slug]);

  // Dynamic Content Data
  const getContent = () => {
    switch (slug) {
      /* ==================== ABOUT US ==================== */
      case "about":
        return {
          title: "About Ybex Media",
          subtitle: "India's most transparent open marketplace for verified creators and growth-centric brands.",
          badge: "OUR MISSION",
          // v332: removed a stock photo of strangers shown as if it were the Ybex team.
          body: (
            <div className="space-y-8">
              <p className="text-[var(--text-secondary)] text-lg leading-relaxed">
                Founded in 2026, <strong className="text-[var(--text-primary)]">Ybex Media</strong> was structured to solve the single largest pain point in the Indian creator economy: <span className="text-[var(--violet)] font-semibold">The lack of rate and performance transparency.</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div className="p-6 rounded-2xl bg-foreground/5 border border-[var(--border-default)]">
                  <h3 className="text-lg font-bold mb-2 flex items-center gap-2 text-[var(--violet)]">
                    <Shield size={18} /> Zero Middlemen Markup
                  </h3>
                  <p className="text-sm text-[var(--text-primary)]/60 leading-relaxed">
                    Most agencies charge 30-50% markups on top of creator rates. On Ybex, rate cards are public. You pay exactly what the creator quotes, secured in our secure payment hold locks.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-foreground/5 border border-[var(--border-default)]">
                  <h3 className="text-lg font-bold mb-2 flex items-center gap-2 text-[var(--violet)]">
                    <Target size={18} /> Objective ROI Focus
                  </h3>
                  <p className="text-sm text-[var(--text-primary)]/60 leading-relaxed">
                    With our exclusive Performance Rank System (USP 04), creators earn scores after every delivery. The higher the score, the higher they rank, and the more top-tier campaigns they unlock.
                  </p>
                </div>
              </div>
              <div className="pt-6 border-t border-[var(--border-default)]">
                <h3 className="text-xl font-bold mb-4">Our Core Philosophy</h3>
                <ul className="space-y-3">
                  {[
                    "Trust the Data: 100% verified average reach scores from recent 30-day analytics.",
                    "Safeguard the Funds: Capital is guarded in a secure payment hold and only released upon proof-of-work verification.",
                    "Empower Local Markets: Direct support for tier-2 and tier-3 cities across India.",
                    "Nurture Long-term Collabs: High-delivering creators receive automatic re-collaboration prompts."
                  ].map((item, idx) => (
                    <li key={idx} className="flex gap-3 text-sm text-[var(--text-secondary)]">
                      <span className="text-[var(--violet)] font-bold">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        };

      /* ==================== CAREERS ==================== */
      case "careers":
        // Session 58 (bug hunt): the four job openings were made up, "Apply Now" did nothing and the form threw away what
        // people typed while saying "Application submitted". Now one honest line + email.
        return {
          title: "Work with Ybex",
          subtitle: "We are builders and creative thinkers shaping influencer commerce in India.",
          badge: "CAREERS",
          body: (
            <div className="space-y-6">
              <p className="text-[var(--text-secondary)] text-base leading-relaxed">
                We don't have open roles listed right now. If you'd like to work with us, send a short note about yourself and your work — we read every email.
              </p>
              <a href="mailto:support@ybexmedia.in?subject=Careers%20at%20Ybex" className="inline-flex px-5 py-3 rounded-xl bg-[var(--violet)] text-white text-sm font-bold">Email support@ybexmedia.in</a>
            </div>
          )
        };

      /* ==================== BLOG ==================== */
      case "blog":
        // v332: this page showed four made-up articles (fake dates, "Read Full Article" did nothing). It now
        // points to the real blog.
        return {
          title: "Ybex Blog",
          subtitle: "Guides and updates for Indian brands and creators.",
          badge: "YBEX MEDIA BLOG",
          body: (
            <div className="space-y-4">
              <p className="text-[var(--text-secondary)] text-base leading-relaxed">All our articles are on the Ybex blog.</p>
              <Link to="/blog" className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-[var(--violet)] text-white text-sm font-bold">
                Open the blog <ArrowRight size={14} />
              </Link>
            </div>
          )
        };

      /* ==================== LEGAL (session 34 — text lives in src/lib/legal/legalContent.js) ==================== */
      case "terms":
        return { title: PUBLIC_TERMS.title, subtitle: "The rules for using Ybex. Please read them before you sign up.", badge: "LEGAL", body: <LegalSections page={PUBLIC_TERMS} /> };
      case "refunds":
      case "payments-refunds":
        return { title: REFUND_POLICY.title, subtitle: "How payments, refunds and cancellations work.", badge: "LEGAL", body: <LegalSections page={REFUND_POLICY} /> };
      case "creator-terms":
        return { title: "Creator Terms", subtitle: "Rules for creators on Ybex.", badge: "LEGAL", body: <LegalSections page={roleTermsPage("creator")} /> };
      case "brand-terms":
        return { title: "Brand Terms", subtitle: "Rules for brands on Ybex.", badge: "LEGAL", body: <LegalSections page={roleTermsPage("brand")} /> };

      /* ==================== CONTACT US ==================== */
      case "contact":
        return {
          title: "Get in Touch with Ybex",
          subtitle: "Have a custom campaign query? Or need priority agency onboarding? Simply send a brief message.",
          badge: "TALK TO US NOW",
          body: (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Form Col */}
              <div className="lg:col-span-7 bg-foreground/[0.02] border border-foreground/5 p-6 md:p-8 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--violet)]/5 blur-3xl rounded-full pointer-events-none"></div>
                
                {formSubmitted ? (
                  <div className="text-center py-10">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto text-2xl mb-4">🤝</div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Almost done!</h3>
                    <p className="text-sm text-[var(--text-primary)]/60">Your email app opened with the message — press Send there and our team will reply on email or WhatsApp.</p>
                    <button 
                      onClick={() => setFormSubmitted(false)} 
                      className="mt-6 px-5 py-2 hover:bg-foreground/10 text-xs text-[var(--text-primary)] border border-[var(--border-default)] rounded-xl transition-all"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    // Session 58: the message was thrown away (only "Message Received!" was shown). It now opens the
                    // visitor's email app with everything filled in, addressed to support.
                    const [name, email, company, budget, details] = Array.from(e.currentTarget.elements).filter((el) => ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)).map((el) => String(el.value || "").trim());
                    const body = `Name: ${name}\nEmail: ${email}\nCompany / brand: ${company}\nBudget: ${budget}\n\n${details}`;
                    window.location.href = `mailto:support@ybexmedia.in?subject=${encodeURIComponent(`Campaign enquiry — ${company || name}`)}&body=${encodeURIComponent(body)}`;
                    setFormSubmitted(true);
                  }} className="space-y-4">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] font-display">Drop us a line</h3>{/* v332: fields 16px on phones (no iPhone zoom) */}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1 font-medium">Your Name</label>
                        <input type="text" required className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-4 h-11 text-base sm:text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#7C5CFF] transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1 font-medium">Your Email</label>
                        <input type="email" required className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-4 h-11 text-base sm:text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#7C5CFF] transition-all" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1 font-medium">Company / Brand Name</label>
                        <input type="text" required className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-4 h-11 text-base sm:text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#7C5CFF] transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1 font-medium">Campaign Budget (INR)</label>
                        <select className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-4 h-11 text-base sm:text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#7C5CFF] transition-all">
                          {/* v332: the email said "Budget: 2" (a code) — options now carry their own text */}
                          <option value="Under ₹50,000">Under ₹50,000</option>
                          <option value="₹50,000 – ₹2,00,000">₹50,000 – ₹2,00,000</option>
                          <option value="₹2,00,000 – ₹10,00,000">₹2,00,000 – ₹10,00,000</option>
                          <option value="Over ₹10,00,000">Over ₹10,00,000</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1 font-medium">Campaign Goals / Details</label>
                      <textarea required rows={4} placeholder="Describe what you plan to promote, required city-targets, or platform expectations..." className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl p-4 text-base sm:text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#7C5CFF] transition-all resize-none"></textarea>
                    </div>

                    <button type="submit" className="w-full h-11 rounded-xl bg-[var(--violet)] text-white font-bold text-xs hover:bg-[var(--violet)]/90 shadow-[0_4px_15px_rgba(124,58,237,0.2)] transition-all flex items-center justify-center gap-2">
                      Send Secure Inquiry <Send size={12}/>
                    </button>
                  </form>
                )}
              </div>

              {/* Info Col */}
              <div className="lg:col-span-5 space-y-6">
                <div className="p-6 rounded-2xl bg-foreground/[0.02] border border-foreground/5 flex gap-4">
                  <span className="w-10 h-10 rounded-xl bg-[var(--violet)]/10 flex items-center justify-center text-[var(--violet)] shrink-0">📍</span>
                  <div>
                    {/* v332: a made-up Mumbai office address was shown; Ybex Media is in Jaipur (legalContent.js) */}
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">Where we are</h4>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Ybex Media<br />
                      Jaipur, Rajasthan, India
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-foreground/[0.02] border border-foreground/5 flex gap-4">
                  <span className="w-10 h-10 rounded-xl bg-[var(--violet)]/10 flex items-center justify-center text-[var(--violet)] shrink-0">✉</span>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">Electronic Support</h4>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      General Queries: <a href="mailto:support@ybexmedia.in" className="text-[var(--text-primary)] hover:underline">support@ybexmedia.in</a><br />
                      Media & Secure payment hold disputes: <a href="mailto:support@ybexmedia.in" className="text-[var(--text-primary)] hover:underline">support@ybexmedia.in</a>
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-foreground/[0.02] border border-foreground/5 flex gap-4">
                  <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">📞</span>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">Direct Communication</h4>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      WhatsApp Support: <a href="https://wa.me/918764004299" className="text-[var(--text-primary)] font-mono font-medium hover:underline">+91 87640 04299</a><br />{/* Session 58: was a placeholder "XXXXX" number */}
                      Monday to Saturday · 10 AM to 7 PM IST
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        };

      /* ==================== INDIVIDUAL SERVICES ==================== */
      default:
        // Session 58 (bug hunt): any /info/<typo> showed a made-up "<Slug> by Ybex" services page promising features that
        // don't exist. Unknown pages are now a plain "not found".
        return {
          title: "Page not found",
          subtitle: "This page doesn't exist or has moved.",
          badge: "YBEX",
          body: (
            <div className="space-y-4">
              <a href="/" className="inline-flex px-5 py-3 rounded-xl bg-[var(--violet)] text-white text-sm font-bold">Go to the home page</a>
            </div>
          )
        };
      // eslint-disable-next-line no-unreachable
      case "__unused_service_page__":
        // Format slug string (such as "influencer-marketing" -> "Influencer Marketing")
        const serviceName = (slug || "")
          .split("-")
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        return {
          title: `${serviceName} by Ybex`,
          subtitle: `Professional, performance-focused solutions to deploy, manage, and scale your ${serviceName} goals globally.`,
          badge: "YBEX BRAND SERVICES",
          heroImage: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80",
          body: (
            <div className="space-y-8">
              <p className="text-[var(--text-secondary)] text-base leading-relaxed">
                Ybex Media provides industry-grade infrastructure to automate planning, tracking, and execution for <strong className="text-[var(--text-primary)]">{serviceName}</strong> campaigns. We secure rate agreements, monitor engagement analytics, and release payments strictly after verified proof of delivery.
              </p>

              <div className="p-6 md:p-8 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-default)] mt-10">
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">What's Included in This Service</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    "Verified Data Integration: Access raw creator reach logs directly from Meta & Google integration nodes.",
                    "Contractual Protection: Automated campaign agreements detailing exact deliverables and target criteria.",
                    "Secure Payment Hold Security Mechanism: Keep budgets guarded safely in secure payment hold boxes until campaigns close.",
                    "Leadership Board Visibility: Automated inclusion of creators in our ROI scoring and leaderboard ranking.",
                    "24-Hour Moderation: Support staff available directly inside your collaborative workspace chats.",
                    "Detailed ROI Dashboard: Track total impressions, Cost Per Click (CPC), and true consumer conversions."
                  ].map((inc, i) => (
                    <div key={i} className="flex gap-2.5 items-start text-xs text-[var(--text-secondary)] leading-relaxed">
                      <span className="text-[var(--violet)] font-bold mt-0.5 shrink-0">✓</span>
                      <span>{inc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Call to Action inside current page */}
              <div className="p-8 rounded-3xl bg-gradient-to-br from-[#7C5CFF]/15 to-transparent border border-[var(--violet)]/20 text-center relative overflow-hidden mt-12">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[var(--violet)]/15 blur-3xl rounded-full pointer-events-none"></div>
                <span className="inline-flex gap-1.5 items-center text-[10px] uppercase bg-[var(--violet)]/20 text-[#B19CFF] px-2.5 py-1 rounded-full font-black tracking-widest mb-4">Ybex Direct Onboarding</span>
                <h3 className="font-display text-2xl md:text-3xl font-bold mb-3">Launch Your Next Campaign Instantly</h3>
                <p className="text-xs text-[var(--text-primary)]/60 max-w-lg mx-auto mb-6">Create your brand account, search verified creator rosters, review transparent rate cards, and unlock maximum engagement now.</p>
                
                <div className="flex flex-wrap gap-3 justify-center">
                  <Link to="/signup?role=brand" className="px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-semibold rounded-xl text-xs transform hover:scale-105 transition-all outline-none">
                    Start Campaign Brief
                  </Link>
                  <Link to="/creators" className="px-5 py-2.5 bg-foreground/5 hover:bg-foreground/10 border border-[var(--border-default)] text-[var(--text-primary)] rounded-xl text-xs font-semibold hover:scale-105 transition-all">
                    Explore Roster Rates
                  </Link>
                </div>
              </div>
            </div>
          )
        };
    }
  };

  const content = getContent();

  // Session 43 (Ravi): inside the phone app a policy opened the landing-page layout (breadcrumbs,
  // glow, marketing footer) under the app's own bars. On phones it is now a plain reading page:
  // a top bar with back + title, the text, nothing else (the bottom bar is hidden here too).
  if (isPhone) {
    return (
      <div className="min-h-screen bg-white text-[#1F1F29]" data-testid="info-reading-page">
        <div className="sticky top-0 z-20 bg-white border-b border-[#E5E5EA] h-14 px-2 flex items-center gap-1">
          <button
            type="button"
            aria-label="Back"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            className="w-10 h-10 rounded-full flex items-center justify-center active:bg-[#F2F2F7]"
          >
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div className="flex-1 min-w-0 text-[16px] font-bold truncate">{content.title}</div>
        </div>
        <div className="px-5 pt-5 pb-12 max-w-2xl mx-auto">
          {content.badge && <div className="text-[11px] font-bold tracking-[1px] text-[#7C3AED] uppercase">{content.badge}</div>}
          <h1 className="mt-1 text-[24px] leading-[1.2] font-bold tracking-tight text-[#0A0A0A]">{content.title}</h1>
          {content.subtitle && <p className="mt-2 text-[14.5px] leading-[1.55] text-[#6B7280]">{content.subtitle}</p>}
          <div className="mt-6 text-[14.5px] leading-[1.65] [overflow-wrap:anywhere]">{content.body}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-[var(--text-primary)] min-h-screen relative overflow-hidden bg-[var(--bg-base)] pb-24 font-sans leading-relaxed">
      {/* Background Gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[var(--violet)]/10 blur-[130px]"></div>
        <div className="absolute top-80 left-1/4 w-[300px] h-[300px] rounded-full bg-[var(--violet)]/5 blur-[100px]"></div>
      </div>

      <div className="relative max-w-4xl mx-auto px-6 pt-12 md:pt-16">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] mb-6 font-medium">
          <Link to="/" className="hover:text-[var(--text-primary)] transition-colors">Home</Link>
          <ChevronRight size={12} />
          <span className="text-[var(--text-primary)]/80">{content.title}</span>
        </div>

        {/* Dynamic Badge */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-block"
        >
          <span className="inline-flex gap-1.5 items-center text-[10px] uppercase tracking-widest font-black bg-[var(--violet)]/15 border border-[var(--violet)]/20 text-[#B19CFF] px-3 py-1 rounded-full mb-4">
             {content.badge}
          </span>
        </motion.div>

        {/* Heading */}
        <motion.h1 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text-primary)] mb-4 leading-tight"
        >
          {content.title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-base sm:text-lg text-[var(--text-primary)]/60 mb-12 font-medium leading-relaxed max-w-2xl"
        >
          {content.subtitle}
        </motion.p>

        {/* Optional Hero Image Banner */}
        {content.heroImage && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full h-64 sm:h-80 md:h-96 rounded-3xl overflow-hidden border border-[var(--border-default)] mb-12"
          >
            <img src={content.heroImage} alt="" className="w-full h-full object-cover" />
          </motion.div>
        )}

        {/* Body Content */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="relative z-10"
        >
          {content.body}
        </motion.div>
      </div>

      {/* Embedded Simple Footer for marketing secondary pages */}
      <div className="max-w-4xl mx-auto px-6 mt-24 border-t border-foreground/5 pt-8 text-[10px] tracking-wider text-[var(--text-primary)]/30 font-medium flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>© 2026 Ybex Media. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link to="/" className="hover:text-[var(--text-primary)] transition-all">Back to Home</Link>
          <span>·</span>
          <a href="https://ybexmedia.in" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-primary)] font-bold text-[var(--violet)]">YBEXMEDIA.IN</a>{/* v332: label said .COM, link goes to .in */}
        </div>
      </div>
    </div>
  );
}
