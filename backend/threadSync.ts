// Session 23. Live sync for deal actions.
//
// Before: each action handler decided on its own whether to tell the other party. Several did
// not (campaign negotiate, brand accept-counter, UGC revision…), so the other screen kept the
// old buttons ("Accept / Negotiate") until its 15-second safety poll ran — the "3–4 s, sometimes
// longer, laggy" feeling in testing.
//
// Now: after ANY successful POST/PUT/PATCH on a thread or order action route, one
// `thread_updated` goes to that thread's room + both parties + admins. It carries the new state
// fields from the handler's response (when it returns a `thread`), so the other screen can
// switch its buttons at once, and then re-reads messages/thread (coalesced on the client).
// A handler that already emits its own event is fine: the client merges both into one refresh.

import { emitThreadEvent } from "./socketAccess";

// Relative to the /api router.
const ACTION_ROUTE = /^\/(?:chat\/v2\/threads|campaign\/threads|ugc\/threads|ugc\/orders|ugc-orders)\/([^/?#]+)\/([^?#]+)$/;

// Plain chat traffic already has its own `new_message` event; nudging the whole thread for every
// chat line (or read receipt / typing) would re-download the thread each time.
const SKIP_ACTIONS = /^(messages|read|mark-read|typing|seen)(\/|$)/;

// Only state fields travel on the socket — never the full enriched record (profiles, contact
// details), which is re-read by each side through its own authorised request.
export const SYNC_FIELDS = [
  "status",
  "flow_state",
  "agreed_amount",
  "amount_fixed",
  "counter_amount",
  "payment_funded",
  "payment_status",
  "agreement_signed_creator",
  "agreement_signed_brand",
  "agreement_signed_at",
  "revision_count",
  "revisions_used",
  "revision_notes",
  "updated_at",
] as const;

export function matchThreadAction(path: string): { threadId: string; action: string } | null {
  const m = ACTION_ROUTE.exec(path || "");
  if (!m) return null;
  const threadId = decodeURIComponent(m[1]);
  const action = m[2];
  if (!threadId || threadId === "count" || SKIP_ACTIONS.test(action)) return null;
  return { threadId, action };
}

export function buildSyncPayload(threadId: string, body: any): any {
  const payload: any = { id: threadId, threadId, thread_id: threadId, _sync: true };
  const t = body && typeof body === "object" ? (body.thread || body.order || null) : null;
  if (t && typeof t === "object") {
    for (const k of SYNC_FIELDS) if (k in t) payload[k] = t[k];
    if (t.deal_id) payload.deal_id = t.deal_id;
  }
  return payload;
}

export function threadSyncMiddleware(getIo: (req: any) => any) {
  return (req: any, res: any, next: any) => {
    const method = String(req.method || "").toUpperCase();
    if (method !== "POST" && method !== "PUT" && method !== "PATCH") return next();
    const hit = matchThreadAction(req.path);
    if (!hit) return next();

    let body: any = null;
    const origJson = res.json.bind(res);
    res.json = (b: any) => { body = b; return origJson(b); };

    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      if (body && typeof body === "object" && (body.success === false || body.error)) return;
      const io = getIo(req);
      if (!io) return;
      try {
        emitThreadEvent(io, "thread_updated", buildSyncPayload(hit.threadId, body), hit.threadId);
      } catch (e: any) {
        console.warn("[threadSync] emit failed:", e?.message || e);
      }
    });
    next();
  };
}
