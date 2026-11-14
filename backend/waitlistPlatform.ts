// Session 40 (Ravi): the admin questionnaire showed "llak (YouTube)" for a creator who gave an
// Instagram handle and link. The label came from a stored `platform` field (old rows, CSV imports,
// onboarding) instead of what the creator actually gave us.
//
// Rule now, from real fields only (never from a handle we made up from the name):
//   Instagram given + YouTube given → "Instagram · YouTube"
//   Instagram given                 → "Instagram"
//   only YouTube given              → "YouTube"
//   nothing given                   → the stored platform, else "Instagram"
export type PlatformInput = {
  stored?: any;
  instagram?: any[]; // handles / links that would mean Instagram
  youtube?: any[];   // channel links that would mean YouTube
};

const clean = (v: any) => String(v ?? "").trim();
const isYoutubeText = (v: string) => /youtube\.com|youtu\.be/i.test(v);

export function platformLabel(input: PlatformInput): string {
  const ig = (input.instagram || []).map(clean).filter((v) => v && v !== "@" && !isYoutubeText(v));
  const yt = (input.youtube || []).map(clean).filter((v) => v && !/instagram\.com|instagr\.am/i.test(v));
  const hasIg = ig.length > 0;
  const hasYt = yt.length > 0;
  if (hasIg && hasYt) return "Instagram · YouTube";
  if (hasIg) return "Instagram";
  if (hasYt) return "YouTube";
  const s = clean(input.stored).toLowerCase();
  if (s === "youtube") return "YouTube";
  return "Instagram";
}

/** True when a row's label matches the admin filter ("All", "Instagram", "YouTube"). */
export function platformMatches(label: string, filter: string): boolean {
  if (!filter || filter === "All") return true;
  return String(label || "").split("·").map((p) => p.trim()).includes(filter);
}
