import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { pickDealTxn } from "../lib/dealTxn";

// v333: the chat header pill, the payout card and the receipt all read the SAME payout row, so the creator
// sees one number everywhere (₹11,700 = what reaches the bank; the full breakup is in the receipt).
// One request per screen: the transaction list is shared for 20 seconds.
let shared = { at: 0, promise: null };
const fetchRows = (fetcher) => {
  if (shared.promise && Date.now() - shared.at < 20000) return shared.promise;
  shared = {
    at: Date.now(),
    promise: (fetcher ? fetcher() : api.get("transactions")).then(({ data }) => (Array.isArray(data) ? data : [])).catch((e) => {
      shared = { at: 0, promise: null };
      throw e;
    }),
  };
  return shared.promise;
};
export const forgetDealPayoutRows = () => { shared = { at: 0, promise: null }; };

export const threadDealIds = (thread) =>
  [thread?.campaign_deal_id, thread?.deal_id, thread?.ugc_order_id, thread?.id].filter(Boolean);

// `fetcher` lets a locked chat screen keep its own GET /transactions call (protectedFlows screen check).
export default function useDealPayoutRow(thread, { skip = false, fetcher = null } = {}) {
  const [row, setRow] = useState(null);
  const [loaded, setLoaded] = useState(Boolean(skip));
  const key = threadDealIds(thread).join("|");
  useEffect(() => {
    if (skip || !key) { setLoaded(true); return undefined; }
    let alive = true;
    fetchRows(fetcher)
      .then((rows) => { if (alive) setRow(pickDealTxn(rows, key.split("|"))); })
      .catch(() => null)
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [key, skip]);
  return { row, loaded, refetch: async () => { forgetDealPayoutRows(); const rows = await fetchRows(fetcher); const r = pickDealTxn(rows, key.split("|")); setRow(r); return r; } };
}
