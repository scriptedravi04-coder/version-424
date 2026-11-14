import { useEffect, useState } from "react";
import { api } from "./api";

// Session 36: creators Featured by the referral programme (shown first, with a "Featured" label).
let cache = null;
export function featuredFirst(list, featured) {
  if (!featured || featured.size === 0) return list;
  const mark = (c) => (featured.has(c?.user_id) ? { ...c, is_featured: true } : c);
  return [...list.filter((c) => featured.has(c?.user_id)).map(mark), ...list.filter((c) => !featured.has(c?.user_id))];
}
export default function useFeaturedCreators() {
  const [set, setSet] = useState(cache || new Set());
  useEffect(() => {
    if (cache) return;
    api.get("creators/featured").then((r) => {
      cache = new Set((r.data?.featured || []).map((f) => f.user_id));
      setSet(cache);
    }).catch(() => {});
  }, []);
  return set;
}
