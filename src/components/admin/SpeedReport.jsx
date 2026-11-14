// Session 31 (Ravi): one admin page to see why the app feels slow — open it, take a screenshot,
// send it. Everything shown is measured by the live server; "—" means not measured yet.
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../common/ButtonSpinner";

const PHOTO_BUCKETS = ["avatars", "profile-assets", "cover-images", "brand-logos"];
const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : "0 MB");
const dash = (v, suffix = "") => (v === null || v === undefined || v === "" ? "—" : `${v}${suffix}`);

function since(sec) {
  if (sec == null) return "—";
  if (sec < 90) return `${sec} sec`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)} hours`;
  return `${Math.round(sec / 86400)} days`;
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <p className="text-sm font-semibold text-gray-900 text-right">{value}</p>
    </div>
  );
}

function verdict(report) {
  const notes = [];
  const rt = report?.database?.round_trip;
  if (rt?.error) notes.push({ bad: true, text: `Database check failed: ${rt.error}` });
  else if (rt?.best_ms >= 150) notes.push({ bad: true, text: `Every database call takes at least ${rt.best_ms} ms. The server and the database are probably in different regions.` });
  else if (rt) notes.push({ bad: false, text: `Database answers in ${rt.best_ms} ms — fine.` });
  const s = report?.server;
  if (s?.cold_start_likely && s.first_request_ms >= 3000) {
    notes.push({ bad: true, text: `This server copy started cold: the first visitor waited ${(s.first_request_ms / 1000).toFixed(1)} s. "Minimum instances = 1" on Cloud Run removes this wait.` });
  }
  const slow = (report?.slowest_apis || []).filter((r) => r.avg_ms >= 1500);
  if (slow.length) notes.push({ bad: true, text: `${slow.length} API${slow.length > 1 ? "s are" : " is"} slow on average (1.5 s or more) — see the table.` });
  return notes;
}

export default function SpeedReport() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [photoResults, setPhotoResults] = useState({});
  const [bannerResult, setBannerResult] = useState(null);
  const { isBusy, run } = useBusy();
  const loading = isBusy("load");
  const working = isBusy("action");

  const load = useCallback(() => run("load", async () => {
    setError("");
    try {
      const { data } = await api.get("/admin/speed-report", { bypassCache: true });
      setReport(data);
    } catch (e) {
      setError(e?.response?.data?.error || "Couldn't load the speed report. Please try again."); // v332: no raw tech text
    }
  }), [run]);

  useEffect(() => { load(); }, [load]);

  const shrink = (bucket, dryRun) => run("action", async () => {
    try {
      const { data } = await api.post("/admin/maintenance/shrink-photos", { bucket, dry_run: dryRun });
      setPhotoResults((p) => ({ ...p, [bucket]: data }));
      if (!dryRun) toast.success(`${bucket}: ${data.done} photos made smaller${data.failed?.length ? `, ${data.failed.length} failed` : ""}.`);
    } catch (e) {
      toast.error(e?.response?.data?.error || "That did not work. Try again.");
    }
  });

  const moveBanners = () => run("action", async () => {
    try {
      const { data } = await api.post("/admin/banners/move-to-storage", {});
      setBannerResult(data);
      toast.success(data.found ? `${data.moved} of ${data.found} banners moved to Storage.` : "No banners left to move.");
    } catch (e) {
      toast.error(e?.response?.data?.error || "That did not work. Try again.");
    }
  });

  const s = report?.server;
  const db = report?.database;

  return (
    <div className="mt-6 space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">{/* v332: wraps on phones */}
        <div>
          <h2 className="text-lg font-bold text-gray-900">Speed report</h2>
          <p className="text-sm text-gray-500">Measured live by the server. Take a screenshot of this page and send it.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium disabled:opacity-60 flex items-center gap-2">
          {loading && <ButtonSpinner />} Measure again
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {report && (
        <>
          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-2">What this shows</h3>
            <ul className="space-y-1.5">
              {verdict(report).map((n, i) => (
                <li key={i} className={`text-sm ${n.bad ? "text-amber-800" : "text-emerald-700"}`}>{n.bad ? "⚠ " : "✓ "}{n.text}</li>
              ))}
            </ul>
          </section>

          <div className="grid md:grid-cols-2 gap-6">
            <section className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Server</h3>
              <Row label="Region" value={dash(s?.region)} hint="Where Cloud Run runs the app" />
              <Row label="Running for" value={since(s?.uptime_seconds)} hint="Short = this copy just started" />
              <Row label="Requests served" value={dash(s?.total_requests)} />
              <Row label="First request came" value={s?.first_request_after_start_seconds == null ? "—" : `${s.first_request_after_start_seconds} sec after start`} />
              <Row label="First request took" value={dash(s?.first_request_ms, " ms")} hint="Large number = a visitor waited for a cold start" />
              <Row label="Memory in use" value={dash(s?.memory_mb, " MB")} />
              <Row label="Version" value={dash(s?.revision)} />
            </section>
            <section className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Database (Supabase)</h3>
              <Row label="Address" value={dash(db?.host)} />
              <Row label="Fastest round trip" value={dash(db?.round_trip?.best_ms, " ms")} hint="Same region: under ~50 ms" />
              <Row label="Average of 3 tries" value={dash(db?.round_trip?.avg_ms, " ms")} />
              {db?.round_trip?.error && <Row label="Error" value={db.round_trip.error} />}
            </section>
          </div>

          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900">Slowest APIs</h3>
            <p className="text-xs text-gray-500 mb-3">Since this server copy started ({since(s?.uptime_seconds)} ago).</p>
            {report.slowest_apis?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-3 font-medium">API</th>
                      <th className="py-2 px-3 font-medium text-right">Calls</th>
                      <th className="py-2 px-3 font-medium text-right">Average</th>
                      <th className="py-2 px-3 font-medium text-right">Slowest</th>
                      <th className="py-2 pl-3 font-medium text-right">Over 1.5 s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.slowest_apis.map((r) => (
                      <tr key={r.route} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs text-gray-800 break-all">{r.route}</td>
                        <td className="py-2 px-3 text-right">{r.calls}</td>
                        <td className={`py-2 px-3 text-right font-semibold ${r.avg_ms >= 1500 ? "text-red-600" : r.avg_ms >= 600 ? "text-amber-600" : "text-gray-900"}`}>{r.avg_ms} ms</td>
                        <td className="py-2 px-3 text-right">{r.max_ms} ms</td>
                        <td className="py-2 pl-3 text-right">{r.slow_calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No calls measured yet. Use the app for a few minutes, then press Measure again.</p>
            )}
          </section>
        </>
      )}

      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900">Make old photos small (one time)</h3>
        <p className="text-sm text-gray-500 mb-3">New photos are already made small on upload. This does the same for photos uploaded before. Links stay the same. Press Check first, then Make small.</p>
        <div className="space-y-2">
          {PHOTO_BUCKETS.map((b) => {
            const r = photoResults[b];
            return (
              <div key={b} className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{b}</p>
                  {r && (
                    <p className="text-xs text-gray-500">
                      {r.dry_run
                        ? `${r.files} files · ${r.to_shrink} to make small (${mb(r.bytes_before)} now)`
                        : `Done: ${r.done} made small · ${mb(r.bytes_before)} → ${mb(r.bytes_after)}${r.failed?.length ? ` · ${r.failed.length} failed` : ""}`}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={working} onClick={() => shrink(b, true)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-60">Check</button>
                  <button type="button" disabled={working || !r || (r.dry_run && r.to_shrink === 0)} onClick={() => shrink(b, false)} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm disabled:opacity-40">Make small</button>
                </div>
              </div>
            );
          })}
        </div>
        {working && <p className="text-xs text-gray-500 mt-2 flex items-center gap-2"><ButtonSpinner /> Working — this can take a minute. Keep this page open.</p>}
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900">Banners</h3>
        <p className="text-sm text-gray-500 mb-3">Old banners keep their picture inside the database, which slows every dashboard. This moves those pictures to Storage (one time). New banners already go to Storage.</p>
        <div className="flex items-center gap-3">
          <button type="button" disabled={working} onClick={moveBanners} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm disabled:opacity-60">Move banner pictures</button>
          {bannerResult && (
            <p className="text-xs text-gray-600">
              {bannerResult.found ? `${bannerResult.moved} of ${bannerResult.found} moved` : "Nothing left to move"}
              {bannerResult.failed?.length ? ` · ${bannerResult.failed.length} failed` : ""}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
