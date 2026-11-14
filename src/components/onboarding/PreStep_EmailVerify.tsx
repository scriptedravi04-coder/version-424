import React, { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { safeStorage } from "../../utils/storage";
import { useOnboardingStore } from "../../store/useOnboardingStore";
import { ignored } from "../../utils/ignored";

export default function PreStep_EmailVerify({ user: propUser }: { user?: any }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: authUser, setUser, refreshUser, logout } = useAuth();
  const { setStep } = useOnboardingStore();

  const currentUser = propUser || authUser;
  const emailParam = searchParams.get("email") || "";
  const roleParam = searchParams.get("role") || currentUser?.role || "creator";
  const targetEmail = currentUser?.email || emailParam || "";
  const otpQuery = searchParams.get("otp") || searchParams.get("test_otp") || "";

  const [otpSent, setOtpSent] = useState<boolean>(true); // Default to showing verification box since code was issued on signup
  const [otp, setOtp] = useState<string[]>(() => {
    if (otpQuery && otpQuery.length === 6) {
      return otpQuery.split("");
    }
    return ["", "", "", "", "", ""];
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(60);
  const [shake, setShake] = useState<boolean>(false);

  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (otpSent && inputs.current[0]) {
      inputs.current[0]?.focus();
    }
  }, [otpSent]);

  const handleSendOTP = async () => {
    if (!targetEmail) {
      toast.error("Email address is required.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("auth/resend-verification-otp", { email: targetEmail });
      setOtpSent(true);
      setCooldown(60);
      if (res?.data?.otp && String(res.data.otp).length === 6) {
        setOtp(String(res.data.otp).split(""));
      }
      toast.success("Verification code sent! Please check your email inbox.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Couldn't send a new code. Please try again."); // v332: calm copy
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = otp.join("");
    if (code.length < 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("auth/verify-email", { email: targetEmail, otp: code });
      if (data && data.success) {
        if (data.token) {
          safeStorage.setItem("ybex_token", data.token);
        }
        if (data.user) {
          safeStorage.setItem("ybex_user", JSON.stringify(data.user));
          setUser(data.user);
        }
        try { await refreshUser(); } catch (e) { ignored("PreStep_EmailVerify:82", e); }

        toast.success("Email verified successfully!");
        setStep(1);
        if (window.location.pathname.includes("/verify-email")) {
          navigate(`/onboarding?role=${roleParam}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      // Session 57: an already-verified email never logs in from here — go to Log in.
      if (err?.response?.data?.code === "ALREADY_VERIFIED") {
        toast.info("This email is already verified. Please log in.");
        navigate(`/login?email=${encodeURIComponent(targetEmail || "")}`);
        return;
      }
      setShake(true);
      setTimeout(() => setShake(false), 500);
      toast.error(err.response?.data?.detail || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number,
  ) => {
    const rawVal = e.target.value.replace(/\D/g, "");
    if (rawVal.length > 1) {
      const digits = rawVal.slice(0, 6).split("");
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setOtp(newOtp);
      const nextIdx = Math.min(index + digits.length, 5);
      inputs.current[nextIdx]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = rawVal;
    setOtp(newOtp);

    if (rawVal && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim().replace(/\D/g, "").slice(0, 6);
    if (pastedData) {
      const digits = pastedData.split("");
      const newOtp = ["", "", "", "", "", ""];
      digits.forEach((d, i) => {
        newOtp[i] = d;
      });
      setOtp(newOtp);
      const nextIdx = Math.min(digits.length - 1, 5);
      inputs.current[nextIdx]?.focus();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const displayEmail = targetEmail || "your email";
  const mmss = `00:${String(Math.max(0, cooldown)).padStart(2, "0")}`;
  const switchAccount = async () => {
    await logout();
    window.location.href = "/login";
  };

  // Session 39 (Ravi, M2): clean "Enter OTP" layout like the reference app — big title, the email
  // with an edit (switch account) icon, six boxes, "Resend code in 00:56", one Verify button.
  // Same calls and logic as before; DM Sans; no spam box (one short grey line instead).
  return (
    <div className="w-full flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full">
        <h2 className="text-[26px] font-bold tracking-[-0.6px] text-[#0A0A0A]">Enter verification code</h2>
        <p className="mt-3 text-[15px] leading-[1.5] font-medium text-[#6B7280]">Please enter the 6-digit code sent to</p>
        <div className="mt-1 flex items-center gap-2 min-w-0">
          <strong className="text-[16px] font-bold text-[#0A0A0A] truncate" data-testid="otp-email">{displayEmail}</strong>
          <button
            type="button"
            onClick={switchAccount}
            aria-label="Change email (log out / switch account)"
            className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[#7C3AED] hover:bg-[#F5F0FF]" /* v332: 40px tap target */
          >
            <Pencil size={17} />
          </button>
        </div>

        {!otpSent ? (
          <button
            onClick={handleSendOTP}
            disabled={loading}
            className="mt-8 w-full h-[52px] bg-[#7C3AED] text-white font-bold rounded-[14px] flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : null}
            Send code
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: shake ? [-10, 10, -10, 10, 0] : 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* v330: six 46px boxes + gaps were 326px wide and ran off 320/360px phones — boxes now shrink */}
            <div className="mt-7 flex gap-2 sm:gap-2.5 w-full max-w-[362px]">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${i + 1}`}
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleChange(e, i)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  onPaste={handlePaste}
                  className="flex-1 min-w-0 max-w-[52px] h-[54px] sm:h-[58px] text-center text-[22px] font-bold bg-white border-[1.5px] border-[#E5E5EA] rounded-[12px] focus:border-[#7C3AED] focus:ring-4 focus:ring-[#7C3AED]/15 outline-none text-[#0A0A0A] transition-all"
                />
              ))}
            </div>

            <div className="mt-6 text-[15px] font-semibold text-[#0A0A0A]">
              {cooldown > 0 ? (
                <>Resend code in <span className="text-[#8E8E93]">{mmss}</span></>
              ) : (
                <button type="button" onClick={handleSendOTP} disabled={loading} className="text-[#7C3AED] font-bold py-2 -my-2 disabled:opacity-50">{/* v330: taller tap area, dimmed while sending */}
                  Resend code
                </button>
              )}
            </div>
            <p className="mt-2 text-[12.5px] text-[#8E8E93]">Can't find it? Check your Spam or Promotions folder.</p>

            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.join("").length < 6}
              className="mt-8 w-full h-[52px] bg-[#7C3AED] text-white text-[15px] font-bold rounded-[14px] disabled:bg-[#EDEDF2] disabled:text-[#767680] flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : null}
              Verify email
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
