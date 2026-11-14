// Session 58: campaign targeting the brand fills in (gender, follower range, locations, how many creators, paid/barter).
// The columns didn't exist, so these were dropped on save and creators saw defaults. Columns added (migration
// session58_missing_columns); only real choices are saved — "Both" / "Any" / empty mean "not limited".
const int = (v: any, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

export function campaignTargeting(body: any) {
  const b = body || {};
  const g = String(b.gender || "").trim();
  const locs = Array.isArray(b.specific_locations) ? b.specific_locations : Array.isArray(b.locations) ? b.locations : [];
  const mode = String(b.collab_mode || "").trim();
  return {
    gender: g && !/^(both|any|all)$/i.test(g) ? g.slice(0, 20) : null,
    follower_min: b.follower_min == null ? null : int(b.follower_min, 0, 1e9),
    follower_max: b.follower_max == null ? null : int(b.follower_max, 0, 1e9),
    locations: locs.map((x: any) => String(x || "").trim().slice(0, 60)).filter(Boolean).slice(0, 25),
    max_creators: b.max_creators == null ? null : int(b.max_creators, 1, 1000),
    collab_mode: mode ? mode.slice(0, 20) : null,
    // Session 58 (Ravi, Q14): the brand's own Do's / Don'ts / Hashtags. Only saved when the form sends them,
    // so other callers (older apps, Eva) never wipe what the brand typed.
    ...(b.dos !== undefined ? { dos: briefLines(b.dos) } : {}),
    ...(b.donts !== undefined ? { donts: briefLines(b.donts) } : {}),
    ...(b.hashtags !== undefined ? { hashtags: hashtagList(b.hashtags) } : {}),
  };
}

/** Do's / Don'ts → one line per point (text column), max 10 points of 200 chars, null when empty. */
export function briefLines(v: any): string | null {
  const arr = Array.isArray(v) ? v : String(v ?? "").split(/\n|•/);
  const lines = arr.map((x: any) => String(x ?? "").replace(/^[-*\s]+/, "").trim().slice(0, 200)).filter(Boolean).slice(0, 10);
  return lines.length ? lines.join("\n") : null;
}

/** Hashtags → ["#tag", ...], letters / numbers / _ only, max 15. */
export function hashtagList(v: any): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/);
  const out: string[] = [];
  for (const x of arr) {
    const t = String(x ?? "").replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40);
    if (t && !out.includes(`#${t}`)) out.push(`#${t}`);
    if (out.length >= 15) break;
  }
  return out;
}

/** Today's date in India (YYYY-MM-DD) — deadlines are calendar days in IST. */
export const todayIst = (now = Date.now()) => new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
