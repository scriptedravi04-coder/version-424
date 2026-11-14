import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ZoomIn, ZoomOut } from "lucide-react";

// Session 43 (v283, Ravi: "a whole screenshot shows up as the logo — give a crop / adjust option").
// Opens after someone picks a picture: drag to move, zoom, "Use" makes a square 512×512 picture of
// exactly what is inside the frame. "Use as is" keeps the original file.
// v286 (Ravi): two-finger pinch zooms the picture itself; the zoom bar is a clear purple track with
// − / + buttons (it used to blend into the card and nobody found it). Creators get it for their
// profile photo too: shape="circle" shows a round frame, title / useLabel change the words.
const FRAME = 240;
const OUT = 512;
const MIN_Z = 1;
const MAX_Z = 4;

export async function cropToFile(img, { x, y, scale }, name = "logo.png", suffix = "-logo") {
  const canvas = document.createElement("canvas");
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, OUT, OUT);
  const k = OUT / FRAME;
  ctx.drawImage(img, x * k, y * k, img.naturalWidth * scale * k, img.naturalHeight * scale * k);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png", 0.92));
  if (!blob) return null;
  return new File([blob], name.replace(/\.[a-z0-9]+$/i, "") + suffix + ".png", { type: "image/png" });
}

const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

export default function LogoCropper({ file, onDone, onCancel, shape = "square", title = "Adjust your logo", useLabel = "Use logo", suffix = "-logo" }) {
  const [url, setUrl] = useState("");
  const [img, setImg] = useState(null);
  const [base, setBase] = useState(1);       // scale that makes the picture cover the frame
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const pinch = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u);
    const im = new Image();
    im.onload = () => {
      const b = Math.max(FRAME / im.naturalWidth, FRAME / im.naturalHeight);
      setBase(b); setZoom(1); setImg(im);
      setPos({ x: (FRAME - im.naturalWidth * b) / 2, y: (FRAME - im.naturalHeight * b) / 2 });
    };
    im.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const scale = base * zoom;
  const clamp = (p, s = scale) => {
    if (!img) return p;
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    return { x: Math.min(0, Math.max(FRAME - w, p.x)), y: Math.min(0, Math.max(FRAME - h, p.y)) };
  };
  const setZoomKeepCentre = (zRaw) => {
    const z = Math.min(MAX_Z, Math.max(MIN_Z, zRaw));
    const s2 = base * z, c = FRAME / 2;
    setPos((p) => clamp({ x: c - ((c - p.x) / scale) * s2, y: c - ((c - p.y) / scale) * s2 }, s2));
    setZoom(z);
  };
  const down = (e) => {
    if (e.touches && e.touches.length === 2) {
      pinch.current = { d: dist(e.touches[0], e.touches[1]), z: zoom };
      drag.current = null;
      return;
    }
    const t = e.touches ? e.touches[0] : e;
    drag.current = { sx: t.clientX, sy: t.clientY, p: pos };
  };
  const move = (e) => {
    if (e.touches && e.touches.length === 2) {
      if (!pinch.current) pinch.current = { d: dist(e.touches[0], e.touches[1]), z: zoom };
      const d = dist(e.touches[0], e.touches[1]);
      if (pinch.current.d > 0) setZoomKeepCentre(pinch.current.z * (d / pinch.current.d));
      return;
    }
    if (!drag.current) return;
    const t = e.touches ? e.touches[0] : e;
    setPos(clamp({ x: drag.current.p.x + t.clientX - drag.current.sx, y: drag.current.p.y + t.clientY - drag.current.sy }));
  };
  const up = (e) => {
    if (e && e.touches && e.touches.length === 1) { // one finger left after a pinch → keep dragging from here
      pinch.current = null;
      const t = e.touches[0];
      drag.current = { sx: t.clientX, sy: t.clientY, p: pos };
      return;
    }
    drag.current = null; pinch.current = null;
  };
  const onWheel = (e) => { if (img) setZoomKeepCentre(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };

  const use = async () => {
    if (!img || busy) return;
    setBusy(true);
    try { onDone(await cropToFile(img, { ...pos, scale }, file?.name || "picture.png", suffix) || file); }
    finally { setBusy(false); }
  };

  if (!file) return null;
  const pct = ((zoom - MIN_Z) / (MAX_Z - MIN_Z)) * 100;
  const round = shape === "circle";
  const stepBtn = { width: 36, height: 36, borderRadius: 12, border: "none", background: "#F3EDFF", color: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  const ui = (
    <div data-testid="logo-cropper" role="dialog" aria-label={title}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(18,18,26,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        .yb-zoom{-webkit-appearance:none;appearance:none;flex:1;height:8px;border-radius:999px;outline:none;
          background:linear-gradient(90deg,#7C3AED var(--p),#E4DAFB var(--p))}
        .yb-zoom::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;
          background:#fff;border:3px solid #7C3AED;box-shadow:0 4px 10px rgba(124,58,237,.35)}
        .yb-zoom::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #7C3AED}
      `}</style>
      <div style={{ width: "100%", maxWidth: 340, background: "#fff", borderRadius: 22, padding: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#0A0A0A" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 2 }}>Drag to move · pinch with two fingers or use the bar to zoom</div>
        <div onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up} onWheel={onWheel}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up} onTouchCancel={up}
          style={{ margin: "16px auto 0", width: FRAME, height: FRAME, borderRadius: round ? "50%" : 20, overflow: "hidden", position: "relative", background: "#F2F2F7", touchAction: "none", cursor: "grab", boxShadow: "0 0 0 2px #7C3AED" }}>
          {img && (
            <img src={url} alt="" draggable={false} data-testid="logo-cropper-img"
              style={{ position: "absolute", left: pos.x, top: pos.y, width: img.naturalWidth * scale, height: img.naturalHeight * scale, maxWidth: "none", userSelect: "none", pointerEvents: "none" }} />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
          <button type="button" aria-label="Zoom out" data-testid="logo-cropper-zoom-out" onClick={() => setZoomKeepCentre(zoom - 0.25)} style={stepBtn}><ZoomOut size={18} /></button>
          <input type="range" min={MIN_Z} max={MAX_Z} step="0.01" value={zoom} aria-label="Zoom" className="yb-zoom"
            onChange={(e) => setZoomKeepCentre(Number(e.target.value))} style={{ "--p": `${pct}%` }} />
          <button type="button" aria-label="Zoom in" data-testid="logo-cropper-zoom-in" onClick={() => setZoomKeepCentre(zoom + 0.25)} style={stepBtn}><ZoomIn size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={() => onDone(file)} style={{ flex: 1, height: 44, borderRadius: 13, border: "1px solid #E5E5EA", background: "#fff", fontWeight: 700, fontSize: 13.5, color: "#0A0A0A" }}>Use as is</button>
          <button type="button" onClick={use} disabled={!img || busy} data-testid="logo-cropper-use"
            style={{ flex: 1, height: 44, borderRadius: 13, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, fontSize: 13.5, opacity: !img || busy ? 0.6 : 1 }}>{useLabel}</button>
        </div>
        <button type="button" onClick={onCancel} style={{ width: "100%", marginTop: 8, height: 36, border: "none", background: "transparent", color: "#6B7280", fontSize: 13, fontWeight: 600 }}>Cancel</button>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(ui, document.body) : ui;
}
