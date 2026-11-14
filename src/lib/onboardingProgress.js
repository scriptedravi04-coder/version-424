// Session 34 (Ravi): onboarding answers + the current step are saved on the SERVER after every
// step (backend/onboardingProgress.ts), so a creator or brand continues exactly where they left —
// on any device. Desktop and mobile have different screens, so a position is saved twice:
//   page = the shared step name (same on every device), pos = this flow's own screen.
// Same flow → its own screen comes back. Other device → the screen for that page.
// Temporary popups (OTP, Instagram details, add-channel) are not reopened — the page under them is.
import { api } from "./api";

// ---------- Creator ----------
export const CREATOR_PAGES = ["identity", "about", "location", "languages", "channels", "channels_linked", "rates", "barter", "past_work"];

const CREATOR_MOBILE_SCREEN = { identity: 1, about: 2, location: 3, languages: 4, channels: 5, channels_linked: 7, rates: 8, barter: 9, past_work: 10 };
const CREATOR_SCREEN_PAGE = { 1: "identity", 2: "about", 3: "location", 4: "languages", 5: "channels", 6: "channels", 7: "channels_linked", 8: "rates", 9: "barter", 10: "past_work" };

export function creatorPageFromMobile(screen) {
  return CREATOR_SCREEN_PAGE[Number(screen)] || "identity";
}

export function creatorMobileScreen(page, answers = {}) {
  if (page === "channels_linked" && !answers?.instagramConnectedVia) return 5;
  return CREATOR_MOBILE_SCREEN[page] || 1;
}

export function creatorPageFromDesktop(step, sub) {
  const s = Number(step);
  if (s <= 1) return Number(sub) === 2 ? "about" : "identity";
  if (s === 2) return "location";
  if (s === 3) return "channels";
  return "rates";
}

/** Desktop step 1 has photo/name/IG/DOB/gender on part 1 and niche/bio on part 2. */
export function creatorDesktopPos(page, answers = {}) {
  const a = answers || {};
  switch (page) {
    case "identity": return { step: 1, sub: 1 };
    case "about": return (a.dobDay && a.dobMonth && a.dobYear && a.gender) ? { step: 1, sub: 2 } : { step: 1, sub: 1 };
    case "location": case "languages": return { step: 2, sub: 1 };
    case "channels": case "channels_linked": return { step: 3, sub: 1 };
    case "rates": case "barter": case "past_work": return { step: 4, sub: 1 };
    default: return { step: 1, sub: 1 };
  }
}

// ---------- Brand ----------
// Ravi: basic details first → the account-manager page (designation + mobile) now comes right
// after the company name, on mobile and desktop.
export const BRAND_PAGES = ["identity", "manager", "industry", "about", "presence", "channels", "campaign", "campaign_more"];
const BRAND_MOBILE_SCREEN = { identity: 1, manager: 4, industry: 2, about: 3, presence: 5, channels: 5, campaign: 6, campaign_more: 7 };
const BRAND_SCREEN_PAGE = { 1: "identity", 4: "manager", 2: "industry", 3: "about", 5: "channels", 6: "campaign", 7: "campaign_more" };
/** Mobile screen order after session 34 (screen numbers kept, order changed). */
export const BRAND_MOBILE_ORDER = [1, 4, 2, 3, 5, 6, 7];

export const brandPageFromMobile = (screen) => BRAND_SCREEN_PAGE[Number(screen)] || "identity";
export const brandMobileScreen = (page) => BRAND_MOBILE_SCREEN[page] || 1;

export function brandPageFromDesktop(step, sub) {
  const s = Number(step);
  if (s === 1) return Number(sub) === 2 ? "about" : "identity";
  if (s === 2) return "manager";
  if (s === 3) return Number(sub) === 2 ? "channels" : "presence";
  return "campaign";
}

export function brandDesktopPos(page) {
  switch (page) {
    case "manager": return { step: 2, sub: 1 };
    case "industry": case "about": return { step: 1, sub: 2 };
    case "presence": return { step: 3, sub: 1 };
    case "channels": return { step: 3, sub: 2 };
    case "campaign": case "campaign_more": return { step: 4, sub: 1 };
    default: return { step: 1, sub: 1 };
  }
}

// ---------- Resume ----------
/**
 * Where should THIS flow open? `progress` = server row. Returns { step, sub } for desktop flows,
 * { screen } for mobile flows, or null when nothing is saved.
 */
export function resumeFor(flow, progress) {
  if (!progress || !progress.page) return null;
  const answers = progress.answers || {};
  const same = progress.flow === flow && progress.pos;
  switch (flow) {
    case "creator_mobile": {
      if (same) {
        const s = Number(progress.pos.step);
        if (s === 6) return { screen: 5 }; // Instagram details sheet → the channels page under it
        if (s >= 1 && s <= 10) return { screen: s };
      }
      return { screen: creatorMobileScreen(progress.page, answers) };
    }
    case "creator_desktop":
      if (same && progress.pos.step >= 1 && progress.pos.step <= 4) return { step: progress.pos.step, sub: progress.pos.sub === 2 ? 2 : 1 };
      return creatorDesktopPos(progress.page, answers);
    case "brand_mobile": {
      if (same && BRAND_MOBILE_ORDER.includes(Number(progress.pos.step))) return { screen: Number(progress.pos.step) };
      return { screen: brandMobileScreen(progress.page) };
    }
    case "brand_desktop":
      if (same && progress.pos.step >= 1 && progress.pos.step <= 4) return { step: progress.pos.step, sub: progress.pos.sub === 2 ? 2 : 1 };
      return brandDesktopPos(progress.page);
    default:
      return null;
  }
}

// ---------- Basics ----------
export const phoneDigits = (p) => String(p || "").replace(/\D/g, "");
/** Same rule as sign-up: Indian 10-digit number starting 6–9. */
export const isValidIndianMobile = (d) => /^[6-9]\d{9}$/.test(phoneDigits(d).replace(/^91(?=\d{10}$)/, ""));
/** Google sign-ups can arrive without a mobile number. */
export const userNeedsPhone = (user) => phoneDigits(user?.phone).length < 6;

// ---------- Server ----------
export async function loadProgress() {
  try {
    const { data } = await api.get("onboarding/progress", { bypassCache: true });
    return data?.progress || null;
  } catch {
    return null;
  }
}

/**
 * Never throws. Returns the server answer, or { success: false, error } so the screen can tell.
 * @param {{ flow: string, page: string, pos?: any, answers?: any, basicsDone?: boolean, phone?: string }} p
 */
export async function saveProgress({ flow, page, pos, answers, basicsDone, phone = undefined }) {
  try {
    const body = { flow, page, pos, answers, basics_done: Boolean(basicsDone) };
    if (phone) body.phone = phone;
    const { data } = await api.post("onboarding/progress", body);
    return data || { success: true };
  } catch (e) {
    return { success: false, error: e?.response?.data?.detail || "Could not save your progress.", code: e?.response?.data?.code };
  }
}
