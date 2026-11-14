import React from "react";
import { Lock, Mail } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SignWithOtpBox(props) {
  const { handleDigitChange, handleKeyDown, handleSendMobileOTP, inputRefs, maskedEmail, otpDigits, resendCooldown, sendingOtp, termsAccepted } = props;
  return (
    <div className={`rounded-[18px] border border-[#D8B4FE]/70 bg-[#FAF7FF] p-4 space-y-3 shadow-2xs transition ${termsAccepted ? "" : "opacity-50 pointer-events-none"}`} aria-disabled={!termsAccepted}>
            {!termsAccepted && <div className="text-[11.5px] font-semibold text-[#7C3AED]">Tick both boxes above to get your code.</div>}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[13px] text-[#0A0A0A]">
                <Lock size={14} className="text-[#7C3AED]" />
                <span>Sign with OTP</span>
              </div>
              {/* Full address on its own line so it never gets cut (session 23). */}
              <div className="text-[12px] text-[#6B7280] flex items-start gap-1.5 min-w-0">
                <Mail size={12} className="mt-[2px] shrink-0" />
                <span className="min-w-0 break-all">
                  {/* v332: it said "Code sent" before any code was sent */}
                  {termsAccepted ? "Code sent to" : "Your code will go to"} <strong className="text-[#0A0A0A]">{maskedEmail}</strong>
                </span>
              </div>
            </div>

            {/* 6 Digit Inputs */}
            <div>
              {/* v330: six fixed 44px boxes overflowed a 320px screen — boxes now share the row */}
              <div className="flex justify-between gap-1.5">
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    aria-label={`Digit ${index + 1}`} /* v330 */
                    className="flex-1 min-w-0 max-w-[44px] h-12 text-center text-lg font-bold font-mono bg-white border border-[#DDD0FF] rounded-xl text-[#0A0A0A] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 outline-none transition-all shadow-2xs"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between mt-2.5 text-[11px] text-[#6B7280]">
                <span>Registered email · cannot be changed</span>
                {resendCooldown > 0 ? (
                  <span className="font-semibold text-[#7C3AED]">
                    {/* v330: 60s read "0:60" */}
                    Resend in {Math.floor(resendCooldown / 60)}:{String(resendCooldown % 60).padStart(2, "0")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendMobileOTP(false)}
                    disabled={sendingOtp}
                    className="font-bold text-[#7C3AED] hover:underline cursor-pointer disabled:opacity-50 py-2.5 pl-3 -my-2.5" /* v332: bigger tap area */
                  >
                    {sendingOtp ? "Sending…" : "Resend OTP"}
                  </button>
                )}
              </div>
            </div>
          </div>
  );
}
