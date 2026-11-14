import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Camera, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import LogoCropper from "../../components/common/LogoCropper";
import TrustAvatars from "../../components/onboarding/mobile/TrustAvatars";
import { uploadProfilePhoto, saveCreatorProfileStep } from "../../api/onboarding";
import { lastPrecheck, clearPrecheck } from "../../lib/signupPrecheck";

// v402 (Ravi 4 Nov, approved mockup "creator sign-up — step 1 + photo popup"): right after a new creator's account is
// made (email / WhatsApp / Google), ONE screen: photo + name, then the dashboard. No "Step 1 of 4", no Exit — only Back.
// Both are needed: the photo is what brands see on Explore. Tapping "Upload photo" opens a small sheet with the
// creators the admin shows on the home screen ("Top Ybex creators brands love") and what to avoid.
const font = "'DM Sans',sans-serif";
export const PHOTO_STEP_PATH = "/app/photo";

export const compactReach = (n) => {
  const v = Number(n) || 0;
  if (v >= 100000) return `${(v / 100000).toFixed(v >= 1000000 ? 0 : 1).replace(/\.0$/, "")}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return v ? String(v) : "";
};
const isRealPhoto = (u) => u && !/dicebear|ui-avatars/i.test(String(u));
/** Name from Instagram / the account, never "@handle" or an email. Pure. */
export const startName = (pre, user) => {
  const cand = [pre?.name, user?.name].map((x) => String(x || "").trim()).find((x) => x && !x.startsWith("@") && !x.includes("@"));
  return (cand || "").slice(0, 60);
};

function Face({ dark, group, logo }) {
  if (logo) return <svg viewBox="0 0 40 40" width="100%" height="100%"><rect width="40" height="40" fill="#111" /><text x="20" y="24" fontSize="9" fontWeight="800" fill="#FBBF24" textAnchor="middle" fontFamily="DM Sans">BRAND</text></svg>;
  const head = (cx, cy, s, sk) => (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      <ellipse cx="0" cy="18" rx="12" ry="9" fill="#7C3AED" opacity=".85" />
      <circle cx="0" cy="0" r="9" fill={sk} />
      <path d="M-9.5 -1.5 C-9 -11 9 -11 9.5 -1.5 C7 -6.5 -7 -6.5 -9.5 -1.5Z" fill="#2B1B12" />
    </g>
  );
  return (
    <svg viewBox="0 0 40 40" width="100%" height="100%">
      <rect width="40" height="40" fill={group ? "#E4ECFF" : "#DDE3EE"} />
      {group ? <>{head(12, 21, 0.62, "#E0AC7E")}{head(28, 21, 0.62, "#8D5A3B")}{head(20, 18, 0.7, "#C68B59")}</> : head(20, 19, 1, "#C68B59")}
      {dark && <rect width="40" height="40" fill="#000" opacity=".6" />}
    </svg>
  );
}

function PhotoSheet({ open, onClose, onGallery, onSelfie }) {
  const [picks, setPicks] = useState(null);
  useEffect(() => {
    if (!open || picks) return;
    // Ravi: only the creators shown on the home screen (Admin → "Show on home screen"), never random Explore ones
    api.get("creators/home-picks").then((r) => setPicks((r?.data?.picks || []).filter((p) => isRealPhoto(p.picture)).slice(0, 8))).catch(() => setPicks([]));
  }, [open, picks]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} data-testid="photo-sheet"
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(10,10,20,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 32 }} onClick={(e) => e.stopPropagation()}
            role="dialog" aria-label="Add a clear photo of you"
            style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: "24px 24px 0 0", padding: "8px 18px", paddingBottom: "max(18px, env(safe-area-inset-bottom))", boxSizing: "border-box", fontFamily: font }}>
            <div style={{ width: 40, height: 5, borderRadius: 5, background: "#DDD", margin: "0 auto 10px" }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <h3 style={{ margin: 0, font: `700 19px/1.25 ${font}`, letterSpacing: "-.4px", color: "#0A0A0A" }}>Add a clear photo of you</h3>
              <button type="button" onClick={onClose} aria-label="Close" data-testid="photo-sheet-close"
                style={{ width: 30, height: 30, flex: "0 0 30px", borderRadius: 999, border: "none", background: "#F2F2F7", display: "grid", placeItems: "center", cursor: "pointer" }}><X size={15} color="#374151" /></button>
            </div>
            <p style={{ margin: "4px 0 0", font: `400 13px/1.45 ${font}`, color: "#6B7280" }}>Your face, clear and smiling — it's the first thing brands see.</p>

            {picks && picks.length > 0 && (
              <>
                <div style={{ margin: "16px 0 8px", font: `800 11.5px ${font}`, letterSpacing: ".08em", textTransform: "uppercase", color: "#5B21B6" }}>Top Ybex creators brands love</div>
                <div data-testid="photo-sheet-tops" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -18px", padding: "0 18px 2px", scrollbarWidth: "none" }}>
                  {picks.map((p) => (
                    <div key={p.id} style={{ flex: "0 0 92px", height: 120, borderRadius: 16, overflow: "hidden", position: "relative", background: "#16161B", boxShadow: "0 8px 16px -10px rgba(18,18,26,.6)" }}>
                      <img src={p.picture} alt={p.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "20px 7px 6px", background: "linear-gradient(180deg,rgba(10,10,10,0),rgba(10,10,10,.88))" }}>
                        <div style={{ font: `700 11.5px/1.2 ${font}`, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        {compactReach(p.avg_reach || p.followers) && (
                          <div style={{ font: `600 9.5px ${font}`, color: "rgba(255,255,255,.8)", marginTop: 1, whiteSpace: "nowrap" }}>
                            {compactReach(p.avg_reach || p.followers)} {p.avg_reach ? "avg reach" : "followers"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ margin: "14px 0 8px", font: `800 11.5px ${font}`, letterSpacing: ".08em", textTransform: "uppercase", color: "#DC2626" }}>Avoid</div>
            <div style={{ display: "flex", gap: 14 }}>
              {[["Dark or blurry", { dark: true }], ["Group photo", { group: true }], ["Logo or far away", { logo: true }]].map(([label, f]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, font: `600 11.5px/1.2 ${font}`, color: "#374151" }}>
                  <div style={{ position: "relative", width: 40, height: 40, flex: "0 0 40px" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 999, overflow: "hidden", border: "2px solid #EF4444", boxSizing: "border-box" }}><Face {...f} /></div>
                    <span style={{ position: "absolute", right: -3, bottom: -3, width: 16, height: 16, borderRadius: 999, background: "#EF4444", color: "#fff", font: `800 9px ${font}`, display: "grid", placeItems: "center", border: "2px solid #fff" }}>✕</span>
                  </div>
                  <span style={{ maxWidth: 62 }}>{label}</span>
                </div>
              ))}
            </div>

            <button type="button" onClick={onGallery} data-testid="photo-sheet-gallery"
              style={{ marginTop: 18, width: "100%", height: 50, borderRadius: 14, border: "none", background: "#7C3AED", color: "#fff", font: `700 15px ${font}`, cursor: "pointer" }}>Choose from gallery</button>
            <button type="button" onClick={onSelfie} data-testid="photo-sheet-selfie"
              style={{ marginTop: 10, width: "100%", height: 48, borderRadius: 14, border: "1px solid #E5E5EA", background: "#fff", color: "#111", font: `700 15px ${font}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Camera size={17} /> Take a selfie
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function AppPhotoStep() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth() || {};
  const then = (() => { try { const t = new URLSearchParams(window.location.search).get("then") || ""; return t.startsWith("/") && !t.startsWith("//") ? t : "/dashboard"; } catch { return "/dashboard"; } })();
  const pre = lastPrecheck(24 * 3600 * 1000);
  const [photo, setPhoto] = useState(() => (isRealPhoto(user?.picture) ? user.picture : pre?.photo_url || ""));
  const [name, setName] = useState(() => startName(pre, user));
  const [sheet, setSheet] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const galleryRef = useRef(null);
  const selfieRef = useRef(null);

  useEffect(() => {
    if (!user && !localStorage.getItem("ybex_token")) navigate("/app/continue/creator", { replace: true });
  }, [user, navigate]);
  useEffect(() => { if (!name) setName(startName(pre, user)); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) { setSheet(false); setCropFile(f); }
  };
  const upload = async (file) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const url = await uploadProfilePhoto(user?.user_id, file);
      if (url) { setPhoto(url); toast.success("Photo added!"); }
      else toast.error("Couldn't upload the photo. Please try again.");
    } finally { setUploading(false); }
  };

  const ok = Boolean(photo) && name.trim().length >= 2 && !uploading;
  const next = async () => {
    if (!ok || saving) return;
    setSaving(true);
    try {
      await saveCreatorProfileStep(user?.user_id, { full_name: name.trim(), name: name.trim(), photo });
      try { setUser?.({ ...(user || {}), name: name.trim(), picture: photo }); } catch { /* fine */ }
      clearPrecheck();
      navigate(then, { replace: true });
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally { setSaving(false); }
  };
  const back = () => { if (window.history.length > 1) navigate(-1); else navigate(then, { replace: true }); };

  return (
    <div data-testid="app-photo-step" style={{ minHeight: "var(--yb-vh, 100dvh)", background: "#F2F2F7", display: "flex", flexDirection: "column", fontFamily: font, color: "#0A0A0A" }}>
      <div style={{ padding: "max(14px, env(safe-area-inset-top)) 14px 0" }}>
        <button type="button" onClick={back} aria-label="Back" data-testid="app-photo-back"
          style={{ width: 40, height: 40, borderRadius: 999, border: "none", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}><ArrowLeft size={22} /></button>
      </div>
      <div style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <h2 style={{ margin: 0, font: `700 23px/1.28 ${font}`, letterSpacing: "-.7px" }}>Create your creator profile</h2>
        <p style={{ margin: "8px 0 0", font: `400 13.5px/1.55 ${font}`, color: "#6B7280" }}>Your photo and name are the first things brands see.</p>

        <input ref={galleryRef} type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} data-testid="app-photo-gallery-input" />
        <input ref={selfieRef} type="file" accept="image/*" capture="user" onChange={pickFile} style={{ display: "none" }} />
        <LogoCropper file={cropFile} shape="circle" title="Adjust your photo" useLabel="Use photo" suffix="-photo"
          onCancel={() => setCropFile(null)} onDone={(f) => { setCropFile(null); upload(f); }} />

        <div onClick={() => !uploading && setSheet(true)} data-testid="app-photo-box" role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSheet(true); }}
          style={{ margin: "22px auto 0", width: 170, height: 170, borderRadius: 999, cursor: "pointer", position: "relative", overflow: "hidden", boxSizing: "border-box",
            border: photo ? "3px solid #7C3AED" : "2px dashed #C7C7CC", background: photo ? "#F5F0FF" : "#FAFAFC", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {uploading ? <Loader2 size={26} className="animate-spin" color="#7C3AED" /> : photo ? (
            <>
              <img src={photo} alt="Your photo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <span style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", padding: "5px 12px", borderRadius: 999, background: "rgba(10,10,10,.6)", color: "#fff", font: `600 12px ${font}` }}>Change</span>
            </>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 16px", borderRadius: 12, background: "#7C3AED", color: "#fff", font: `700 14px ${font}`, boxShadow: "0 10px 22px -12px rgba(124,58,237,.9)" }}>
              <Camera size={17} /> Upload photo
            </span>
          )}
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ font: `600 13.5px/1.45 ${font}`, color: "#4B5563" }}>Clear photo = more brand deals</div>
          <TrustAvatars />
        </div>

        <label htmlFor="app-photo-name" style={{ display: "block", marginTop: 22, marginBottom: 8, font: `700 12px ${font}`, letterSpacing: ".08em", color: "#6B7280" }}>YOUR NAME</label>
        <input id="app-photo-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Your name" autoComplete="name" data-testid="app-photo-name"
          style={{ height: 52, borderRadius: 14, background: "#fff", border: "1px solid #E5E5EA", padding: "0 16px", font: `400 16px ${font}`, color: "#111", outline: "none", boxSizing: "border-box", width: "100%" }} />
      </div>
      <div style={{ padding: "16px 20px", paddingBottom: "max(24px, env(safe-area-inset-bottom))", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {!photo && <div style={{ textAlign: "center", marginBottom: 8, font: `500 12.5px ${font}`, color: "#8A8799" }}>Add your photo to continue</div>}
        <button type="button" onClick={next} disabled={!ok || saving} data-testid="app-photo-next"
          style={{ width: "100%", height: 54, borderRadius: 16, border: "none", background: ok ? "#7C3AED" : "#B79AF0", color: "#fff", font: `700 16px ${font}`, cursor: ok ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {saving ? <Loader2 size={20} className="animate-spin" /> : "Next"}
        </button>
      </div>
      <PhotoSheet open={sheet} onClose={() => setSheet(false)} onGallery={() => galleryRef.current?.click()} onSelfie={() => selfieRef.current?.click()} />
    </div>
  );
}
