import useDemoLogin from "../../lib/useDemoLogin";
import React, { useState, useEffect } from "react";
import { isFinishLater } from "../../lib/onboardingLater";

// Session 24: admins go straight to the admin panel. They used to be sent to /onboarding (an admin
// account is never "onboarded"), which looked like "admin login doesn't work".
export function postLoginPath(u) {
  const role = String(u?.role || "").toLowerCase();
  const team = String(u?.team_role || "").toLowerCase();
  if (role === "admin" || team === "admin" || team === "sub_admin" || team === "owner") return "/admin";
  if (u?.onboarded || u?.onboarding_completed || u?.onboarding_complete) return "/dashboard";
  // Session 58: a creator who chose "Finish later" uses the app (they were sent to onboarding on every launch).
  if ((role || "creator") === "creator" && isFinishLater(u?.user_id || u?.id)) return "/dashboard";
  return "/onboarding";
}

/** Session 58: where to go after login — the page they were sent away from (in-app paths only), else the default. */
export function afterLoginPath(u, nextParam) {
  const def = postLoginPath(u);
  const next = String(nextParam || "");
  if (def !== "/dashboard" || !next.startsWith("/") || next.startsWith("//") || /^\/(login|signup|app|onboarding)\b/.test(next)) return def;
  return next;
}
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import AppleSignInButton, { isAppleMobileDevice } from "../../components/auth/AppleSignInButton"; // v334: App Store 4.8
import { api } from "../../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { safeStorage } from "../../utils/storage";
import { rememberMediaKey } from "../../lib/mediaKey";
import { Eye, EyeOff } from "lucide-react";
import useBusy from "../../lib/useBusy"; // v348: OTP login buttons
import ButtonSpinner from "../../components/common/ButtonSpinner"; // v348
import { OfflineSignInNotice } from "../../components/common/OfflineState"; // v334: offline → "Connect to the internet to sign in"

// USP data for sliding/fade effect
const USPS = [
  {
    title: "Where Creators",
    coloredTitle: "Get Chosen",
    desc: "Join India's premium influencer marketing platform. Connect with top brands and grow your career.",
    stats: [
      { num: "786+", text: "Creators" },
      { num: "87+", text: "Brands" },
      { num: "₹27 Lac+", text: "Paid Out" }
    ]
  },
  {
    title: "Instant UGC Video",
    coloredTitle: "Within 24 Hours",
    desc: "Seamless video delivery on-demand. Post requirements and get high-quality original videos delivered instantly.",
    stats: [
      { num: "24h", text: "Turnaround" },
      { num: "100%", text: "In-house backup" },
      { num: "Zero", text: "Hassle" }
    ]
  },
  {
    title: "Complete Deal Log",
    coloredTitle: "No Hidden Fees",
    desc: "Enjoy transparent price negotiations, live contract statuses, secure chats, and end-to-end milestone releases.",
    stats: [
      { num: "0%", text: "Upfront Fee" },
      { num: "Secure", text: "Payments" },
      { num: "Instant", text: "Contracts" }
    ]
  }
];

export default function Login() {
  const demoOn = useDemoLogin();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bypassing, setBypassing] = useState(false);
  const [role, setRole] = useState(params.get("role") || "creator"); // tab selection: 'creator' or 'brand'
  const { user, login, refreshUser, setUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // v348 (Ravi: an account made on the phone with an email code has no password, and desktop had no OTP
  // option). "password" | "otp". OTP uses the SAME routes as the app (src/pages/app/AppContinue.jsx):
  // POST /auth/login-otp sends the code, POST /auth/login { email, otp } checks it (all account checks run there).
  const [mode, setMode] = useState("password");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [resendLeft, setResendLeft] = useState(0);
  const [offerOtp, setOfferOtp] = useState(""); // text shown with the "Login with OTP instead" button after a failed password
  const { isBusy, anyBusy, run } = useBusy();
  useEffect(() => {
    if (resendLeft <= 0) return undefined;
    const t = setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendLeft]);
  const cleanEmail = String(email || "").trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  // Creator / Brand tab → app_role, so (like the app) a code never opens an admin account from this page.
  const otpRole = role === "brand" ? "brand" : "creator";

  const sendLoginCode = () => run("otp-send", async () => {
    setOtpError("");
    if (!emailOk) { setOtpError("Please enter a valid email address."); return; }
    try {
      const { data } = await api.post("auth/login-otp", { email: cleanEmail, app_role: otpRole });
      setOtpCode(data?.otp || ""); // test server only: the server returns the code
      setOtpSent(true);
      setResendLeft(30);
      toast.success(`We sent a 6-digit code to ${cleanEmail}`);
    } catch (err) {
      setOtpError(err?.response?.data?.detail || (err?.response ? "Could not send the code. Please try again." : "Couldn't reach Ybex. Check your internet and try again."));
    }
  });

  const openOtp = (send = false) => {
    setMode("otp");
    setOfferOtp("");
    setOtpError("");
    setOtpCode("");
    setOtpSent(false);
    if (send && emailOk) sendLoginCode();
  };

  const backToPassword = () => {
    setMode("password");
    setOtpSent(false);
    setOtpCode("");
    setOtpError("");
  };

  const verifyLoginCode = () => run("otp-verify", async () => {
    setOtpError("");
    if (otpCode.length !== 6) { setOtpError("Please enter the 6-digit code."); return; }
    try {
      const { data } = await api.post("auth/login", { email: cleanEmail, otp: otpCode, app_role: otpRole });
      if (!data?.token || !data?.user) { setOtpError("Could not log in. Please try again."); return; }
      safeStorage.setItem("ybex_token", data.token);
      safeStorage.setItem("ybex_user", JSON.stringify(data.user));
      try { window.localStorage.setItem("ybex_last_email", cleanEmail); } catch { /* private mode */ }
      try { rememberMediaKey(data); } catch { /* older answer without media key */ }
      setUser(data.user);
      Promise.resolve().then(() => refreshUser?.()).catch(() => {});
      toast.success("Welcome back!");
      navigate(afterLoginPath(data.user, new URLSearchParams(window.location.search).get("next")), { replace: true });
    } catch (err) {
      const d = err?.response?.data || {};
      if (["ACCOUNT_DELETED", "ACCOUNT_BANNED", "ACCOUNT_SUSPENDED"].includes(d.code)) {
        navigate("/account-status", { state: { status: d.code, message: d.detail || d.error, user_id: d.user_id, role: d.role } });
        return;
      }
      setOtpCode("");
      setOtpError(d.detail || (err?.response ? "That code did not work. Please try again." : "Couldn't reach Ybex. Check your internet and try again."));
    }
  });

  const handleDirectBypass = async (targetRole) => {
    const chosenRole = targetRole || (role === "brand" ? "brand" : "creator");
    const isAdmin = chosenRole === "admin";
    const isBrand = chosenRole === "brand";
    const token = isAdmin ? "dev_bypass_admin" : isBrand ? "dev_bypass_brand" : "dev_bypass";
    const targetPath = isAdmin ? "/admin" : "/dashboard";
    const roleLabel = isAdmin ? "Super Admin" : isBrand ? "Brand" : "Creator";

    setBypassing(true);
    const toastId = toast.loading(`Bypassing login as ${roleLabel}...`);
    try {
      safeStorage.setItem("ybex_token", token);
      const { data } = await api.get("auth/me", { bypassCache: true });
      if (data && (data.user || data.user_id)) {
        const loggedUser = data.user || data;
        rememberMediaKey(data);
        safeStorage.setItem("ybex_user", JSON.stringify(loggedUser));
        setUser(loggedUser);
        toast.success(`Logged in as ${roleLabel}!`, { id: toastId });
        navigate(targetPath);
      } else {
        throw new Error("Could not fetch user profile");
      }
    } catch (err) {
      console.error("Bypass failed:", err);
      safeStorage.removeItem("ybex_token");
      toast.error("Bypass login failed. Please check server status.", { id: toastId });
    } finally {
      setBypassing(false);
    }
  };

  // Sliding slide state
  const [slideIdx, setSlideIdx] = useState(0);

  // Auto-redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      // Session 58: replace (Back used to bounce between login and dashboard), and go to the page asked for.
      navigate(afterLoginPath(user, new URLSearchParams(window.location.search).get("next")), { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % USPS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === "otp") { if (otpSent) verifyLoginCode(); else sendLoginCode(); return; } // v348
    setOfferOtp(""); // v348
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result && result.requiresVerification) {
        toast.error("Please verify your email to log in.");
        navigate(`/verify-email?email=${encodeURIComponent(email)}&role=${role}`);
        return;
      }
      const user = result;
      const existingRole = String(user?.role || "").toLowerCase();
               toast.success("Welcome back!");
               if (existingRole && (role === "creator" || role === "brand") && existingRole !== role) {
                 toast.info(`This email is a ${existingRole} account, so we opened it as ${existingRole}.`);
               }
      navigate(afterLoginPath(user, new URLSearchParams(window.location.search).get("next")), { replace: true });
    } catch (err) {
      console.error("Login catch error:", err, err.response?.data);
      const data = err.response?.data || {};
      const errorCode = data.code;
      if (errorCode === "ACCOUNT_DELETED" || errorCode === "ACCOUNT_BANNED" || errorCode === "ACCOUNT_SUSPENDED") {
        navigate("/account-status", { 
          state: { 
            status: errorCode, 
            message: data.detail || data.error,
            user_id: data.user_id,
            role: data.role
          } 
        });
      } else if (errorCode === "EMAIL_NOT_VERIFIED") {
        // Session 58 (bug hunt): this page has no "Use OTP" option, so the old message pointed at a missing button.
        // Send the verification code and open the verify screen for this email.
        try { await api.post("auth/resend-verification-otp", { email: String(email || "").trim() }); } catch (e) { console.warn("[login] resend code:", e?.message); }
        toast.info("Please verify your email first — we've sent a code to your inbox.");
        navigate(`/verify-email?email=${encodeURIComponent(String(email || "").trim())}${role ? `&role=${encodeURIComponent(role)}` : ""}`);
      } else if (errorCode === "USER_NOT_FOUND") {
        toast.error("No account found with this email. Please check your email or click Sign up below.");
      } else if (errorCode === "INVALID_CREDENTIALS") {
        toast.error(data.detail || "Invalid email or password.");
        // v348: wrong password, or an account that never set one → offer the email code with this email filled in.
        setOfferOtp(data.reason === "NO_PASSWORD"
          ? "This account has no password yet. Log in with a code sent to your email, or with Google."
          : "Forgot your password? Log in with a code sent to your email instead.");
      } else {
        // v332: no raw tech text ("Network Error", "Request failed with status code 500")
        toast.error(data.detail || data.error || (err.response ? "Couldn't sign you in. Please try again." : "Couldn't reach Ybex. Check your internet and try again."));
      }
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
          try { window.sessionStorage.setItem("ybex_oauth_role", role || ""); window.sessionStorage.setItem("ybex_oauth_next", new URLSearchParams(window.location.search).get("next") || ""); } catch { /* private mode */ }
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
               toast.success("Welcome back!");
               navigate(afterLoginPath(loggedUser, new URLSearchParams(window.location.search).get("next")), { replace: true });
            } catch (err) {
               toast.error("Couldn't load your account. Please try again."); // v332: calm copy
               setLoading(false);
            }
          } else if (event.data?.type === 'OAUTH_FAILURE') {
            window.removeEventListener('message', handleMessage);
            toast.error(event.data?.message || "Google sign-in didn't finish. Please try again."); // v332
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
      toast.error(err.response?.data?.error || "Couldn't open Google sign-in. Please try again."); // v332
      setLoading(false);
    }
  };


  const activeUSP = USPS[slideIdx];

  return (
    <div className="min-h-screen min-h-[100dvh] grid grid-cols-1 lg:grid-cols-12 bg-[var(--bg-base)] text-[var(--text-primary)] relative" data-testid="login-page" style={{ background: "var(--bg-base, #F2F2F7)" }}>
      {/* Solid underlay fill ensuring no purple body background peeks at bottom of screen on iOS / Android */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "max(env(safe-area-inset-bottom, 0px), 60px)", background: "var(--bg-base, #F2F2F7)", zIndex: 0, pointerEvents: "none" }} />
      {/* LEFT PANEL — Smooth horizontal gradient blending into deep black, wider span — Hidden on mobile / tablet for clean auth flow */}
      <section className="hidden lg:flex lg:col-span-7 bg-gradient-to-b lg:bg-gradient-to-r from-card via-background to-background p-10 md:p-14 flex-col justify-between relative overflow-hidden min-h-[50vh] lg:min-h-screen">
        {/* Subtle grid background accent */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        {/* Ambient colored blobs to smooth out different container vibes */}
        <div className="absolute bottom-1/4 -left-10 w-[450px] h-[450px] bg-[var(--violet)]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -top-10 right-10 w-[350px] h-[350px] bg-[var(--violet)]/4 rounded-full blur-[100px] pointer-events-none" />

        {/* USP Slideshow container */}
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
              <div className="mt-8 grid grid-cols-3 gap-4 sm:gap-6 items-start">
                {activeUSP.stats?.map((stat, sId) => (
                  <div key={sId} className="flex flex-col">
                    <div className="font-display font-black text-2xl sm:text-3xl lg:text-3xl xl:text-4xl text-[var(--violet)] whitespace-nowrap tracking-tight" data-testid={`stat-num-${sId}`}>
                      {stat.num}
                    </div>
                    <div className="text-xs sm:text-sm text-[var(--text-primary)]/60 font-bold uppercase tracking-wider mt-2 whitespace-nowrap" data-testid={`stat-lbl-${sId}`}>
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

      {/* RIGHT PANEL — Clean, spacious login screen matching mockup form spacing — Compact & centered for mobile */}
      <section className="lg:col-span-5 flex flex-col justify-center items-center px-6 sm:px-12 md:px-16 lg:px-24 bg-[var(--bg-base)] min-h-screen min-h-[100dvh] overflow-y-auto pt-24 pb-16 relative z-1" style={{ background: "var(--bg-base, #F2F2F7)", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 48px)" }}>
        <div className="w-full max-w-sm sm:max-w-md mx-auto animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="mb-6 sm:mb-8 text-center sm:text-left">
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-[var(--text-primary)] font-bold tracking-tight">Welcome back</h1>
            <p className="text-[var(--text-primary)]/60 mt-1.5 sm:mt-2 text-xs sm:text-sm font-medium">Sign in to continue to your dashboard</p>
          </div>


          <OfflineSignInNotice className="mb-4" />{/* v334 */}
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-[var(--text-primary)]/60 block mb-1 sm:mb-1.5">Email</label>
              <input
                data-testid="login-email" /* v330: 16px text on phones (was 12px, hard to read) */
              autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (otpSent) { setOtpSent(false); setOtpCode(""); } setOfferOtp(""); }} /* v348: new email → new code */
                className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--violet)]/20 focus:bg-foreground/10 transition-all shadow-[inset_0_1px_2px_rgba(255,255,255,0.01)]"
                placeholder="you@email.com"
              />
            </div>
            {/* v348: email-code (OTP) login — same look as the password fields */}
            {mode === "otp" ? (
              <div data-testid="login-otp-panel">
                {otpSent ? (
                  <>
                    <div className="flex justify-between items-center mb-1 sm:mb-1.5">
                      <label htmlFor="login-otp-code" className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-[var(--text-primary)]/60">6-digit code</label>
                      <button
                        type="button"
                        onClick={sendLoginCode}
                        disabled={resendLeft > 0 || anyBusy}
                        className="text-[11px] sm:text-xs text-[var(--violet)] font-bold hover:underline py-1.5 -my-1.5 disabled:text-[var(--text-tertiary)] disabled:no-underline cursor-pointer disabled:cursor-default"
                        data-testid="login-otp-resend"
                      >
                        {isBusy("otp-send") ? "Sending..." : resendLeft > 0 ? `Resend in ${resendLeft}s` : "Resend code"}
                      </button>
                    </div>
                    <input
                      id="login-otp-code"
                      data-testid="login-otp-code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-base sm:text-sm tracking-[0.4em] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] placeholder:tracking-normal outline-none focus:border-[var(--violet)]/20 focus:bg-foreground/10 transition-all"
                      placeholder="Enter the code from your email"
                    />
                    <p className="mt-1.5 text-[11px] sm:text-xs text-[var(--text-primary)]/60 font-medium">Sent to {cleanEmail}. Check spam if you don't see it.</p>
                  </>
                ) : (
                  <p className="text-[11px] sm:text-xs text-[var(--text-primary)]/60 font-medium">We'll email you a 6-digit code — no password needed.</p>
                )}
                {otpError && <p className="mt-2 text-xs text-red-600 font-medium" role="alert" data-testid="login-otp-error">{otpError}</p>}
              </div>
            ) : (
            <div>
              <div className="flex justify-between items-center mb-1 sm:mb-1.5">
                <label className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-[var(--text-primary)]/60">Password</label>
                {/* v330: carry the typed email over (ForgotPassword reads ?email=); bigger tap area */}
                <Link to={email ? `/forgot-password?email=${encodeURIComponent(String(email).trim())}` : "/forgot-password"} className="text-[11px] sm:text-xs text-[var(--violet)] font-bold hover:underline py-1.5 -my-1.5">Forgot password?</Link>
              </div>
              <div className="relative">
                <input
                  data-testid="login-password"
                  autoComplete="current-password" /* v330 */
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-foreground/5 border border-[var(--border-default)] rounded-xl pl-3 pr-10 py-2.5 sm:pl-4 sm:pr-12 sm:py-3 text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--violet)]/20 focus:bg-foreground/10 transition-all shadow-[inset_0_1px_2px_rgba(255,255,255,0.01)]"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors focus:outline-none flex items-center justify-center cursor-pointer" /* v330: 40px tap target */
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            )}

            {/* v348: wrong password / no password yet → email code with the same email */}
            {mode === "password" && offerOtp && (
              <div className="rounded-xl border border-[var(--violet)]/20 bg-[var(--violet)]/5 px-3 py-2.5 sm:px-4 sm:py-3" data-testid="login-otp-offer">
                <p className="text-[11px] sm:text-xs text-[var(--text-primary)]/80 font-medium">{offerOtp}</p>
                <button
                  type="button"
                  onClick={() => openOtp(true)}
                  disabled={anyBusy || loading}
                  className="mt-2 text-xs sm:text-sm text-[var(--violet)] font-bold hover:underline cursor-pointer disabled:opacity-60"
                  data-testid="login-otp-offer-btn"
                >
                  Login with OTP instead →
                </button>
              </div>
            )}

            {mode === "otp" ? (
              <button
                type="submit"
                data-testid="login-otp-submit"
                disabled={anyBusy || (otpSent ? otpCode.length !== 6 : !emailOk)}
                className="w-full mt-2.5 sm:mt-3 py-2.5 sm:py-3 bg-[var(--violet)] text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-[#6849E0] shadow-[0_4px_16px_rgba(124,92,255,0.3)] hover:shadow-[0_4px_20px_rgba(124,92,255,0.45)] transform active:scale-[0.99] transition-all flex items-center justify-center gap-2 duration-150 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
              >
                {(otpSent ? isBusy("otp-verify") : isBusy("otp-send")) ? <ButtonSpinner /> : otpSent ? "Verify & Sign In →" : "Send login code →"}
              </button>
            ) : (
            <button
              type="submit"
              data-testid="login-submit"
              disabled={loading}
              className="w-full mt-2.5 sm:mt-3 py-2.5 sm:py-3 bg-[var(--violet)] text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-[#6849E0] shadow-[0_4px_16px_rgba(124,92,255,0.3)] hover:shadow-[0_4px_20px_rgba(124,92,255,0.45)] transform active:scale-[0.99] transition-all flex items-center justify-center gap-2 duration-150 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]" /* v330: visible busy state */
            >
              {loading ? "Signing In..." : "Sign In →"}
            </button>
            )}
            {/* v348: switch between password and email code */}
            <div className="text-center">
              {mode === "otp" ? (
                <button type="button" onClick={backToPassword} disabled={anyBusy} className="text-xs sm:text-sm text-[var(--violet)] font-bold hover:underline py-1.5 cursor-pointer disabled:opacity-60" data-testid="login-use-password">
                  Use password instead
                </button>
              ) : (
                <button type="button" onClick={() => openOtp(false)} disabled={loading} className="text-xs sm:text-sm text-[var(--violet)] font-bold hover:underline py-1.5 cursor-pointer disabled:opacity-60" data-testid="login-use-otp">
                  Login with OTP (email code)
                </button>
              )}
            </div>
          </form>
          <div className="flex items-center gap-4 my-4 sm:my-5">
            <div className="flex-1 h-px bg-foreground/10"></div>
            <span className="text-[11px] sm:text-xs text-[var(--text-tertiary)] font-black tracking-widest uppercase">OR CONTINUE WITH</span>
            <div className="flex-1 h-px bg-foreground/10"></div>
          </div>
          <div className="mt-4 sm:mt-5 mb-4 sm:mb-5">
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
                <AppleSignInButton role={role} next={params.get("next") || ""} disabled={loading} className="py-2.5 sm:py-3 text-xs sm:text-sm rounded-xl min-h-[44px]" />
              </div>
            )}
            {/* v334 (App Store / Play): legal pages + support reachable from the login screen, logged out */}
            <p className="mt-3 text-[11px] leading-snug text-center text-[var(--text-tertiary)]" data-testid="login-legal-line">
              By continuing you agree to the <a href="/info/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a> and <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>. Need help? <a href="/help" className="underline">Help centre</a> · <a href="mailto:support@ybexmedia.in" className="underline">support@ybexmedia.in</a>
            </p>
          </div>

{/* Session 43 (Ravi): demo / bypass logins never in the public app. v280: shown when the SERVER
              has DEMO_LOGIN=true (test server) or in local dev — the server refuses the tokens otherwise. */}
          {demoOn && (<>
          <div className="flex items-center gap-4 my-3 sm:my-4">
            <div className="flex-1 h-px bg-foreground/10"></div>
            <span className="text-[11px] sm:text-xs text-[var(--text-tertiary)] font-bold tracking-widest uppercase">Direct Demo Access</span>
            <div className="flex-1 h-px bg-foreground/10"></div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleDirectBypass()}
              disabled={bypassing || loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#7C3AED] via-[#7C3AED] to-[#7C3AED] hover:from-[#6D28D9] hover:via-[#6D28D9] hover:to-[#6D28D9] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md hover:shadow-lg transform active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {bypassing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="text-sm">⚡</span>
              )}
              <span>Direct Bypass Login ({role === "brand" ? "Brand" : "Creator"})</span>
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
              <span>Switch role:</span>
              <button
                type="button"
                onClick={() => handleDirectBypass("creator")}
                disabled={bypassing || loading}
                className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--violet-soft)] hover:text-[var(--violet)] font-semibold transition border border-border cursor-pointer text-[11px]"
              >
                Creator
              </button>
              <button
                type="button"
                onClick={() => handleDirectBypass("brand")}
                disabled={bypassing || loading}
                className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--violet-soft)] hover:text-[var(--violet)] font-semibold transition border border-border cursor-pointer text-[11px]"
              >
                Brand
              </button>
              <button
                type="button"
                onClick={() => handleDirectBypass("admin")}
                disabled={bypassing || loading}
                className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 font-semibold transition border border-red-200 dark:border-red-900 cursor-pointer text-[11px]"
              >
                Admin
              </button>
            </div>
          </div>




          </>)}

          <p className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-[var(--text-primary)]/60 font-medium">
            Don't have an account?{" "}
            <Link to={`/signup?role=${role}`} className="text-[var(--violet)] font-black hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
