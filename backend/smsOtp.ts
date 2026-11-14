// v376 (Ravi: "Instagram username + phone number, sirf phone OTP"): sends the 6-digit sign-in code by SMS.
//
// Providers (set ONE in the server secrets / YBEX_ENV — until then the phone option is hidden in the app):
//   FAST2SMS_API_KEY                         Fast2SMS "OTP" route (no DLT template needed; website verification
//                                            in the Fast2SMS dashboard is required once). fast2sms.com → Dev API.
//   MSG91_AUTH_KEY + MSG91_OTP_TEMPLATE_ID   MSG91 OTP API (needs a DLT-approved OTP template with ##OTP##).
// v378 (Ravi: Fast2SMS "Smart OTP" — WhatsApp or DLT SMS template, no ₹7 Quick SMS):
//   FAST2SMS_API_KEY + FAST2SMS_OTP_ID        Fast2SMS Smart OTP API (POST /dev/otp/send, our own 6-digit code).
//   FAST2SMS_OTP_CHANNEL = whatsapp | sms     what the app tells the user ("on WhatsApp" / "by SMS"); default whatsapp.
//   With FAST2SMS_OTP_ID set, the old "otp" route is not used (Fast2SMS removed it from new accounts).
// Only Indian mobiles (+91, 10 digits starting 6–9). The code itself is made and checked by backend/loginOtp.ts.
import axios from "axios";

/** "98765 43210", "+91-9876543210", "919876543210" → "9876543210", or "" when not a valid Indian mobile. Pure. */
export function indianMobile(v: any): string {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : "";
}

export type SmsProvider = "fast2sms_smart" | "fast2sms" | "msg91" | null;
export function smsProvider(env: Record<string, string | undefined> = process.env): SmsProvider {
  if (String(env.FAST2SMS_API_KEY || "").trim() && String(env.FAST2SMS_OTP_ID || "").trim()) return "fast2sms_smart";
  if (String(env.FAST2SMS_API_KEY || "").trim()) return "fast2sms";
  if (String(env.MSG91_AUTH_KEY || "").trim() && String(env.MSG91_OTP_TEMPLATE_ID || "").trim()) return "msg91";
  return null;
}

/** Where the code arrives, for the app's wording. Pure. */
export function otpChannel(env: Record<string, string | undefined> = process.env): "whatsapp" | "sms" {
  if (smsProvider(env) !== "fast2sms_smart") return "sms";
  return String(env.FAST2SMS_OTP_CHANNEL || "whatsapp").trim().toLowerCase() === "sms" ? "sms" : "whatsapp";
}

/** Sends the code. Resolves { ok } — never throws, never logs the code. */
export async function sendSmsOtp(mobile10: string, code: string, env: Record<string, string | undefined> = process.env): Promise<{ ok: boolean; error?: string }> {
  const provider = smsProvider(env);
  if (!provider) return { ok: false, error: "SMS is not set up on the server." };
  try {
    if (provider === "fast2sms_smart") {
      const { data } = await axios.post("https://www.fast2sms.com/dev/otp/send",
        { mobile: mobile10, otp_id: String(env.FAST2SMS_OTP_ID).trim(), otp: code, otp_length: code.length, otp_expiry: 10 },
        { headers: { authorization: String(env.FAST2SMS_API_KEY).trim(), "Content-Type": "application/json" }, timeout: 10000 });
      if (data && (data.return === true || data.status === true || data.success === true || String(data.status || "").toLowerCase() === "success")) return { ok: true };
      return { ok: false, error: String((data && (Array.isArray(data.message) ? data.message.join(" ") : data.message)) || "Fast2SMS refused the OTP.") };
    }
    if (provider === "fast2sms") {
      const { data } = await axios.post("https://www.fast2sms.com/dev/bulkV2",
        { route: "otp", variables_values: code, numbers: mobile10, flash: 0 },
        { headers: { authorization: String(env.FAST2SMS_API_KEY).trim(), "Content-Type": "application/json" }, timeout: 10000 });
      if (data && data.return === true) return { ok: true };
      return { ok: false, error: String((data && (Array.isArray(data.message) ? data.message.join(" ") : data.message)) || "Fast2SMS refused the message.") };
    }
    const { data } = await axios.post(
      `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(String(env.MSG91_OTP_TEMPLATE_ID).trim())}&mobile=91${mobile10}&otp=${code}`,
      {}, { headers: { authkey: String(env.MSG91_AUTH_KEY).trim(), "Content-Type": "application/json" }, timeout: 10000 });
    if (data && String(data.type || "").toLowerCase() === "success") return { ok: true };
    return { ok: false, error: String((data && data.message) || "MSG91 refused the message.") };
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || "SMS send failed";
    return { ok: false, error: String(Array.isArray(msg) ? msg.join(" ") : msg).slice(0, 200) };
  }
}
