// Session 39 (Ravi: "navbar ki jarurat ho usi page pr dikha, har page pr mat dikha"):
// the creator bottom bar shows only on the five main pages. Some "pages" are screens drawn
// inside one route (Profile sub-screens, the UGC brief / workspace view), so they tell the
// layout to hide the bar with useHideBottomNav(true) while they are open.
import { useEffect, useSyncExternalStore } from "react";

let hiders = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function subscribeBottomNav(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function isBottomNavHidden() {
  return hiders > 0;
}
export function useBottomNavHidden() {
  return useSyncExternalStore(subscribeBottomNav, isBottomNavHidden, isBottomNavHidden);
}
/** Call with true while an inner screen is open; the bar comes back when it closes or unmounts. */
export function useHideBottomNav(hide) {
  useEffect(() => {
    if (!hide) return undefined;
    hiders += 1;
    emit();
    return () => {
      hiders = Math.max(0, hiders - 1);
      emit();
    };
  }, [hide]);
}

/** The five creator pages that carry the bottom bar (Home, Campaigns, Explore UGC, Inbox, Profile). */
export function isCreatorNavPage(pathname, search = "") {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  const q = new URLSearchParams(search || "");
  if (p === "/" || p === "/dashboard") return true;
  if (p === "/campaigns") return true;
  if (p === "/creator/ugc" || p === "/ugc") return !q.get("orderId") && !q.get("order_id") && !q.get("dealId") && !q.get("brief");
  if (p === "/creator/inbox" || p === "/inbox" || p === "/chat") return true; // thread view hides it separately
  if (p === "/creator/profile" || p === "/profile" || p === "/creator/settings") return !q.get("section");
  return false;
}

/** Session 43 (Ravi: "navbar sirf jahan zaroorat hai"): the brand bar only on its main pages —
 *  Dashboard, Explore list, Manage lists, Inbox, Brand account. Creator profiles, wizards, order
 *  details, legal pages and the like go back with the phone's back instead. */
export function isBrandNavPage(pathname, search = "") {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  const q = new URLSearchParams(search || "");
  if (p === "/brand" || p === "/brand/dashboard" || p === "/dashboard") return true;
  if (p === "/brand/discover" || p === "/creators" || p === "/explore") return true;
  if (p === "/brand/campaigns") return true;
  if (p === "/brand/ugc" || p === "/brand/ugc/orders" || p === "/brand/ugc/briefs" || p === "/brand/ugc/instant") {
    return !q.get("orderId") && !q.get("order_id") && !q.get("brief") && !q.get("id");
  }
  if (p === "/brand/inbox" || p === "/inbox" || p === "/chat") return true;
  if (p === "/brand/account") return !q.get("section");
  return false;
}
