import { ignored } from "../../utils/ignored";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import AppleSignInButton, { isAppleMobileDevice } from "../../components/auth/AppleSignInButton"; // v334: App Store 4.8
import MobileWelcome from "../../components/Onboarding/mobile/MobileWelcome";

import { api } from "../../lib/api";
import { postLoginPath } from "./Login";
import { safeStorage } from "../../utils/storage";
import { Eye, EyeOff } from "lucide-react";
import { COUNTRY_CODES } from "../../lib/constants";



// USP data for sliding/fade effect
const USPS = [
  {
    title: "Start Collaborating",
    coloredTitle: "Direct & Free",
    desc: "Join India's most innovative brand and creator ecosystem with dynamic, hidden optimization margins. Protect your true rates.",
    stats: [
      { num: "100%", text: "Transparent Deals" },
      { num: "Instant", text: "Onboarding" },
      { num: "Secure", text: "Secure payment hold release" }
    ]
  },
  {
    title: "Deliver Instant Videos",
    coloredTitle: "In Under 24 Hours",
    desc: "Got rapid content requests? Sign up, claim high-priority orders, record your UGC videos, and get paid instantly within the chat workspace.",
    stats: [
      { num: "24h", text: "Standard" },
      { num: "15h", text: "In-house SLA" },
      { num: "Top", text: "Revenue Split" }
    ]
  },
  {
    title: "Secure Privacy Shield",
    coloredTitle: "No Off-Platform Leak",
    desc: "We guard personal contact data, filter out external details dynamically, negotiate directly, and secure payments so you never lose control.",
    stats: [
      { num: "100%", text: "Privacy Protected" },
      { num: "Zero", text: "Direct fee" },
      { num: "Instant", text: "Live Support" }
    ]
  }
];

export default function Signup() {
  const [params] = useSearchParams();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  // v346: /signup?role=brand preselects Brand — any case ("Brand"), and also when the link changes while
  // this screen is already open (the first value used to stick).
  const roleParam = String(params.get("role") || "").trim().toLowerCase();
  const [role, setRole] = useState(roleParam === "brand" ? "brand" : "creator"); // matching role choice
  useEffect(() => { if (roleParam === "brand" || roleParam === "creator") setRole(roleParam); }, [roleParam]);
  const refCode = params.get("ref") || params.get("referral_code") || "";
  const { user, signup, refreshUser, setUser, loading: authLoading } = useAuth();


  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [showMobileWelcome, setShowMobileWelcome] = useState(true);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // Sliding slide state
  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % USPS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      // v332: same landing as Login (admins went to /onboarding; Back bounced to signup)
      navigate(postLoginPath(user), { replace: true });
    }
  }, [user, authLoading, navigate]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreeTerms) {
       toast.error("Please confirm you are 14 or older and agree to the Terms and Privacy Policy");
       return;
    }

    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    if (!fullName) {
      toast.error(role === "brand" ? "Please enter company or brand name" : "Please enter your name");
      return;
    }

    // Validate Mobile Number
    let cleanPhone = phone.replace(/\D/g, "");
    if (countryCode === "+91") {
      if (cleanPhone.startsWith("91") && cleanPhone.length === 12) cleanPhone = cleanPhone.slice(2);
      else if (cleanPhone.startsWith("0") && cleanPhone.length === 11) cleanPhone = cleanPhone.slice(1);
      cleanPhone = cleanPhone.slice(0, 10);

      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        toast.error("Please enter a valid 10-digit mobile number (starting with 6, 7, 8, or 9)");
        return;
      }
    } else {
      if (cleanPhone.length < 6 || cleanPhone.length > 15) {
        toast.error("Please enter a valid mobile number");
        return;
      }
    }

    setLoading(true);
    try {
      const formattedPhone = `${countryCode}${cleanPhone}`;
      const res = await signup(fullName, email, password, role, formattedPhone, refCode);

      if (res && res.requiresVerification) {
        toast.success("Account created! Please verify your email.");
        const otpParam = res.otp ? `&otp=${encodeURIComponent(res.otp)}` : "";
        navigate(`/verify-email?email=${encodeURIComponent(email)}&role=${role}${otpParam}`);
      } else {
        toast.success("Account created!");
        navigate(`/onboarding?role=${role}`);
      }
    } catch (err) {
      // AuthContext.signup already shows the server's message (detail). Showing err.message here
      // added a second, generic "Request failed with status code 500" toast (session 33).
      ignored("Signup:submit", err);
    } finally { setLoading(false); }
  };

  
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const res = await api.get("/auth/google/url", { bypassCache: true });
      if (res.data && res.data.url) {
        const width = 500;
        const height = 600;
        const left = (window.innerWidth / 2) - (width / 2);
        const top = (window.innerHeight / 2) - (height / 2);
        const popup = window.open(res.data.url, "GoogleAuth", `width=${width},height=${height},top=${top},left=${left}`);

        if (!popup) {
          // Session 58 (Q17): popup blocked — continue with Google in this tab; /app/oauth finishes the sign-in.
          try { window.sessionStorage.setItem("ybex_oauth_role", role || ""); window.sessionStorage.setItem("ybex_oauth_next", ""); } catch { /* private mode */ }
          window.location.assign(res.data.url);
          return;
        }
        // Session 58 (Q17): if Google cuts the popup's link back to this tab, the popup finishes the sign-in
        // itself (/app/oauth) and saves the token — this tab picks that up and continues.
        try { window.sessionStorage.setItem("ybex_oauth_role", role || ""); } catch { /* private mode */ }
        const onStorage = async (e) => {
          if (e.key !== "ybex_user" || !e.newValue) return; // written after the role is saved
          window.removeEventListener("storage", onStorage);
          window.location.replace("/dashboard");
        };
        window.addEventListener("storage", onStorage);

        const handleMessage = async (event) => {
          if (event.origin !== window.location.origin) return; // Session 53: ignore messages from other sites
          if (event.data?.type === 'OAUTH_SUCCESS') {
            window.removeEventListener('message', handleMessage);
            const { token, supabaseSession } = event.data;
            safeStorage.setItem("ybex_token", token);
            try {
               const { data } = await api.get("auth/me", { bypassCache: true });
               let loggedUser = data.user || data;
               // A new Google account has no role yet. Save the Creator/Brand tab the person
               // picked, otherwise onboarding shows the creator form and brand actions fail.
               if (!loggedUser.role && (role === "creator" || role === "brand")) {
                 try {
                   await api.post("auth/role", { role });
                   const again = await api.get("auth/me", { bypassCache: true });
                   loggedUser = again.data.user || again.data;
                 } catch (roleErr) {
                   console.error("Saving the chosen role failed:", roleErr);
                 }
               }
               safeStorage.setItem("ybex_user", JSON.stringify(loggedUser));
               setUser(loggedUser);
               // v291: an e-mail that already has an account is a sign-in, whatever tab was tapped.
               const existingRole = String(loggedUser.role || "").toLowerCase();
               if (loggedUser.onboarded || loggedUser.onboarding_completed || loggedUser.onboarding_complete) {
                 toast.success("This email already has an account — signed you in.");
               } else {
                 toast.success("Account created successfully!");
               }
               if (existingRole && (role === "creator" || role === "brand") && existingRole !== role) {
                 toast.info(`This email is a ${existingRole} account, so we opened it as ${existingRole}.`);
               }
               navigate(postLoginPath(loggedUser));
            } catch (err) {
               toast.error("Couldn't load your account. Please try again."); // v332: calm copy
               setLoading(false);
            }
          } else if (event.data?.type === 'OAUTH_FAILURE') {
            window.removeEventListener('message', handleMessage);
            toast.error(event.data?.message || "Google sign-up didn't finish. Please try again."); // v332
            setLoading(false);
          }
        };
        window.addEventListener('message', handleMessage);

        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            setTimeout(() => window.removeEventListener("storage", onStorage), 5000);
            setLoading(false);
          }
        }, 1000);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't open Google sign-up. Please try again."); // v332
      setLoading(false);
    }
  };


  const activeUSP = USPS[slideIdx];

  if (isMobile && showMobileWelcome) {
    return (
      <MobileWelcome
        role={role}
        setRole={setRole}
        onEmailSignup={() => setShowMobileWelcome(false)}
        onGoogleLogin={handleGoogleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[var(--bg-base)] text-[var(--text-primary)]" data-testid="signup-page">
      {/* LEFT PANEL — Smooth horizontal gradient blending into deep black, wider span — Hidden on mobile / tablet for clean auth flow */}
      <section className="hidden lg:flex lg:col-span-7 bg-gradient-to-b lg:bg-gradient-to-r from-card via-background to-background p-10 md:p-14 flex-col justify-between relative overflow-hidden min-h-[50vh] lg:min-h-screen">
        {/* Subtle grid background accent */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        {/* Ambient colored blobs to smooth out different container vibes */}
        <div className="absolute bottom-1/4 -left-10 w-[450px] h-[450px] bg-[var(--violet)]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -top-10 right-10 w-[350px] h-[350px] bg-[var(--violet)]/4 rounded-full blur-[100px] pointer-events-none" />

        {/* USP container */}
        <div className="my-auto py-12 z-10 max-w-xl relative min-h-[360px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideIdx}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full"
            >
              <h2 className="font-display text-4xl sm:text-5xl lg:text-5xl xl:text-6xl text-[var(--text-primary)] leading-tight font-bold tracking-tight">
                {activeUSP.title} <br />
                <span className="text-[var(--violet)] font-black">{activeUSP.coloredTitle}</span>
              </h2>
              <p className="text-[var(--text-primary)] mt-6 text-base sm:text-lg lg:text-xl leading-relaxed font-medium">
                {activeUSP.desc}
              </p>

              {/* Stats list */}
              <div className="mt-8 grid grid-cols-3 gap-6">
                {activeUSP.stats?.map((stat, sId) => (
                  <div key={sId}>
                    <div className="font-display font-black text-3xl sm:text-4xl lg:text-4xl xl:text-5xl text-[var(--violet)]" data-testid={`stat-num-${sId}`}>
                      {stat.num}
                    </div>
                    <div className="text-xs sm:text-sm text-[var(--text-primary)]/60 font-bold uppercase tracking-wider mt-2" data-testid={`stat-lbl-${sId}`}>
                      {stat.text}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom copyright */}
        <div className="text-xs text-[var(--text-primary)]/30 font-semibold z-10 uppercase tracking-widest select-none pt-4 border-t border-foreground/5">
          {/* v332: © sign was missing */}
          © 2026 Ybex Media. All rights reserved.

          

        </div>
      </section>

      {/* RIGHT PANEL — Clean, spacious signup screen matching mockup spacing — Compact & centered for mobile */}
      <section className="lg:col-span-5 flex flex-col justify-center items-center px-6 sm:px-12 md:px-16 lg:px-24 bg-[var(--bg-base)] min-h-screen overflow-y-auto pt-24 pb-12">
        <div className="w-full max-w-sm sm:max-w-md mx-auto animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="mb-4 text-center sm:text-left">
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-[var(--text-primary)] font-bold tracking-tight">Create your account</h1>
            <p className="text-[var(--text-primary)]/60 mt-1.5 sm:mt-2 text-xs sm:text-sm font-medium">Start collaborating with India&apos;s premium brand network.</p>
          </div>

          {/* Selector Tabs matching login role choices */}
          <div className="p-1 bg-foreground/5 border border-[var(--border-default)] rounded-xl grid grid-cols-2 gap-1 mb-5 sm:mb-6">
            <button
              onClick={() => setRole("creator")}
              type="button"
              className={`py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${role === "creator" ? "bg-[var(--violet)] text-white shadow-md shadow-[var(--violet)]/20" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              👤 Creator
            </button>
            <button
              onClick={() => setRole("brand")}
              type="button"
              className={`py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${role === "brand" ? "bg-[var(--violet)] text-white shadow-md shadow-[var(--violet)]/20" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              🏢 Brand / Agency
            </button>
          </div>




          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-[var(--text-primary)]/60 block mb-1 sm:mb-1.5">
                  {role === "brand" ? "Brand / Full Name" : "First Name"}
                </label>
                <input
                  data-testid="signup-first-name"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--violet)]/20 focus:bg-background transition-all"
                  placeholder={role === "brand" ? "e.g. BoAt or John" : "John"}
                />
              </div>
              <div>
                <label className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-[var(--text-primary)]/60 block mb-1 sm:mb-1.5">
                  {role === "brand" ? "Tag / Last Name" : "Last Name"}
                </label>
                <input
                  data-testid="signup-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--violet)]/20 focus:bg-background transition-all"
                  placeholder="Doe"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-[var(--text-primary)]/60 block mb-1 sm:mb-1.5">Email</label>
              <input
                data-testid="signup-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--violet)]/20 focus:bg-background transition-all"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-[var(--text-primary)]/60 block mb-1 sm:mb-1.5">Mobile Number</label>
              <div className="flex items-center gap-2">
                <select
                  data-testid="signup-country-code"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="bg-foreground/10 border border-[var(--border-default)] px-2.5 py-2 sm:py-2.5 rounded-xl text-base sm:text-sm font-extrabold text-[var(--text-primary)] shrink-0 outline-none focus:border-[var(--violet)] cursor-pointer"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code + c.country} value={c.code} className="bg-[var(--bg-elevated)] text-[var(--text-primary)] font-sans">
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <input
                  data-testid="signup-phone"
                  type="tel"
                  required
                  maxLength={countryCode === "+91" ? 10 : 15}
                  value={phone}
                  onChange={(e) => {
                    let digits = e.target.value.replace(/\D/g, "");
                    if (countryCode === "+91") {
                      if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
                      else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
                      digits = digits.slice(0, 10);
                    } else {
                      digits = digits.slice(0, 15);
                    }
                    setPhone(digits);
                  }}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--violet)]/20 focus:bg-background transition-all font-mono tracking-wider font-bold"
                  placeholder={countryCode === "+91" ? "9876543210" : "Mobile number"}
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-[var(--text-primary)]/60 block mb-1 sm:mb-1.5">Password</label>
              <div className="relative">
                <input
                  data-testid="signup-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl pl-3 pr-10 py-2 sm:pl-4 sm:pr-12 sm:py-2.5 text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--violet)]/20 focus:bg-background transition-all"
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors focus:outline-none flex items-center justify-center cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">Must be at least 8 characters</p>
            </div>

            <label htmlFor="terms" className="flex items-center gap-2.5 mt-3 cursor-pointer select-none group">
              <div
                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all duration-150 ${
                  agreeTerms
                    ? "bg-[var(--violet)] border-[var(--violet)] text-white shadow-xs"
                    : "bg-foreground/5 border-foreground/20 group-hover:border-foreground/40"
                }`}
              >
                {agreeTerms && (
                  <svg className="w-2.5 h-2.5 text-white stroke-[3.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <input
                type="checkbox"
                id="terms"
                required
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="sr-only"
              />
              <span className="text-xs text-[var(--text-primary)]/70 leading-snug">
                I am 14 or older and agree to the <a href="/info/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[var(--violet)] font-semibold hover:underline">Terms</a> and <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[var(--violet)] font-semibold hover:underline">Privacy Policy</a>, including emails about new campaigns, my account and Ybex updates.
              </span>
            </label>
            <button
              type="submit"
              data-testid="signup-submit"
              disabled={loading}
              className="w-full mt-4 py-2.5 sm:py-3 bg-[var(--violet)] text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-[#6849E0] shadow-[0_4px_16px_rgba(124,92,255,0.3)] hover:shadow-[0_4px_20px_rgba(124,92,255,0.45)] transform active:scale-[0.99] transition-all flex items-center justify-center gap-2 duration-150 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
            >
              {/* v330: phone inputs/select now 16px text (were 12px), eye toggle 40px, busy button dimmed */}
              {loading ? "Creating..." : "Create Account →"}
            </button>
          </form>
          <div className="flex items-center gap-4 my-3">
            <div className="flex-1 h-px bg-foreground/10"></div>
            <span className="text-[11px] sm:text-xs text-[var(--text-tertiary)] font-black tracking-widest uppercase">OR CONTINUE WITH</span>
            <div className="flex-1 h-px bg-foreground/10"></div>
          </div>
          <div className="mt-3 mb-3">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-2.5 sm:py-3 bg-white text-[var(--text-primary)] border border-[var(--border-strong)] font-semibold text-xs sm:text-sm rounded-xl hover:bg-foreground/5 shadow-sm transform active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]" /* v332: dimmed while busy, 44px tap */
            >
              {loading ? (
                 <div className="w-5 h-5 border-2 border-[var(--violet)] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Continue with Google
            </button>
            {/* v334 (App Store 4.8): Sign in with Apple next to Google on iPhone / iPad, same size */}
            {isAppleMobileDevice() && (
              <div className="mt-2.5">
                <AppleSignInButton role={role} disabled={loading} className="py-2.5 sm:py-3 text-xs sm:text-sm rounded-xl min-h-[44px]" />
              </div>
            )}
            <p className="mt-2 text-[11px] leading-snug text-center text-[var(--text-tertiary)]" data-testid="google-consent-line">
              By continuing, you confirm you are 14 or older and agree to the <a href="/info/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a> and <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>.
            </p>
          </div>


          <p className="mt-4 text-center text-xs sm:text-sm text-[var(--text-primary)]/60 font-semibold">
            Already have an account?{" "}
            {/* v332: link stopped pulsing (looked like a loading glitch) and keeps the chosen role */}
            <Link to={`/login?role=${role}`} className="text-[var(--violet)] font-black hover:underline">
              Log in
            </Link>
          </p>
          
          
        </div>
      </section>
    </div>
  );
}
