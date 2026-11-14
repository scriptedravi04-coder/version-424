// Session 34: one 18+ rule for onboarding (desktop Step1_Identity has the same check).
/** Age in whole years from day / month / year strings, or null when the date is not real. */
export function ageFromDob(day, month, year, now = new Date()) {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!d || !m || !y || String(year).length !== 4) return null;
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== m - 1 || dob.getUTCDate() !== d) return null;
  // v346: age by the Asia/Kolkata calendar date (IST = UTC+5:30, no DST), not UTC — on an Indian
  // user's 18th birthday between 00:00 and 05:29 IST they were still shown as 17.
  const ist = new Date(new Date(now).getTime() + 5.5 * 3600 * 1000);
  let age = ist.getUTCFullYear() - y;
  const before = ist.getUTCMonth() < m - 1 || (ist.getUTCMonth() === m - 1 && ist.getUTCDate() < d);
  if (before) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}
// v365 (Ravi: "14+ creators bhi, parents ki permission ki need nahi"): Ybex is open from 14. isUnder18 stays as a plain
// helper; the sign-up / onboarding gate uses MIN_AGE.
export const MIN_AGE = 14;
export const isUnderMinAge = (day, month, year, now) => {
  const a = ageFromDob(day, month, year, now);
  return a !== null && a < MIN_AGE;
};
export const isUnder18 = (day, month, year, now) => {
  const a = ageFromDob(day, month, year, now);
  return a !== null && a < 18;
};
