import React, { useState, useRef } from "react";
import { Upload, Link2, X } from "lucide-react";
import { toast } from "sonner";
import MobileSheet, { SheetHeader } from "./MobileSheet";

// Session 23: a video file OR a drive/cloud link, like Manage Orders. A file over 50 MB used to be
// dropped silently; now it says so and points to the link option.
const MAX_MB = 50;

export default function MobileUploadSheet({ onClose, onSubmit, title = "Upload deliverable" }) {
  const [mode, setMode] = useState("file"); // "file" | "link"
  const [file, setFile] = useState(null);
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const linkOk = /^https?:\/\/\S+\.\S+/i.test(link.trim());
  const ready = mode === "file" ? Boolean(file) : linkOk;

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`This video is ${(f.size / 1024 / 1024).toFixed(0)} MB. Files up to ${MAX_MB} MB upload here — paste a Drive / Dropbox link for bigger ones.`);
      setMode("link");
      return;
    }
    setFile(f);
  };

  const handleSend = async () => {
    if (!ready || busy) return;
    setBusy(true);
    // v330: an error used to leave "Uploading…" on screen for good
    let ok = false;
    try {
      ok = mode === "file" ? await onSubmit(file, notes, "") : await onSubmit(null, notes, link.trim());
    } finally { setBusy(false); }
    if (ok) onClose();
  };

  const Tab = ({ id, icon, label }) => (
    <button
      type="button"
      aria-pressed={mode === id}
      disabled={busy} /* v330: switching tab mid-upload */
      onClick={() => setMode(id)}
      style={{
        flex: 1, height: 36, borderRadius: 10, border: "none", cursor: "pointer",
        background: mode === id ? "#fff" : "transparent",
        boxShadow: mode === id ? "0 1px 3px rgba(16,16,20,.12)" : "none",
        font: "600 12.5px 'DM Sans',sans-serif", color: mode === id ? "#7C3AED" : "#6B7280",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <MobileSheet onClose={onClose}>
      <SheetHeader title={title} subtitle={`Upload a video (up to ${MAX_MB} MB) or share a Drive / Dropbox link.`} onClose={onClose} />

      <div style={{ marginTop: 14, display: "flex", gap: 4, padding: 4, borderRadius: 13, background: "#F2F2F7" }}>
        <Tab id="file" icon={<Upload size={14} />} label="Upload video" />
        <Tab id="link" icon={<Link2 size={14} />} label="Drive link" />
      </div>

      {mode === "file" ? (
        <>
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} style={{ display: "none" }} />
          <button
            type="button"
            disabled={busy} /* v332: picking another file mid-upload */
            onClick={() => fileInputRef.current?.click()}
            style={{
              marginTop: 10, width: "100%", minHeight: 96, borderRadius: 14, background: "#F9F9FB", border: "1.5px dashed #E5E5EA",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", padding: "12px 14px",
            }}
          >
            <Upload size={20} color="#7C3AED" />
            <span style={{ font: "500 13px 'DM Sans',sans-serif", color: file ? "#0A0A0A" : "#6B7280", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {file ? file.name : "Tap to choose a video"}
            </span>
            {file && (
              <span style={{ font: "400 11.5px 'DM Sans',sans-serif", color: "#8E8E93" }}>
                {(file.size / 1024 / 1024).toFixed(1)} MB · tap to change
              </span>
            )}
          </button>
        </>
      ) : (
        <div style={{ marginTop: 10, position: "relative" }}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/…"
            aria-label="Drive or Dropbox link"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            style={{
              width: "100%", height: 50, borderRadius: 14, background: "#F9F9FB",
              border: `1px solid ${link && !linkOk ? "#FCA5A5" : "#E5E5EA"}`,
              padding: "0 40px 0 14px", font: "400 16px 'DM Sans',sans-serif" /* v332: 16px stops the iPhone zoom */, color: "#0A0A0A", boxSizing: "border-box", outline: "none",
            }}
          />
          {link && (
            <button type="button" onClick={() => setLink("")} aria-label="Clear link" style={{ position: "absolute", right: 4, top: 5, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer" /* v330: 16px → 40px tap target */ }}>
              <X size={16} color="#8E8E93" />
            </button>
          )}
          <div style={{ marginTop: 6, font: "400 11.5px/1.4 'DM Sans',sans-serif", color: link && !linkOk ? "#DC2626" : "#8E8E93" }}>
            {link && !linkOk ? "Paste a full link starting with https://" : "Set sharing to “Anyone with the link can view”."}
          </div>
        </div>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes for the brand (optional)"
        aria-label="Notes for the brand (optional)"
        style={{
          marginTop: 10, width: "100%", height: 70, borderRadius: 14, background: "#F9F9FB", border: "1px solid #E5E5EA",
          padding: "12px 14px", font: "400 16px/1.45 'DM Sans',sans-serif" /* v332: 16px */, color: "#0A0A0A", resize: "none", boxSizing: "border-box",
        }}
      />
      <button
        disabled={busy || !ready}
        onClick={handleSend}
        style={{ marginTop: 14, width: "100%", height: 50, borderRadius: 14, background: "#7C3AED", border: "none", font: "600 14.5px 'DM Sans',sans-serif", color: "#fff", opacity: busy || !ready ? 0.6 : 1, cursor: "pointer" }}
      >
        {busy ? (mode === "file" ? "Uploading…" : "Submitting…") : "Submit"}
      </button>
    </MobileSheet>
  );
}
