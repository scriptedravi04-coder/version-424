// v396 (QA E-7): when a brand paid, the creator only got a chat line — no notification, no e-mail ("Deal confirmed: the
// payment is held safely" existed in activityEmailCopy but nothing sent it). The payment code is LOCKED
// (payment_routes.ts persistEscrowPayment), so this small job looks for campaign payments made in the last 20 minutes
// and tells the creator once (key `escrownotif:<txn id>` in ybex_ephemeral, kept 3 days).
import { ephemeralGet, ephemeralSet } from "./ephemeralStore";

const WINDOW_MS = 20 * 60 * 1000;
const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Pure: is this transaction a fresh, funded campaign payment the creator should hear about? */
export function isFreshFundedDeal(tx: any, now = Date.now()): boolean {
  if (!tx || !tx.deal_id || !tx.creator_id) return false;
  if (tx.ugc_order_id || tx.brief_id) return false;
  if (String(tx.status || "").toUpperCase() !== "SUCCESS") return false;
  const ps = String(tx.payout_status || "").toUpperCase();
  if (ps && ps !== "PENDING") return false;
  if (String(tx.refund_status || "").toUpperCase() === "PROCESSED") return false;
  const t = Date.parse(tx.created_at || "");
  return Number.isFinite(t) && now - t <= WINDOW_MS && now - t >= 0;
}

/** Pure: the creator's message. */
export function escrowHeldMessage(tx: any, campaignTitle?: string | null): string {
  const amount = Number(tx?.gross_amount) || 0;
  const what = campaignTitle ? ` for "${String(campaignTitle).slice(0, 80)}"` : "";
  return `The brand paid ${amount > 0 ? fmt(amount) : "the deal amount"}${what}. Ybex holds it safely until your work is approved — you can start now.`;
}

export function startEscrowNotify(deps: { client: () => any; sendNotification: (db: any, userId: string, type: string, message: string) => Promise<any> }) {
  let running = false;
  const tick = async () => {
    if (running) return;
    const c = deps.client();
    if (!c) return;
    running = true;
    try {
      const since = new Date(Date.now() - WINDOW_MS).toISOString();
      const { data, error } = await c.from("transactions").select("id, deal_id, creator_id, gross_amount, status, payout_status, refund_status, ugc_order_id, brief_id, created_at, campaign_deal_id").gte("created_at", since).limit(200);
      if (error || !Array.isArray(data)) return;
      for (const tx of data) {
        if (!isFreshFundedDeal(tx)) continue;
        const key = `escrownotif:${tx.id}`;
        if (await ephemeralGet(key)) continue;
        await ephemeralSet(key, { at: new Date().toISOString() }, 3 * 24 * 3600 * 1000);
        let title: string | null = null;
        try {
          const { data: d } = await c.from("deals").select("campaign_id").eq("id", tx.deal_id).maybeSingle();
          if (d?.campaign_id) {
            const { data: cp } = await c.from("campaigns").select("title").eq("campaign_id", d.campaign_id).maybeSingle();
            title = cp?.title || null;
          }
        } catch { /* title is optional */ }
        // type ESCROW_FUNDED → activityEmailCopy: "Deal confirmed: the payment is held safely. Work can start."
        await deps.sendNotification(null, String(tx.creator_id), "ESCROW_FUNDED", escrowHeldMessage(tx, title)).catch(() => {});
      }
    } catch (e: any) {
      console.warn("[escrow-notify]", e?.message || e);
    } finally { running = false; }
  };
  const timer: any = setInterval(tick, 10 * 60 * 1000); // v429 (Supabase log limit): every 10 min (v422: 5, before: 1) — the 20-min look-back still covers it
  if (timer && typeof timer.unref === "function") timer.unref();
  setTimeout(tick, 15 * 1000);
  return { tick, stop: () => clearInterval(timer) };
}
