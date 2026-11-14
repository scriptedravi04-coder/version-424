// Session 58 (Eva handoff part 4, §8e): Eva settings — what Eva may read, her reply language, phone alerts,
// chat export and clear. Read / language switches are saved on the server (table eva_settings, Ravi approved)
// and copied to this phone, so Eva can check them instantly and they follow the user to every device.
// "Notify me from Eva" is kept on the server as one "mute" alert row, so it works on every phone and the
// alert job skips the bell + push for that user. Nothing here pays, publishes, invites or applies.
import { api } from "../../lib/api";
import { safeStorage } from "../../utils/storage";

export const EVA_DEFAULTS = { deals: true, money: true, lang: "en" };
export const EVA_LANGS = [["en", "English"], ["hinglish", "Hinglish"], ["hi", "Hindi"]];
export const MUTE_LABEL = "eva_mute";

const uidNow = () => { try { return String((JSON.parse(safeStorage.getItem("ybex_user") || "null") || {}).user_id || ""); } catch { return ""; } };
const key = (uid) => `ybex_eva_settings::${uid || uidNow()}`;

export function readEvaSettings(uid) {
  try {
    const v = JSON.parse(window.localStorage.getItem(key(uid)) || "null");
    if (!v || typeof v !== "object") return { ...EVA_DEFAULTS };
    return {
      deals: v.deals !== false,
      money: v.money !== false,
      lang: EVA_LANGS.some(([k]) => k === v.lang) ? v.lang : "en",
    };
  } catch { return { ...EVA_DEFAULTS }; }
}
export function writeEvaSettings(next, uid) {
  const s = { ...readEvaSettings(uid), ...next };
  try { window.localStorage.setItem(key(uid), JSON.stringify(s)); } catch { /* private mode: this session only */ }
  return s;
}

// v328: bumps on every local change, so a sync that started before it doesn't overwrite the newer phone copy.
let localSaves = 0;
/** Server copy → this phone (called when Eva opens). Server down → the phone copy keeps working. */
export async function syncEvaSettings() {
  const startedAt = localSaves;
  try {
    const { data } = await api.get("assist/settings", { timeout: 15000, bypassCache: true });
    if (localSaves !== startedAt) return readEvaSettings(); // v328: the user changed a switch meanwhile — keep it
    if (data?.ok && data.settings) return writeEvaSettings(data.settings);
  } catch { /* phone copy */ }
  return readEvaSettings();
}
/** Change a setting: this phone at once, the server in the background. */
export function saveEvaSettings(patch) {
  localSaves += 1; // v328
  const s = writeEvaSettings(patch);
  api.put("assist/settings", s, { timeout: 15000 }).catch(() => null);
  return s;
}

/** The switch names as the user sees them. */
export const toggleLabel = (which, role) => (which === "deals" ? "Deals & offers" : role === "brand" ? "Payments & reports" : "Earnings & payouts");

// Which Eva tasks read what. Deals & offers = invitations, applicants, due work, revisions, live links.
const READS = {
  creator: { myDeals: "deals", myUgc: "deals", due: "deals", invites: "deals", brief: "deals", checklist: "deals", earnings: "money", kyc: "money", share: "money" },
  brand: { applicants: "deals", alerts: "deals", status: "deals", report: "money" },
};
/** null = allowed; otherwise the switch that is off. */
export function blockedSwitch(role, intent, s = readEvaSettings()) {
  const need = READS[role === "brand" ? "brand" : "creator"][intent];
  if (!need) return null;
  return s[need] === false ? need : null;
}
/** Eva's answer when a switch is off. */
export function blockedReply(role, which) {
  return `I can't read your ${toggleLabel(which, role).toLowerCase()} right now — switch on "${toggleLabel(which, role)}" in Eva settings and ask me again.`;
}

// ── "Notify me from Eva" (server) ────────────────────────────────────────────────────────────────────
export async function evaAlertsOn() {
  try {
    const { data } = await api.get("assist/saved-searches", { timeout: 15000, bypassCache: true });
    if (!data?.ok) return null;
    return !(Array.isArray(data.searches) ? data.searches : []).some((s) => s.label === MUTE_LABEL);
  } catch { return null; }
}
export async function setEvaAlerts(on) {
  try {
    if (!on) {
      const { data } = await api.post("assist/saved-searches", { label: MUTE_LABEL, filters: { kind: "mute" } }, { timeout: 15000 });
      return Boolean(data?.ok);
    }
    const { data } = await api.get("assist/saved-searches", { timeout: 15000, bypassCache: true });
    const row = (Array.isArray(data?.searches) ? data.searches : []).find((s) => s.label === MUTE_LABEL);
    if (!row) return true;
    const r = await api.delete(`assist/saved-searches/${encodeURIComponent(row.id)}`, { timeout: 15000 });
    return Boolean(r?.data?.ok);
  } catch { return false; }
}

/** Emails every Eva chat to the user's own email → { ok, chats } */
export async function exportEvaChats() {
  try { const { data } = await api.post("assist/export", {}, { timeout: 30000 }); return { ok: Boolean(data?.ok), chats: Number(data?.chats) || 0, empty: data?.code === "NO_CHATS" }; } catch (e) { return { ok: false, chats: 0, limit: e?.response?.status === 429 }; } // Session 58: 3 a day
}

/** History search: by title and the last line. */
export function filterChats(list, q) {
  const t = String(q || "").trim().toLowerCase();
  if (!t) return list || [];
  return (list || []).filter((c) => `${c.title || ""} ${c.preview || ""}`.toLowerCase().includes(t));
}
