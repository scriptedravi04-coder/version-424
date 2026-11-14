import { api } from "./api";

// Contract signing = a verified email OTP. The server issues a one-time sign_token when a
// contract_sign code is verified, and every /sign route requires it (backend/signTokens.ts).

/** Sends the signing code to the signer's registered email. */
export async function sendContractOtp(email, extra = {}) {
  const res = await api.post("/otp/send", { value: email, target: "email", purpose: "contract_sign", ...extra });
  return res.data || {};
}

/** Verifies the code and returns the sign_token to pass to the /sign call. */
export async function verifyContractOtp(email, code) {
  const res = await api.post("/otp/verify", { value: email, code: String(code || "").trim() });
  const token = res.data?.sign_token;
  if (!token) throw new Error("Could not confirm the code for signing. Please request a new code.");
  return token;
}
