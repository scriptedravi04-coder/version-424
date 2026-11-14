// Session 36 (Ravi): delivered video files are kept for 15 days after the delivery is approved
// (or the order is cancelled), then the nightly cleanup deletes them (Supabase function
// cleanup-old-submissions, option B — pending reviews are never deleted). One place for the
// number and the wording, used by the approve popups, the payout cards and the order screens.
export const RETENTION_DAYS = 15;

/** Date the file stays downloadable until, from the approval / payout time. null if unknown. */
export function availableUntil(fromDate) {
  if (!fromDate) return null;
  const d = new Date(fromDate);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function formatUntil(date) {
  if (!date) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** One sentence for the screen. role: "brand" | "creator". fromDate may be missing. */
export function retentionLine(role, fromDate) {
  const until = formatUntil(availableUntil(fromDate));
  const when = until ? `until ${until}` : `for ${RETENTION_DAYS} days`;
  return role === "brand"
    ? `You can download this content ${when}. After that the file is deleted, so save your copy.`
    : `Your delivered content stays available to download ${when}. After that it is deleted, so keep your own copy.`;
}

/** For approve popups (before approval, so no date yet). */
export const APPROVE_NOTICE = `Files are kept for ${RETENTION_DAYS} days after approval. Please download them in that time.`;

export const FILE_REMOVED_TEXT = `This file is no longer available. Delivered files are kept for ${RETENTION_DAYS} days after approval.`;
