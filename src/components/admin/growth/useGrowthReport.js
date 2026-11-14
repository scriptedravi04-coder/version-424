import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";

// Session 46: loads GET /admin/growth once when the Overview opens. `reload` bypasses both the
// browser's 10-second GET cache and the server's 60-second cache.
export default function useGrowthReport() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(async (fresh) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.get(fresh ? "admin/growth?refresh=1" : "admin/growth", fresh ? { bypassCache: true } : undefined);
      setState({ loading: false, error: null, data: res?.data || null });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.detail || "Could not load the growth numbers.";
      setState((s) => ({ loading: false, error: msg, data: s.data }));
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const reload = useCallback(() => load(true), [load]);
  return { ...state, reload };
}
