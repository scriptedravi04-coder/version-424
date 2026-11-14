import { publicOrigin } from "../lib/publicUrl";
// Session 24. The one referral code format, and the one the server matches at signup
// (backend/auth_routes.ts: "YBEX-" + first 8 characters of the user id, case-insensitive).
// The screens used to build NAME + 4 id chars, which the server never recognised, so no
// referral was ever recorded.
export function referralCodeFor(user) {
  const id = String(user?.user_id || user?.id || "").replace(/-/g, "");
  return id ? `YBEX-${id.slice(0, 8).toUpperCase()}` : "";
}

export function referralLinkFor(user) {
  const code = referralCodeFor(user);
  return code ? `${publicOrigin()}/signup?ref=${code}` : `${publicOrigin()}/signup`;
}

/** Reward text only when the server has a configured amount — never an assumed ₹500/₹1,000. */
export function referralRewardText(stats) {
  const n = Number(stats?.reward_amount);
  return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString("en-IN")}` : null;
}
