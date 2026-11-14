import SocialLogo from "../../components/common/SocialLogo"; // v407: real Instagram mark
import React, { useEffect, useMemo, useRef, useState } from "react";
import { isIosHomeScreenApp, newHandoffId, waitForHandoff } from "../../lib/oauthHandoff"; // v378
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Mail, Eye, EyeOff, Check, ShieldAlert, Smartphone } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { safeStorage } from "../../utils/storage";
import { rememberMediaKey } from "../../lib/mediaKey";
import { storedReferral } from "../../lib/referralCapture";
import { postLoginPath, afterLoginPath } from "../auth/Login";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import { OfflineSignInNotice } from "../../components/common/OfflineState"; // v334: offline → "Connect to the internet to sign in"
import { EMAIL_RE, randomPassword } from "../../lib/standalone";
import { openOAuth, oauthAppParams, isNative, nativeGoogleSignIn } from "../../lib/native";
import { sendPreSource, getSignupSource } from "../../lib/signupSource"; // v418: ad tags travel with the e-mail / Google sign-in
import { afterSignupPath, trackRegistration, rememberSignupIg } from "../../lib/afterSignup"; // v376
import { saveProgress } from "../../lib/onboardingProgress"; // v376: Instagram username from sign-up → onboarding
import CreatorIgFirst from "../../components/signup/CreatorIgFirst"; // v402: Instagram username first, followers checked before any account
import { lastPrecheck, clearPrecheck, shortCount } from "../../lib/signupPrecheck";

// v376 (Ravi: "111 log signup page pe aaye, sirf 3 ne account banaya — signup easy karo"):
//   1. big "Continue with Google" on top (inside the Instagram / Facebook in-app browser, where Google refuses
//      to sign in, Android opens Chrome; iPhone gets the "Open in browser" tip)
//   2. below it: Instagram username (creators) + mobile number → SMS code. Shown when the server has an SMS key
//      (GET /auth/phone/config); otherwise the email box takes its place.
//   3. no password, name or mobile at sign-up — a new email gets a code straight away (password later in Settings)
//   4. creators skip onboarding (Home → "Complete your profile"); 5. a new creator from the offer page goes back
//      to /challenge?joined=1; 6. Meta CompleteRegistration fires the moment the account is made.
const IG_RE = /^[a-z0-9._]{1,30}$/;
const cleanIg = (v) => String(v || "").trim().replace(/^.*instagram\.com\//i, "").replace(/^@+/, "").replace(/[/?#\s].*$/, "").toLowerCase();
/** v388 (QA: "+91 98765 43210" pasted into the WhatsApp box was cut to "91 98765 432" BEFORE cleaning → wrong number): clean first
 *  (digits only), drop a leading 91 / 0 only when there are MORE than 10 digits (so a real number that starts with 91 is safe),
 *  then cap at 10. Pure. */
export const waClean = (v) => {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("0")) d = d.slice(1);   // 0 98765 43210
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);  // +91 98765 43210 (also 091 …)
  return d.slice(0, 10);
};
const mobile10 = (v) => { let d = String(v || "").replace(/\D/g, ""); if (d.length === 12 && d.startsWith("91")) d = d.slice(2); if (d.length === 11 && d.startsWith("0")) d = d.slice(1); return d; };
/** Android in-app browser → the same page in Chrome (Google sign-in works there). "" elsewhere. */
export function chromeIntentUrl(href, ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  if (!/Android/i.test(String(ua || ""))) return "";
  try { const u = new URL(href); return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`; } catch { return ""; }
}

// Session 42 (Ravi): one email box. The app finds out if the account exists:
//   exists, same role   → "Continue with OTP" (big) · "Use password instead" (small, below)
//   Session 48 (Ravi): if the account HAS a password → password box + "Log in with password" (big)
//   and "Log in with OTP instead" (small, below). Accounts without a password keep the OTP screen.
//   exists, other role  → offer that role, or another email
//   new email           → name + mobile (+ optional password) → email code → onboarding
// Every step uses existing server routes; only POST /auth/check-email and /auth/login-otp are new.
const ROLE_LABEL = { creator: "Creator", brand: "Brand / Agency" };
const RESEND_SECONDS = 30;

// Session 43 (Ravi): no icon chip (the sparkle looked AI-made) — one plain line that says which
// side you are on, so you know where you are.
const ROLE_LINE = { creator: "a Creator", brand: "a Brand / Agency" };
function Shell({ onBack, role, mode = "in", children }) {
  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-[#F2F2F7] text-[#0A0A0A]"
      style={{ fontFamily: "'DM Sans', sans-serif", paddingTop: 8 /* Session 43: #root starts below the clock */, paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
    >
      <div className="relative flex items-center justify-center h-14 px-4">
        <button type="button" onClick={onBack} aria-label="Back" className="absolute left-3 w-10 h-10 rounded-full flex items-center justify-center active:bg-black/5" data-testid="app-back">
          <ArrowLeft size={22} />
        </button>
        {/* v330: side padding so "signing up as a Brand / Agency" never runs under the back button on 320px */}
        {mode === "login" ? null /* v408: the Log in screen works for creators AND brands — no role line */ : (
        <span className="text-[13px] text-[#6B7280] px-11 text-center leading-tight" data-testid="app-role-line">
          {mode === "up" ? "You're signing up as " : "You're signing in as "}
          <span className="font-semibold text-[#0A0A0A]">{ROLE_LINE[role] || ROLE_LINE.creator}</span>
        </span>
        )}
      </div>
      <div className="flex-1 flex flex-col px-6">{children}</div>
    </div>
  );
}

function Primary({ children, disabled, onClick, testId, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="w-full h-[54px] rounded-2xl bg-[#7C3AED] text-white text-[16px] font-semibold disabled:bg-[#E9E5F5] disabled:text-[#A39DB8] active:scale-[0.99] transition-[transform,background-color] flex items-center justify-center gap-2"
    >
      {children}
    </button>
  );
}

function CodeBoxes({ value, onChange, autoFocus = true, testId }) {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 250); }, [autoFocus]);
  return (
    <label className="relative block mt-6" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        className="absolute inset-0 w-full h-full opacity-0"
        data-testid={testId}
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => {
          const active = i === Math.min(value.length, 5);
          return (
            <div
              key={i}
              className={`h-14 rounded-xl bg-white flex items-center justify-center text-[22px] font-bold border ${active ? "border-[#7C3AED] ring-4 ring-[#7C3AED]/10" : "border-[#E5E2EE]"}`}
            >
              {value[i] || ""}
            </div>
          );
        })}
      </div>
    </label>
  );
}

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(RESEND_SECONDS)];
}

const step = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.18 } },
};

/** iPhone / iPad (iPadOS reports a Mac with touch). Only these see "Continue with Apple". */
export function isIOSDevice(nav = typeof navigator !== "undefined" ? navigator : null) {
  if (!nav) return false;
  const ua = String(nav.userAgent || "");
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && Number(nav.maxTouchPoints || 0) > 1);
}
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
function AppleMark() {
  return (
    <svg width="18" height="20" viewBox="0 0 814 1000" aria-hidden="true" fill="#fff">
      <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-58-156-128C44 790 0 669 0 554c0-185 120-283 239-283 63 0 115 41 155 41 38 0 97-44 169-44 27 0 125 2 190 73zM554 168c30-35 51-84 51-133 0-7-1-14-2-19-48 2-106 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 1 9 1 14 1 43 0 97-29 128-69z"/>
    </svg>
  );
}

export default function AppContinue() {
  const { role: roleParam } = useParams();
  const navigate = useNavigate();
  const { user, loading, login, signup, setUser } = useAuth();
  const { isBusy, anyBusy, run } = useBusy();

  const [role, setRole] = useState(roleParam === "brand" ? "brand" : "creator");
  const [stage, setStage] = useState("email"); // email | account | otp | password | mismatch | admin | signup | verify
  // v370: the website comes here too — ?next= (e.g. /challenge) is where a login goes back to; ?email= fills the box
  const query = typeof window !== "undefined" ? window.location.search : "";
  const nextParam = useMemo(() => { try { return new URLSearchParams(query).get("next") || ""; } catch { return ""; } }, [query]);
  const goAfter = (u, opts) => navigate(afterSignupPath(u, nextParam, opts), { replace: true }); // v376: creators skip onboarding
  const [email, setEmail] = useState(() => { try { return new URLSearchParams(query).get("email") || ""; } catch { return ""; } });
  const [account, setAccount] = useState(null); // answer of /auth/check-email
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // v291 (Ravi): every new account sets a password as well as the email code — people kept signing in
  // with codes only and never made one. The password box is always shown and required.
  const ownPassword = false; // v376 (Ravi): no password at sign-up — Settings → Account → Password later
  const [newPassword, setNewPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [resendLeft, startResend] = useCountdown();
  const emailRef = useRef(null);

  // v376: mobile + SMS code
  const [phoneOn, setPhoneOn] = useState(false);
  // v378 (Ravi: Fast2SMS Smart OTP): "whatsapp" or "sms" — the server says where the code goes.
  const [otpCh, setOtpCh] = useState("sms");
  // v378: creators sign up with WhatsApp number + code by default when the OTP is on WhatsApp ("Use email instead" → old join).
  const [phoneJoin, setPhoneJoin] = useState(false);
  const [showEmail, setShowEmail] = useState(() => { try { return Boolean(new URLSearchParams(query).get("email")); } catch { return false; } });
  const [mobile, setMobile] = useState("");
  const [igName, setIgName] = useState(() => lastPrecheck()?.username || "");
  // v402: a new creator answers the Instagram username first (followers checked before any account / code e-mail)
  const [igPassed, setIgPassed] = useState(() => Boolean(lastPrecheck()?.username));
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => api.get("auth/phone/config", { bypassCache: true })).then(({ data }) => {
      if (!alive) return;
      const on = Boolean(data?.enabled);
      const ch = data?.channel === "whatsapp" ? "whatsapp" : "sms";
      setPhoneOn(on); setOtpCh(ch);
      if (on && ch === "whatsapp") setPhoneJoin(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const m10 = mobile10(mobile);
  const mobileOk = /^[6-9]\d{9}$/.test(m10);
  const igClean = cleanIg(igName);
  const igOk = !igName.trim() || IG_RE.test(igClean);

  const cleanEmail = email.trim().toLowerCase();
  const emailOk = EMAIL_RE.test(cleanEmail);

  // Already logged in (e.g. back button after login): leave the auth screens.
  useEffect(() => {
    if (!loading && user) goAfter(user);
  }, [user, loading, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setError(""); }, [stage]);
  // v376: the creators' join screen opens without the keyboard (it would cover Continue with Google)
  // v415: brands from ads land here on a phone — no keyboard popping up over "Continue with Google" (desktop still focuses)
  const touchOnly = () => { try { return window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches; } catch { return false; } };
  useEffect(() => { if (stage === "email" && !(role === "creator" && !showLogin) && !(role === "brand" && touchOnly())) setTimeout(() => emailRef.current?.focus(), 300); }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    if (stage === "email" && role === "creator" && showLogin && /[?&]login=1\b/.test(query)) { // v408: opened as Log in → back to where they were
      if (typeof window !== "undefined" && Number(window.history.state?.idx) > 0) return navigate(-1);
      return navigate("/app", { replace: true });
    }
    if (stage === "email" && role === "creator" && showLogin) { setError(""); return setShowLogin(false); }
    if (stage === "email" && showEmail && phoneOn) { setError(""); return setShowEmail(false); }
    // v408 (QA #6): the join form goes back to the Instagram screen (not out of sign-up)
    if (stage === "email" && role === "creator" && !showLogin && igPassed) { setError(""); clearPrecheck(); return setIgPassed(false); }
    // v408 (QA #6: back on the Instagram screen opened /app — the Diwali page visitor lost the offer): go back to the page
    // they came from inside the site (challenge / offer / landing); only a direct visit falls back to /app.
    if (stage === "email" && typeof window !== "undefined" && Number(window.history.state?.idx) > 0) return navigate(-1);
    if (stage === "email") return navigate({ pathname: "/app", search: query }, { replace: true });
    // Session 48: password is the first screen for accounts that have one, so back goes to the email box.
    if (stage === "password") { setPassword(""); return setStage("email"); }
    if (stage === "otp") return setStage(account?.has_password ? "password" : "account");
    if (stage === "verify") return setStage("email");
    if (stage === "phoneotp") { setCode(""); return setStage("email"); }
    setCode(""); setPassword("");
    setStage("email");
  };

  const finishLogin = (data) => {
    safeStorage.setItem("ybex_token", data.token);
    try { if (cleanEmail) window.localStorage.setItem("ybex_last_email", cleanEmail.toLowerCase()); } catch { /* private mode */ }
    safeStorage.setItem("ybex_user", JSON.stringify(data.user));
    try { rememberMediaKey(data); } catch { /* older answer without media key */ }
    setUser(data.user);
    trackRegistration(data.user); // v376: only when the account is new (made in the last hour)
    goAfter(data.user);
  };

  const accountStatusError = (err) => {
    const d = err?.response?.data || {};
    if (["ACCOUNT_DELETED", "ACCOUNT_BANNED", "ACCOUNT_SUSPENDED"].includes(d.code)) {
      navigate("/account-status", { state: { status: d.code, message: d.detail, user_id: d.user_id, role: d.role } });
      return true;
    }
    return false;
  };

  // 1. Email → does the account exist?
  const checkEmail = () => run("check", async () => {
    if (!emailOk) { setError("Please enter a valid email address."); return; }
    try {
      const { data } = await api.post("auth/check-email", { email: cleanEmail });
      setAccount(data);
      if (!data?.exists) sendPreSource(api, cleanEmail); // v418
      // v408 (Ravi 5 Nov): on the creator Log in screen a NEW email must not make an account without the Instagram check —
      // send them to Join (Instagram first). Brands still sign up straight away.
      if (!data?.exists && role === "creator" && showLogin) {
        setError("No Ybex account with this email yet. Join with your Instagram first — it takes 10 seconds.");
        setNoAccount(true);
        return;
      }
      if (!data?.exists) { await createAccountNow(); return; } // v376: no form — the code goes out straight away
      if (data.role === "admin") { setStage("admin"); return; }
      // v408: the Log in screen is for creators AND brands — a brand's email just logs in as a brand (no "wrong side" screen)
      if (data.role && data.role !== role && role === "creator" && showLogin) {
        setRole(data.role); navigate({ pathname: `/app/continue/${data.role}`, search: query }, { replace: true });
        setStage(data.has_password ? "password" : "account"); return;
      }
      if (data.role && data.role !== role) { setStage("mismatch"); return; }
      setStage(data.has_password ? "password" : "account");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not check this email. Please try again.");
    }
  });

  // 2a. Send the login code.
  const sendLoginCodeNow = async () => {
    try {
      const { data } = await api.post("auth/login-otp", { email: cleanEmail, app_role: role });
      setCode(data?.otp || ""); // test mode only: the server returns the code
      startResend();
      setStage("otp");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not send the code. Please try again.");
    }
  };
  const sendLoginCode = () => run("send", sendLoginCodeNow);

  // 2b. Check the login code.
  const verifyLoginCode = (value = code) => run("verify", async () => {
    if (value.length !== 6) return;
    try {
      const { data } = await api.post("auth/login", { email: cleanEmail, otp: value, app_role: role });
      if (data?.token) finishLogin(data);
      else setError("Could not log in. Please try again.");
    } catch (err) {
      if (accountStatusError(err)) return;
      if (err?.response?.data?.code === "ADMIN_ACCOUNT") { setStage("admin"); return; }
      setCode("");
      setError(err?.response?.data?.detail || "That code did not work. Please try again.");
    }
  });

  // 2c. Password instead.
  const passwordLogin = () => run("password", async () => {
    try {
      const u = await login(cleanEmail, password, role);
      if (u?.requiresVerification) { setStage("signup"); return; }
      goAfter(u);
    } catch (err) {
      if (accountStatusError(err)) return;
      if (err?.response?.data?.code === "ADMIN_ACCOUNT") { setStage("admin"); return; }
      setError(err?.response?.data?.detail || "Wrong email or password.");
    }
  });

  // 3. New account. v376: email only — name, mobile and password come later (onboarding / Settings).
  // v376 (Ravi: "Join Now pe sirf ek screen … saare creators ke liye, brands purana"): creators join with Instagram
  // username + email + WhatsApp on ONE screen — no code, no password — and are in straight away (email confirmed
  // later by a link). "Already on Ybex? Log in" opens the usual email-code login. Brands keep the email-code sign-up.
  const [noAccount, setNoAccount] = useState(false);
  // v408: a new Google account from the Log in / Join screen comes back here with ?gp=<id>&ge=<email> (no account yet)
  const googlePending = (() => { try { const q = new URLSearchParams(query); const id = q.get("gp") || ""; return /^[a-f0-9]{32}$/.test(id) ? { id, email: q.get("ge") || "" } : null; } catch { return null; } })(); // v408: Log in with an email that has no account
  const [showLogin, setShowLogin] = useState(() => { try { const q = new URLSearchParams(query); return Boolean(q.get("email")) || q.get("login") === "1"; } catch { return false; } }); // v408: ?login=1 from the welcome screen
  const [waNumber, setWaNumber] = useState("");
  const [fieldErr, setFieldErr] = useState("");
  const wa10 = mobile10(waNumber);
  const waOk = /^[6-9]\d{9}$/.test(wa10);
  const detailsOk = IG_RE.test(igClean) && waOk;
  const finishNewCreator = (data, method) => {
    safeStorage.setItem("ybex_token", data.token);
    safeStorage.setItem("ybex_user", JSON.stringify(data.user));
    try { window.localStorage.setItem("ybex_last_email", cleanEmail); } catch { /* private mode */ }
    try { rememberMediaKey(data); } catch { /* fine */ }
    rememberSignupIg(igClean);
    trackRegistration(data.user, method, true); // Meta CompleteRegistration — the account was just made
    // onboarding opens with the username in; the numbers are fetched from Instagram now (like the waitlist)
    saveProgress({ flow: "creator_mobile", page: "identity", pos: null, answers: { instagramHandle: igClean }, basicsDone: false }).catch(() => {});
    Promise.resolve().then(() => api.post("creator/instagram/lookup", { username: igClean })).catch(() => {});
    setUser(data.user);
    goAfter(data.user, { justCreated: true });
  };
  // Ravi (final): email first → the code opens right under it → Instagram + WhatsApp open under that → Join.
  const [joinStep, setJoinStep] = useState("email"); // email | code | details
  const [joinCode, setJoinCode] = useState("");
  const [proof, setProof] = useState("");
  const toLogin = async (d) => {
    // an email that already has an account → the normal login (password slides open, or the email code)
    setAccount({ exists: true, role: d.role, has_password: d.has_password });
    setShowLogin(true);
    setJoinStep("email");
    if (d.role && d.role !== role) { setStage("mismatch"); return; }
    if (d.has_password) { setStage("password"); return; }
    await sendLoginCodeNow();
  };
  const joinSendCode = () => run("quick", async () => {
    setFieldErr("");
    if (!emailOk) { setFieldErr("email"); setError("Please enter a valid email address."); return; }
    try {
      const { data } = await api.post("auth/join/send-code", { email: cleanEmail });
      sendPreSource(api, cleanEmail); // v418
      setJoinCode(data?.otp || "");
      startResend();
      setJoinStep("code");
    } catch (err) {
      const d = err?.response?.data || {};
      if (d.code === "ACCOUNT_EXISTS") { await toLogin(d); return; }
      if (d.code === "ADMIN_ACCOUNT") { setStage("admin"); return; }
      sentForRef.current = "";
      setError(d.detail || "Could not send the code. Please try again.");
    }
  });
  const joinVerify = (value = joinCode) => run("verify", async () => {
    if (value.length !== 6) return;
    try {
      const { data } = await api.post("auth/join/verify-code", { email: cleanEmail, otp: value });
      setProof(data?.proof || "");
      setJoinStep("details");
    } catch (err) {
      setJoinCode("");
      setError(err?.response?.data?.detail || "That code did not work. Please try again.");
    }
  });
  const joinResend = () => run("resend", async () => {
    try { const { data } = await api.post("auth/join/send-code", { email: cleanEmail }); if (data?.otp) setJoinCode(data.otp); startResend(); toast.success("New code sent"); }
    catch (err) { setError(err?.response?.data?.detail || "Could not send a new code."); }
  });
  const quickJoin = () => run("quick", async () => {
    setFieldErr("");
    if (!IG_RE.test(igClean)) { setFieldErr("instagram"); setError("Enter your Instagram username (letters, numbers, . and _)."); return; }
    if (!waOk) { setFieldErr("whatsapp"); setError("Enter your 10-digit WhatsApp number."); return; }
    try {
      const { data } = await api.post("auth/quick-join", { email: cleanEmail, instagram: igClean, whatsapp: wa10, proof, referral_code: storedReferral() || null });
      if (!data?.token || !data?.user) { setError("Could not create the account. Please try again."); return; }
      finishNewCreator(data, "email");
    } catch (err) {
      const d = err?.response?.data || {};
      if (d.code === "ACCOUNT_EXISTS") { await toLogin(d); return; }
      if (d.code === "LOW_FOLLOWERS") { setIgPassed(false); setError(""); return; } // v402: back to the Instagram step (its page explains)
      if (d.code === "EMAIL_NOT_VERIFIED") { setProof(""); setJoinStep("email"); }
      if (d.field) setFieldErr(d.field);
      setError(d.detail || "Could not create the account. Please try again.");
    }
  });
  const joinSubmit = () => {
    if (joinStep === "details") return quickJoin();
    if (joinStep === "code") { if (joinCode.length === 6) return joinVerify(); setError("Enter the 6-digit code from your email first."); return undefined; }
    return joinSendCode();
  };
  // Ravi: "jaise hi email daale, code apne aap chala jaaye" — sent when the email box is left, or after 1.5 s of no typing
  const sentForRef = useRef("");
  const autoSend = () => {
    if (role !== "creator" || showLogin || joinStep !== "email" || !emailOk || anyBusy) return;
    if (sentForRef.current === cleanEmail) return;
    sentForRef.current = cleanEmail;
    joinSendCode();
  };
  useEffect(() => {
    if (role !== "creator" || showLogin || joinStep !== "email" || !emailOk) return undefined;
    const t = setTimeout(autoSend, 1500);
    return () => clearTimeout(t);
  }, [cleanEmail, emailOk, joinStep, showLogin, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const createAccountNow = async () => {
    try {
      const { data } = await api.post("auth/signup", { email: cleanEmail, name: name.trim(), passwordless: true, role, phone: "", referral_code: storedReferral() || null });
      if (data?.requiresVerification) {
        setCode(data.otp || "");
        startResend();
        setStage("verify");
      } else {
        setError(data?.detail || "Could not create the account. Please try again.");
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not create the account. Please try again.");
    }
  };
  const createAccount = () => run("signup", createAccountNow);

  // 4. Mobile + SMS code (v376)
  const [phoneNew, setPhoneNew] = useState(false);
  const sendPhoneCode = () => run("phone", async () => {
    if (!mobileOk) { setError("Please enter a valid 10-digit mobile number."); return; }
    if (!igOk) { setError("Instagram username: letters, numbers, dots and underscores only."); return; }
    try {
      const { data } = await api.post("auth/phone/send", { phone: m10 });
      setCode(data?.otp || "");
      startResend();
      setStage("phoneotp");
    } catch (err) {
      setError(err?.response?.data?.detail || (viaWa ? "Could not send the WhatsApp code. Please try again." : "Could not send the SMS. Please try again."));
    }
  });
  const verifyPhoneCode = (value = code) => run("verify", async () => {
    if (value.length !== 6) return;
    try {
      const { data } = await api.post("auth/phone/verify", { phone: m10, otp: value, role, instagram: igClean || undefined });
      if (!data?.token || !data?.user) { setError("Could not log in. Please try again."); return; }
      safeStorage.setItem("ybex_token", data.token);
      safeStorage.setItem("ybex_user", JSON.stringify(data.user));
      try { rememberMediaKey(data); } catch { /* fine */ }
      if (igClean && role === "creator") {
        rememberSignupIg(igClean);
        // onboarding opens with the username filled in (and fetches the numbers from it)
        saveProgress({ flow: "creator_mobile", page: "identity", pos: null, answers: { instagramHandle: igClean }, basicsDone: false }).catch(() => {});
      }
      setPhoneNew(Boolean(data.is_new));
      if (data.is_new) trackRegistration(data.user, "phone", true);
      setUser(data.user);
      goAfter(data.user, { justCreated: Boolean(data.is_new) });
    } catch (err) {
      if (accountStatusError(err)) return;
      const d = err?.response?.data || {};
      if (d.code === "ROLE_MISMATCH" && (d.role === "creator" || d.role === "brand")) { setError(d.detail); return; }
      if (d.code === "LOW_FOLLOWERS") { setIgPassed(false); setStage("email"); setCode(""); setError(""); return; } // v402
      setCode("");
      setError(d.detail || "That code did not work. Please try again.");
    }
  });
  const resendPhone = () => run("resend", async () => {
    try { const { data } = await api.post("auth/phone/send", { phone: m10 }); if (data?.otp) setCode(data.otp); startResend(); toast.success("New code sent"); }
    catch (err) { setError(err?.response?.data?.detail || "Could not send a new code."); }
  });

  const verifySignupCode = (value = code) => run("verify", async () => {
    if (value.length !== 6) return;
    try {
      const { data } = await api.post("auth/verify-email", { email: cleanEmail, otp: value });
      if (data?.token && data?.user) {
        safeStorage.setItem("ybex_token", data.token);
        try { if (cleanEmail) window.localStorage.setItem("ybex_last_email", cleanEmail.toLowerCase()); } catch { /* private mode */ }
        safeStorage.setItem("ybex_user", JSON.stringify(data.user));
        try { rememberMediaKey(data); } catch { /* fine */ }
        setUser(data.user);
        trackRegistration(data.user, "email", true); // v376: the account was just made
        goAfter(data.user, { justCreated: true });
      } else {
        setError("Could not verify. Please try again.");
      }
    } catch (err) {
      setCode("");
      setError(err?.response?.data?.detail || "That code did not work. Please try again.");
    }
  });

  const resend = (kind) => run("resend", async () => {
    try {
      if (kind === "login") {
        const { data } = await api.post("auth/login-otp", { email: cleanEmail, app_role: role });
        if (data?.otp) setCode(data.otp);
      } else {
        const { data } = await api.post("auth/resend-verification-otp", { email: cleanEmail });
        if (data?.otp) setCode(data.otp);
      }
      startResend();
      toast.success("New code sent");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not send a new code.");
    }
  });

  const pwOpen = stage === "password"; // v372: password opens inside the email screen
  const otherRole = useMemo(() => (account?.role === "brand" ? "brand" : "creator"), [account]);

  const ErrorLine = error ? <p className="mt-3 text-[13px] text-[#DC2626]" role="alert" data-testid="app-error">{error}</p> : null;
  const Terms = (
    <p className="mt-auto pt-8 text-center text-[12px] leading-relaxed text-[#8A8799]">
      {/* v334: Google / Apple sign-up skips the 18+ checkbox, so the line says it (Terms: 18+ only) */}
      By continuing you confirm you are 14 or older and accept the <a href="/info/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a> and{" "}
      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>.
    </p>
  );
  // v286: Google / Apple — same window (pop-ups don't come back inside the installed app).
  const showApple = isIOSDevice();
  // v371: Google blocks sign-in inside the Instagram / Facebook in-app browser (ads open there) — show email first
  const inAppBrowser = typeof navigator !== "undefined" && /Instagram|FBAN|FBAV|FB_IAB|FBIOS/i.test(navigator.userAgent || "");
  const startOAuth = (provider, opts = {}) => run(provider, async () => {
    try {
      // v291 (Ravi: iPhone asks to type the Google ID, no suggestions): the installed iPhone app has no
      // Google cookies, so Google can't list accounts. Hand it the email — the one typed above, else the
      // last one used here — and Google opens straight on that account.
      let hint = "";
      if (false && provider === "google" && !opts.chooseAccount) { // v391/v392 (Ravi): never sign in silently with the remembered e-mail on any phone — Google always asks which account.
        // (kept for reference only — the hint is switched off above)
        const typed = String(email || "").trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) hint = typed;
        else { try { hint = String(window.localStorage.getItem("ybex_last_email") || ""); } catch { hint = ""; } }
      }
      // v378: Android / iPhone app → the phone's own Google account list (no "add new account" browser page)
      if (provider === "google" && isNative()) {
        try {
          const d = await nativeGoogleSignIn(role, { join: Boolean(opts.join) });
          if (d?.pending) { navigate(`/app/continue/creator?${new URLSearchParams({ gp: d.pending, ge: d.email || "" }).toString()}`, { replace: true }); return; } // v408
          if (d?.token) { navigate(`/app/oauth#${new URLSearchParams({ token: d.token, role: d.role || role || "" }).toString()}`, { replace: true }); return; }
        } catch (e) {
          if (e?.cancelled) return;
          setError(e?.code === "banned" ? "This account has been banned. Please contact support." : "Google sign-in didn't work. Please try again or use your email.");
          return;
        }
      }
      const handoff = isIosHomeScreenApp() ? newHandoffId() : ""; // v378: iPhone Home Screen app — see lib/oauthHandoff.js
      const { data } = await api.get("auth/oauth/url", { params: { provider, role, ...(hint ? { hint } : {}), ...(handoff ? { handoff } : {}), ...(opts.join ? { join: "1" } : {}), ...oauthAppParams(), ...(() => { const s = getSignupSource(); return s && (s.utm_source || s.fbclid || s.gclid) ? { src: JSON.stringify({ utm_source: s.utm_source, utm_medium: s.utm_medium, utm_campaign: s.utm_campaign, fbclid: s.fbclid, gclid: s.gclid }) } : {}; })() }, bypassCache: true });
      if (handoff) waitForHandoff(handoff, (d) => navigate(d?.pending
        ? `/app/continue/creator?${new URLSearchParams({ gp: d.pending, ge: d.email || "" }).toString()}` // v408
        : `/app/oauth#${new URLSearchParams({ token: d.token, role: d.role || role || "" }).toString()}`, { replace: true }));
      // v370: on the website Google comes back to /app/oauth in this tab — it reads the side and the page to return to
      if (!isNative()) { try { window.sessionStorage.setItem("ybex_oauth_role", role || ""); window.sessionStorage.setItem("ybex_oauth_next", nextParam || ""); } catch { /* private mode */ } }
      if (data?.url && handoff) { const w = window.open(data.url, "_blank"); if (!w) window.location.href = data.url; return; } // v378: keep the app page alive under the sheet
      if (data?.url) { await openOAuth(data.url); return; } // v335: phone browser sheet inside the iPhone app
      setError("Could not open sign-in. Please use your email.");
    } catch (e) {
      setError(e?.response?.data?.error || "Could not open sign-in. Please use your email.");
    }
  });
  // v376: in the Instagram / Facebook browser Google says "disallowed_useragent" — on Android hand the page to Chrome
  const googleTap = () => {
    if (inAppBrowser) {
      const intent = chromeIntentUrl(window.location.href);
      if (intent) { window.location.href = intent; return; }
    }
    startOAuth("google", { join: role === "creator" }); // v408: creators — a NEW Google account first checks Instagram (no account yet)
  };
  const joinMode = role === "creator" && !showLogin && !pwOpen; // v376: creators' one-screen sign-up
  // v378: creators join with WhatsApp number + code (Fast2SMS Smart OTP on WhatsApp); "Use email instead" → the email join.
  const waJoin = joinMode && phoneJoin && phoneOn && !showEmail;
  const emailJoin = joinMode && !waJoin;
  const phoneMode = !emailJoin && phoneOn && !showEmail && !pwOpen && !(role === "creator" && showLogin); // v408 (Ravi): Log in = Google + email only
  const viaWa = otpCh === "whatsapp";
  const canOpenChrome = inAppBrowser && Boolean(chromeIntentUrl(typeof window !== "undefined" ? window.location.href : ""));
  const EmailChip = (
    <button type="button" onClick={() => setStage("email")} className="mt-2 inline-flex items-center gap-1.5 text-[14px] text-[#6B7280] max-w-full min-h-[36px] self-start">
      {/* v330: long emails truncate instead of pushing "Change" off screen */}
      <Mail size={14} className="shrink-0" /> <span className="font-medium text-[#0A0A0A] truncate min-w-0">{cleanEmail}</span> <span className="text-[#7C3AED] font-semibold shrink-0">Change</span>
    </button>
  );

  const igFirst = joinMode && stage === "email" && !igPassed;
  // v408 (QA #7/#8): after the Instagram check the username is no longer a free text box (edits were never re-checked) —
  // a card with the fetched profile and "Change", which goes back to the Instagram screen and checks again.
  const pre = lastPrecheck();
  const igShown = (pre && pre.username === cleanIg(igName)) ? pre : { username: cleanIg(igName) };
  const changeIg = () => { clearPrecheck(); setIgName(""); setIgPassed(false); setError(""); setFieldErr(""); };
  const IgCard = (
    <div className={`flex items-center gap-3 rounded-2xl bg-white border ${fieldErr === "instagram" ? "border-[#DC2626]" : "border-[#E5E2EE]"} px-3 py-2.5`} data-testid="app-join-ig-card">
      {igShown.photo_url
        ? <img src={igShown.photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-[#EEE]" />
        : <span className="w-10 h-10 rounded-full bg-[#F2EEFF] flex items-center justify-center shrink-0"><SocialLogo platform="instagram" size={20} variant="color" /></span>}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[14.5px] font-semibold text-[#0A0A0A] truncate">{igShown.name || `@${igShown.username}`}</div>
        <div className="text-[12.5px] text-[#5F6672] truncate">@{igShown.username}{Number.isFinite(Number(igShown.followers)) && igShown.followers != null ? ` · ${shortCount(igShown.followers)} followers` : ""}</div>
      </div>
      <button type="button" onClick={changeIg} data-testid="app-join-ig-change" className="shrink-0 h-9 px-3 rounded-xl bg-[#F3EEFF] text-[13px] font-bold text-[#7C3AED]">Change</button>
    </div>
  );
  return (
    <Shell onBack={back} role={role} mode={stage === "verify" ? "up" : role === "creator" && showLogin && stage === "email" ? "login" : "in"}>
      <AnimatePresence mode="wait">
        {igFirst && (
          <motion.div key="email" {...step} className="flex-1 flex flex-col">{/* same key as the email screen: "Log in" swaps in place, no exit wait */}
            <CreatorIgFirst initial={igName} googlePending={googlePending} onGoogle={(!inAppBrowser || canOpenChrome) ? googleTap : null}
              onPass={(r) => { setIgName(r.username || ""); setIgPassed(true); setError(""); }}
              onLogin={() => { setError(""); setShowLogin(true); setTimeout(() => emailRef.current?.focus(), 250); }}
              footer={<>
                <button type="button" data-testid="app-switch-role"
                  onClick={() => { setRole("brand"); setError(""); navigate({ pathname: "/app/continue/brand", search: query }, { replace: true }); }}
                  className="mt-4 self-center min-h-[40px] px-2 text-[13.5px] font-semibold text-[#6B7280]">
                  Not a creator? <span className="text-[#7C3AED]">Continue as a Brand / Agency</span>
                </button>
                {Terms}
              </>} />
          </motion.div>
        )}
        {(stage === "email" || stage === "password") && !igFirst && (
          // v372 (Ravi: "email verify hote hi password usi screen mein animation se khule, saath mein 'Log in with OTP
          // instead'"): an account with a password no longer moves to another screen — the email box locks with
          // "Verified · Change" and the password box opens below it, with the OTP way right under the button.
          <motion.form key="email" {...step} className="flex-1 flex flex-col" onSubmit={(e) => { e.preventDefault(); if (pwOpen) passwordLogin(); else if (emailJoin) joinSubmit(); else if (phoneMode) sendPhoneCode(); else checkEmail(); }}>
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">{pwOpen ? "Welcome back" : role === "brand" ? "Hire creators on Ybex" : joinMode ? "Join Ybex — it's free" : "Welcome back 👋"}</h1>
            <p className="mt-2 text-[15px] text-[#6B7280]">{pwOpen ? "Enter your password, or log in with a code from your email." : waJoin ? "Takes 20 seconds. No email or password needed." : joinMode ? joinStep === "details" ? "Email verified. Tap Join and you're in." : "Takes 20 seconds. No password needed." : role === "creator" && showLogin ? "Log in to your account." /* v408 (QA #11) */ : "Sign up or log in in a few seconds."}</p>
            <OfflineSignInNotice className="mt-5" />{/* v334 */}
            {!pwOpen && (
              <div className="mt-6 space-y-3" data-testid="app-oauth-top">
                {/* v376 (Ravi): big Google button first. In the Instagram / Facebook in-app browser Google refuses to sign
                    in — Android opens this page in Chrome instead; iPhone gets the "Open in browser" tip. */}
                {(!inAppBrowser || canOpenChrome) && (
                <button type="button" onClick={googleTap} disabled={anyBusy} data-testid="app-oauth-google"
                  className="w-full h-[58px] rounded-2xl bg-white border-2 border-[#E5E2EE] shadow-[0_6px_18px_-12px_rgba(17,12,46,.35)] flex items-center justify-center gap-3 text-[17px] font-bold text-[#0A0A0A] active:scale-[0.99] transition-transform disabled:opacity-60">
                  {isBusy("google") ? <ButtonSpinner /> : (<><GoogleMark /> Continue with Google</>)}
                </button>
                )}
                {/* v390 (Ravi: keep one-tap sign-in AND let people pick another account): only shown when an account is remembered */}
                {(!inAppBrowser || canOpenChrome) && !isNative() && false && (() => { try { return Boolean(window.localStorage.getItem("ybex_last_email")); } catch { return false; } })() && (
                  <button type="button" onClick={() => startOAuth("google", { chooseAccount: true })} disabled={anyBusy} data-testid="app-oauth-google-other"
                    className="w-full text-center text-[13.5px] font-semibold text-[#7C3AED] min-h-[32px]">
                    Use a different Google account
                  </button>
                )}
                {inAppBrowser && !canOpenChrome && (
                  <p className="text-center text-[12.5px] leading-snug text-[#8A8799]" data-testid="app-inapp-tip">
                    For Google, tap ⋯ at the top and choose “Open in browser”. Or fill in the form below.
                  </p>
                )}
                {showApple && (
                  <button type="button" onClick={() => startOAuth("apple")} disabled={anyBusy} data-testid="app-oauth-apple"
                    className="w-full h-[54px] rounded-2xl bg-[#0A0A0A] text-white flex items-center justify-center gap-2.5 text-[16px] font-semibold active:scale-[0.99] transition-transform disabled:opacity-60">
                    {isBusy("apple") ? <ButtonSpinner /> : (<><AppleMark /> Continue with Apple</>)}
                  </button>
                )}
                <div className="pt-1 flex items-center gap-3 text-[12.5px] text-[#6B7280]" aria-hidden="true">
                  <span className="flex-1 h-px bg-[#E5E2EE]" /> or <span className="flex-1 h-px bg-[#E5E2EE]" />
                </div>
              </div>
            )}
            {emailJoin ? (
              <div data-testid="app-quick-join">
                {/* 1. email — the code goes out by itself; the box locks with "Verified ✓" once the code is right */}
                <div className="relative mt-3">
                  <input ref={emailRef} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    readOnly={joinStep !== "email"} value={email} onChange={(e) => { setEmail(e.target.value); setFieldErr(""); setError(""); }} onBlur={autoSend}
                    placeholder="Your email" aria-label="Email"
                    className={`w-full h-[56px] rounded-2xl border px-4 text-[17px] outline-none transition-colors ${joinStep !== "email" ? "bg-[#F7F6FB] border-[#ECEAF1] pr-[150px]" : `bg-white ${fieldErr === "email" ? "border-[#DC2626]" : "border-[#E5E2EE]"} focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/10`}`}
                    data-testid="app-join-email" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {joinStep === "email" && isBusy("quick") && <span className="pr-2 text-[#7C3AED]"><ButtonSpinner /></span>}
                    {joinStep === "details" && <span className="h-[26px] px-2.5 rounded-full bg-[#E8F7EF] text-[#15803D] text-[12px] font-bold inline-flex items-center gap-1" data-testid="app-join-verified"><Check size={12} strokeWidth={3} /> Verified</span>}
                    {joinStep !== "email" && <button type="button" onClick={() => { setJoinStep("email"); setJoinCode(""); setProof(""); setError(""); sentForRef.current = ""; setTimeout(() => emailRef.current?.focus(), 200); }} className="min-h-[40px] px-2 text-[13.5px] font-semibold text-[#7C3AED]">Change</button>}
                  </span>
                </div>
                {/* 2. one simple code box drops down under the email (like the password box), and folds away once verified */}
                <AnimatePresence initial={false}>
                  {joinStep === "code" && (
                    <motion.div key="jcode" initial={{ height: 0, opacity: 0, y: -8 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -8 }}
                      transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }} style={{ overflow: "hidden" }} data-testid="app-join-code-box">
                      <div className="relative mt-3 p-1 -m-1">
                        <input value={joinCode} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setJoinCode(v); setError(""); if (v.length === 6) joinVerify(v); }}
                          inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="Enter the 6-digit code" aria-label="Email code"
                          className={`w-full h-[56px] rounded-2xl bg-white border border-[#E5E2EE] pl-4 pr-28 text-[17px] ${joinCode ? "tracking-[0.2em] font-semibold" : ""} outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/10`}
                          data-testid="app-join-code" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2">
                          {isBusy("verify") ? <ButtonSpinner /> : (
                            <button type="button" disabled={resendLeft > 0 || anyBusy} onClick={joinResend} className="min-h-[40px] px-1 text-[13px] font-semibold text-[#7C3AED] disabled:text-[#A39DB8]">
                              {resendLeft > 0 ? `Resend ${resendLeft}s` : "Resend"}
                            </button>
                          )}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-[#8A8799]">Code sent to your email. Check spam if you don't see it.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* 3. Instagram + WhatsApp — always there */}
                <div className="mt-3 space-y-3">
                  {IgCard}
                  <div className={`flex items-center h-[56px] rounded-2xl bg-white border ${fieldErr === "whatsapp" ? "border-[#DC2626]" : "border-[#E5E2EE]"} focus-within:border-[#7C3AED] focus-within:ring-4 focus-within:ring-[#7C3AED]/10`}>
                    <span className="pl-4 pr-2 text-[17px] text-[#6B7280]">+91</span>
                    <input value={waNumber} onChange={(e) => { setWaNumber(waClean(e.target.value)); setFieldErr(""); }}
                      inputMode="numeric" autoComplete="tel-national" placeholder="WhatsApp number" aria-label="WhatsApp number"
                      className="flex-1 h-full bg-transparent pr-4 text-[17px] outline-none" data-testid="app-join-whatsapp" />
                  </div>
                </div>
                {ErrorLine}
                <div className="mt-4">
                  <Primary type="submit" disabled={!emailOk || !detailsOk || anyBusy} testId="app-join-submit">
                    {isBusy("quick") && joinStep === "details" ? <ButtonSpinner /> : "Join Ybex"}
                  </Primary>
                </div>
                <p className="mt-2 text-center text-[12px] text-[#8A8799]">Brands reach you on WhatsApp. We never show your number publicly.</p>
                {joinStep === "email" && phoneOn && viaWa && (
                  <button type="button" onClick={() => { setError(""); setFieldErr(""); setShowEmail(false); setPhoneJoin(true); }} data-testid="app-join-whatsapp"
                    className="mt-1 w-full min-h-[44px] text-[14px] font-semibold text-[#6B7280] flex items-center justify-center gap-1.5">
                    <Smartphone size={15} /> Join with WhatsApp OTP instead
                  </button>
                )}
                {joinStep === "email" && (
                  <button type="button" onClick={() => { setError(""); setFieldErr(""); setShowLogin(true); setTimeout(() => emailRef.current?.focus(), 250); }} data-testid="app-have-account"
                    className="mt-1 w-full min-h-[44px] text-[14px] font-semibold text-[#6B7280]">
                    Already on Ybex? <span className="text-[#7C3AED]">Log in</span>
                  </button>
                )}
              </div>
            ) : phoneMode ? (
              <div data-testid="app-phone-block">
                <div className="mt-3 space-y-3">
                  {role === "creator" && !showLogin && IgCard}
                  <div className="flex items-center h-[56px] rounded-2xl bg-white border border-[#E5E2EE] focus-within:border-[#7C3AED] focus-within:ring-4 focus-within:ring-[#7C3AED]/10">
                    <span className="pl-4 pr-2 text-[17px] text-[#6B7280]">+91</span>
                    <input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d ]/g, "").slice(0, 12))}
                      inputMode="numeric" autoComplete="tel-national" placeholder={viaWa ? "WhatsApp number" : "Mobile number"} aria-label="Mobile number"
                      className="flex-1 h-full bg-transparent pr-4 text-[17px] outline-none" data-testid="app-signup-phone" />
                  </div>
                </div>
                {ErrorLine}
                <div className="mt-4">
                  <Primary type="submit" disabled={!mobileOk || !igOk || anyBusy} testId="app-phone-send">
                    {isBusy("phone") ? <ButtonSpinner /> : (<><Smartphone size={18} /> {viaWa ? "Get OTP on WhatsApp" : "Get OTP on SMS"}</>)}
                  </Primary>
                </div>
                <button type="button" onClick={() => { setError(""); setPhoneJoin(false); setShowEmail(true); setTimeout(() => emailRef.current?.focus(), 250); }} data-testid="app-use-email"
                  className="mt-3 w-full min-h-[44px] text-[14px] font-semibold text-[#6B7280] flex items-center justify-center gap-1.5">
                  <Mail size={15} /> Use email instead
                </button>
              </div>
            ) : (<>
            <div className="relative mt-7">
            <input
              readOnly={pwOpen}
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (noAccount) { setNoAccount(false); setError(""); } }}
              placeholder={role === "brand" ? "you@company.com" : "you@example.com"}
              aria-label={role === "brand" ? "Work email" : "Email"} /* v415: the box had no label */
              className={`w-full h-[56px] rounded-2xl border px-4 text-[17px] outline-none transition-colors ${pwOpen ? "bg-[#F7F6FB] border-[#ECEAF1] pr-[170px] text-[#0A0A0A]" : "bg-white border-[#E5E2EE] focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/10"}`}
              data-testid="app-email"
            />
            {pwOpen && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <span className="h-[26px] px-2.5 rounded-full bg-[#E8F7EF] text-[#15803D] text-[12px] font-bold inline-flex items-center gap-1"><Check size={12} strokeWidth={3} /> Verified</span>
                <button type="button" onClick={() => { setPassword(""); setStage("email"); }} className="min-h-[40px] px-2 text-[13.5px] font-semibold text-[#7C3AED]" data-testid="app-email-change">Change</button>
              </span>
            )}
            </div>
            <AnimatePresence initial={false}>
              {pwOpen && (
                <motion.div key="pw" initial={{ height: 0, opacity: 0, y: -8 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -8 }}
                  transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }} style={{ overflow: "hidden" }}>
                  <div className="relative mt-3 p-1 -m-1">
                    <input
                      type={showPass ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-[56px] rounded-2xl bg-white border border-[#E5E2EE] pl-4 pr-12 text-[17px] outline-none focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/10"
                      placeholder="Password"
                      autoFocus
                      aria-label="Password"
                      data-testid="app-password"
                    />
                    <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#6B7280]" aria-label={showPass ? "Hide password" : "Show password"}>
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => navigate(`/forgot-password?email=${encodeURIComponent(cleanEmail)}`)} className="mt-1 text-[13px] font-semibold text-[#6B7280] min-h-[40px] px-1">Forgot password?</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {ErrorLine}
            {noAccount && role === "creator" && showLogin && (
              <button type="button" data-testid="app-noaccount-join"
                onClick={() => { setNoAccount(false); setError(""); setShowLogin(false); try { const u = new URL(window.location.href); u.searchParams.delete("login"); window.history.replaceState(window.history.state, "", u.pathname + u.search); } catch { /* keep */ } }}
                className="mt-3 w-full h-[52px] rounded-2xl bg-[#7C3AED] text-white text-[16px] font-bold">Join with my Instagram</button>
            )}
            {!(noAccount && role === "creator" && showLogin) && <div className={pwOpen ? "mt-2" : "mt-5"}>
              {pwOpen ? (
                <Primary type="submit" disabled={!password || anyBusy} testId="app-password-login">
                  {isBusy("password") ? <ButtonSpinner /> : "Log in with password"}
                </Primary>
              ) : (
                <Primary type="submit" disabled={!emailOk || anyBusy} testId="app-email-continue">
                  {isBusy("check") ? <ButtonSpinner /> : "Continue"}
                </Primary>
              )}
            </div>}
            <AnimatePresence initial={false}>
              {pwOpen && (
                <motion.div key="otp" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.42, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }} style={{ overflow: "hidden" }}>
                  <button type="button" onClick={sendLoginCode} disabled={anyBusy} data-testid="app-use-otp"
                    className="mt-3 w-full h-[52px] rounded-2xl bg-white border border-[#E5E2EE] flex items-center justify-center gap-2 text-[15px] font-semibold text-[#0A0A0A] disabled:opacity-60">
                    {isBusy("send") ? <ButtonSpinner /> : (<><Mail size={17} className="text-[#7C3AED]" /> Log in with OTP instead</>)}
                  </button>
                  <p className="mt-2 text-center text-[12.5px] text-[#8A8799]">No password, or forgot it? We'll email you a 6-digit code.</p>
                </motion.div>
              )}
            </AnimatePresence>
            {!pwOpen && role === "creator" && showLogin && (
              <button type="button" onClick={() => { setError(""); setShowLogin(false); }} data-testid="app-new-join"
                className="mt-3 w-full min-h-[44px] text-[14px] font-semibold text-[#6B7280]">
                New to Ybex? <span className="text-[#7C3AED]">Join in 20 seconds</span>
              </button>
            )}
            {!pwOpen && phoneOn && !(role === "creator" && showLogin) && (
              <button type="button" onClick={() => { setError(""); setShowEmail(false); }} data-testid="app-use-phone"
                className="mt-3 w-full min-h-[44px] text-[14px] font-semibold text-[#6B7280] flex items-center justify-center gap-1.5">
                <Smartphone size={15} /> Use mobile number instead
              </button>
            )}
            </>)}
            {!pwOpen && !(role === "creator" && showLogin) && (
            /* v370 (Ravi: "brand wala ad creator ne daba diya to?"): switch side in one tap */
            <button type="button" data-testid="app-switch-role"
              onClick={() => { const other = role === "brand" ? "creator" : "brand"; setRole(other); setError(""); navigate({ pathname: `/app/continue/${other}`, search: query }, { replace: true }); }}
              className="mt-4 self-center min-h-[40px] px-2 text-[13.5px] font-semibold text-[#6B7280]">
              {role === "brand" ? <>Not a brand? <span className="text-[#7C3AED]">Continue as a Creator</span></> : <>Not a creator? <span className="text-[#7C3AED]">Continue as a Brand / Agency</span></>}
            </button>
            )}
            {Terms}
          </motion.form>
        )}

        {stage === "account" && (
          <motion.div key="account" {...step} className="flex-1 flex flex-col">
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Welcome back</h1>
            {EmailChip}
            <p className="mt-5 text-[15px] text-[#6B7280]">We'll email you a 6-digit code to log in.</p>
            {ErrorLine}
            <div className="mt-6">
              <Primary onClick={sendLoginCode} disabled={anyBusy} testId="app-continue-otp">
                {isBusy("send") ? <ButtonSpinner /> : "Continue with OTP"}
              </Primary>
            </div>
            {account?.has_password && (
              <button type="button" onClick={() => setStage("password")} className="mt-5 text-[14px] font-semibold text-[#7C3AED] self-center min-h-[40px] px-2" /* v332: 40px tap area */ data-testid="app-use-password">
                Use password instead
              </button>
            )}
          </motion.div>
        )}

        {stage === "otp" && (
          <motion.div key="otp" {...step} className="flex-1 flex flex-col">
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Enter the code</h1>
            <p className="mt-2 text-[15px] text-[#6B7280]">Sent to <span className="font-medium text-[#0A0A0A] break-all">{cleanEmail}</span>. Check spam if you don't see it.</p>
            <CodeBoxes value={code} onChange={(v) => { setCode(v); if (v.length === 6) verifyLoginCode(v); }} testId="app-login-code" />
            {ErrorLine}
            <div className="mt-6">
              <Primary onClick={() => verifyLoginCode()} disabled={code.length !== 6 || anyBusy} testId="app-login-verify">
                {isBusy("verify") ? <ButtonSpinner /> : "Log in"}
              </Primary>
            </div>
            <div className="mt-5 flex items-center justify-between text-[14px]">
              <button type="button" disabled={resendLeft > 0 || anyBusy} onClick={() => resend("login")} className="font-semibold text-[#7C3AED] disabled:text-[#A39DB8]">
                {resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
              </button>
              {account?.has_password && (
                <button type="button" onClick={() => setStage("password")} className="font-semibold text-[#6B7280]">Use password instead</button>
              )}
            </div>
          </motion.div>
        )}

        {stage === "admin" && (
          <motion.div key="admin" {...step} className="flex-1 flex flex-col" data-testid="app-admin-email">
            <div className="mt-6 w-12 h-12 rounded-2xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center"><ShieldAlert size={22} /></div>
            <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] leading-tight">This is a Ybex admin account</h1>
            <p className="mt-2 text-[15px] text-[#6B7280] break-words">{cleanEmail} belongs to the Ybex team. It can't be used as {ROLE_LINE[role] || ROLE_LINE.creator}.</p>
            <div className="mt-8"><Primary onClick={() => { setStage("email"); setTimeout(() => emailRef.current?.select?.(), 320); }} testId="app-admin-other">Use another email</Primary></div>
            <button type="button" onClick={() => navigate("/ybx-admin")} className="mt-4 text-[14px] font-semibold text-[#7C3AED]" data-testid="app-admin-open">Open admin panel</button>
          </motion.div>
        )}

        {stage === "mismatch" && (
          <motion.div key="mismatch" {...step} className="flex-1 flex flex-col">
            <h1 className="mt-6 text-[26px] font-bold tracking-[-0.02em] leading-tight">
              This email is a {ROLE_LABEL[otherRole]} account
            </h1>
            {EmailChip}
            <p className="mt-4 text-[15px] text-[#6B7280]">
              One email is one account. Log in as {otherRole === "brand" ? "a brand" : "a creator"}, or use a different email for a {ROLE_LABEL[role].toLowerCase()} account.
            </p>
            <div className="mt-7">
              <Primary onClick={() => { setRole(otherRole); navigate(`/app/continue/${otherRole}`, { replace: true }); setStage(account?.has_password ? "password" : "account"); }} testId="app-switch-role">
                Continue as {ROLE_LABEL[otherRole]}
              </Primary>
            </div>
            <button type="button" onClick={() => { setEmail(""); setStage("email"); }} className="mt-5 text-[14px] font-semibold text-[#7C3AED] self-center">
              Use another email
            </button>
          </motion.div>
        )}

        {stage === "phoneotp" && (
          <motion.div key="phoneotp" {...step} className="flex-1 flex flex-col" data-testid="app-phone-otp">
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Enter the code</h1>
            <p className="mt-2 text-[15px] text-[#6B7280]">Sent {viaWa ? "on WhatsApp" : "by SMS"} to <span className="font-medium text-[#0A0A0A]">+91 {m10.slice(0, 5)} {m10.slice(5)}</span>.{" "}
              <button type="button" onClick={() => { setCode(""); setStage("email"); }} className="font-semibold text-[#7C3AED]">Change</button></p>
            <CodeBoxes value={code} onChange={(v) => { setCode(v); if (v.length === 6) verifyPhoneCode(v); }} testId="app-phone-code" />
            {ErrorLine}
            <div className="mt-6">
              <Primary onClick={() => verifyPhoneCode()} disabled={code.length !== 6 || anyBusy} testId="app-phone-verify">
                {isBusy("verify") ? <ButtonSpinner /> : "Continue"}
              </Primary>
            </div>
            <button type="button" disabled={resendLeft > 0 || anyBusy} onClick={resendPhone} className="mt-5 text-[14px] font-semibold text-[#7C3AED] disabled:text-[#A39DB8] self-center">
              {resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
            </button>
            {Terms}
          </motion.div>
        )}

        {stage === "verify" && (
          <motion.div key="verify" {...step} className="flex-1 flex flex-col">
            <h1 className="mt-6 text-[28px] font-bold tracking-[-0.02em] leading-tight">Check your email</h1>
            <p className="mt-2 text-[15px] text-[#6B7280]">We sent a 6-digit code to <span className="font-medium text-[#0A0A0A] break-all">{cleanEmail}</span>.</p>
            <CodeBoxes value={code} onChange={(v) => { setCode(v); if (v.length === 6) verifySignupCode(v); }} testId="app-verify-code" />
            {ErrorLine}
            <div className="mt-6">
              <Primary onClick={() => verifySignupCode()} disabled={code.length !== 6 || anyBusy} testId="app-verify-continue">
                {isBusy("verify") ? <ButtonSpinner /> : "Verify and continue"}
              </Primary>
            </div>
            <button type="button" disabled={resendLeft > 0 || anyBusy} onClick={() => resend("signup")} className="mt-5 text-[14px] font-semibold text-[#7C3AED] disabled:text-[#A39DB8] self-center">
              {resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}
