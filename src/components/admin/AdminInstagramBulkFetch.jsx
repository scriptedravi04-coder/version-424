import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

// v354 (Ravi: "admin panel se ek button — sab creators + unclaimed + waitlist ka Instagram fetch ho jaaye; photo sirf
// unka jinki uploaded nahi hai").
// v363 (Ravi: "waitlist mai fetch hi nahi kar raha"): the server can't keep a job running between requests on our
// hosting, so this screen now drives the run — it asks POST /admin/creators/instagram-bulk/step for the next few again
// and again until nothing is left. Pending waitlist goes first. Keep this page open while it runs.

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export default function AdminInstagramBulkFetch({ compact = false, onProgress }) {
  const [cfg, setCfg] = useState(null);
  const [force, setForce] = useState(false);
  const [run, setRun] = useState(null); // { running, total, fresh, remaining, done, failed, photos, errors, waiting_until }
  const stopRef = useRef(false);

  useEffect(() => {
    let alive = true;
    api.get("admin/creators/instagram-bulk", { bypassCache: true }).then(({ data }) => { if (alive) setCfg(data); }).catch(() => { if (alive) setCfg({ configured: false }); });
    return () => { alive = false; stopRef.current = true; };
  }, []);

  const start = async () => {
    stopRef.current = false;
    const since = Date.now();
    const skip = [];
    const st = { running: true, total: 0, fresh: 0, remaining: null, done: 0, failed: 0, photos: 0, errors: [], waiting_until: null };
    setRun({ ...st });
    let rounds = 0;
    try {
      while (!stopRef.current && rounds < 2000) {
        rounds += 1;
        let data;
        try { ({ data } = await api.post("admin/creators/instagram-bulk/step", { mode: force ? "old" : "new", since, skip }, { timeout: 60000 })); } // v373: new only, unless "refresh old" is ticked
        catch (e) {
          if (e?.response?.status === 503 || e?.response?.status === 403) { toast.error(e?.response?.data?.error || "Couldn't start."); break; }
          st.errors = [...st.errors, "Network hiccup — retrying…"].slice(-6); setRun({ ...st }); await sleep(4000); continue;
        }
        st.total = data.total; st.fresh = data.fresh; st.remaining = data.remaining;
        st.done += data.done?.length || 0; st.photos += data.photos || 0;
        for (const f of data.failed || []) { skip.push(f.key); st.failed += 1; st.errors = [...st.errors, `@${f.who}: ${f.error}`].slice(-8); }
        st.waiting_until = data.waiting_until || null; st.reserved = Boolean(data.reserved);
        setRun({ ...st });
        if (rounds % 8 === 0) onProgress?.();
        if (!data.remaining) break;
        if (data.waiting_until) { await sleep(Math.min(Math.max(Date.parse(data.waiting_until) - Date.now(), 15000), 5 * 60 * 1000)); continue; }
        await sleep(400);
      }
    } finally {
      st.running = false; st.waiting_until = null; setRun({ ...st });
      onProgress?.();
      if (!stopRef.current) toast.success(`Instagram fetch done · ${st.done} updated${st.failed ? ` · ${st.failed} failed` : ""}`);
    }
  };

  if (!cfg) return null;
  const total = run?.total || 0;
  const handled = total ? total - (run?.remaining ?? total) : 0;
  const pct = total ? Math.round((handled / total) * 100) : 0;
  const waiting = run?.running && run?.waiting_until ? new Date(run.waiting_until).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;

  // v419 (Ravi: "itna bada box koi nahi padhta — Upload CSV ke bagal mein chhota sa button + tick"): one small row.
  // Auto refresh now = only creators who use the app, 50 a day in turns (server); this button = never-fetched ones,
  // the tick also redoes ones fetched 7+ days ago.
  return (
    <div className="inline-flex flex-col items-end gap-1" data-testid="admin-ig-bulk">
      <div className="inline-flex items-center gap-2">
        {run?.running ? (
          <button type="button" onClick={() => { stopRef.current = true; }} title="Stop fetching"
            className="h-9 px-3 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
            <RefreshCw size={13} className="animate-spin" /> {total ? `${handled}/${total}` : "…"} · Stop
          </button>
        ) : (
          <button type="button" onClick={start} disabled={!cfg.configured} data-testid="ig-fetch-btn"
            title={cfg.configured ? "Fetch Instagram numbers + photo for usernames never fetched" : "Add IG_GRAPH_TOKEN and IG_BUSINESS_ID in server settings first"}
            className="h-9 px-3 rounded-xl bg-white border border-pink-200 text-slate-900 text-xs font-bold inline-flex items-center gap-1.5 hover:border-pink-400 disabled:opacity-40 cursor-pointer">
            <SocialLogo platform="instagram" size={16} variant="tile" /> Fetch IG
          </button>
        )}
        <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-semibold cursor-pointer" title="Also fetch again the ones fetched 7+ days ago">
          <input type="checkbox" checked={force} disabled={run?.running} onChange={(e) => setForce(e.target.checked)} className="w-3.5 h-3.5" data-testid="ig-fetch-old" /> + old
        </label>
      </div>
      {run && !run.running && <div className="text-[11px] text-slate-500 font-semibold">Done · {run.done} updated{run.failed ? ` · ${run.failed} failed` : ""}</div>}
      {waiting && <div className="text-[11px] text-amber-700 font-semibold">Paused till ~{waiting} (Instagram limit) — keep page open</div>}
      {run?.errors?.length > 0 && !run.running && (
        <details className="text-[11px] text-slate-500 max-w-xs"><summary className="cursor-pointer font-semibold">Why some failed</summary>
          <ul className="mt-1 space-y-0.5">{run.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
