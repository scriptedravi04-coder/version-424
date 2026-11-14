// Session 39 (M8, Ravi: "Finish later pe click ... dashboard khulna chahiye"): a creator who saved
// the basic details and taps "Finish later" goes straight to the dashboard and may use the app
// before the rest of onboarding. Kept per user on this device; Home's "Complete your profile"
// brings them back to the same step (progress itself lives on the server, rule 70).
const key = (uid) => `ybex_onboarding_later_${uid}`;

export function markFinishLater(uid) {
  if (!uid) return;
  try { localStorage.setItem(key(uid), "1"); } catch (e) { /* private mode: gate stays */ }
}
export function isFinishLater(uid) {
  if (!uid) return false;
  try { return localStorage.getItem(key(uid)) === "1"; } catch (e) { return false; }
}
export function clearFinishLater(uid) {
  if (!uid) return;
  try { localStorage.removeItem(key(uid)); } catch (e) { /* ignore */ }
}
