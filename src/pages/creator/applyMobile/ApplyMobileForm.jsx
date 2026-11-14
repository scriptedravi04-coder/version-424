import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronDown, Camera, User, Link2, Mail, MapPin, Plus, X, Check, Loader2 } from "lucide-react";
import InstagramFetchButton from "../../../components/instagram/InstagramFetchButton"; // v352
import UniversalTagSearch from "../../../components/shared/UniversalTagSearch";
import { countHint } from "../../../utils/creatorFormValidation";
import SocialLogo from "../../../components/common/SocialLogo"; // v364: real platform logos

// Session 34 — design "1a Public Creator Application — mobile" (FORM_for_creators.html):
// full-bleed white screens, 20px gutters, 52px inputs at 16px text, a 5px progress bar +
// "Step N of 2" next to ONE pinned action, disabled (#EDEDF2) until the step is valid.
// Same fields and the same validation as desktop (utils/creatorFormValidation.js).

const FONT = "'DM Sans', system-ui, sans-serif";
const PURPLE = "#7C3AED";
const INPUT = { height: 52, borderRadius: 14, background: "#F7F7FA", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", boxSizing: "border-box" };
const FIELD_TEXT = { flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: `500 16px ${FONT}`, color: "#0B0B0F" };

function Label({ children, required, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
      <div style={{ font: `700 10.5px/1 ${FONT}`, letterSpacing: 1.1, textTransform: "uppercase", color: "#A0A0AA" }}>
        {children} {required && <span style={{ color: "#E5484D" }}>*</span>}
      </div>
      {right && <div style={{ font: `500 11px ${FONT}`, color: "#A0A0AA" }}>{right}</div>}
    </div>
  );
}
function Err({ msg }) {
  if (!msg) return null;
  return <div className="mobile-form-error" style={{ marginTop: 6, font: `600 12px/1.4 ${FONT}`, color: "#E5484D" }}>{msg}</div>;
}
function Hint({ children }) {
  return <div style={{ marginTop: 7, font: `500 11.5px/1.5 ${FONT}`, color: "#8A8A94" }}>{children}</div>;
}
const Gap = ({ h = 16 }) => <div style={{ height: h }} />;

function Footer({ step, enabled, busy, label, onClick, note, extra }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, borderTop: "1px solid #F0F0F4", background: "rgba(255,255,255,.96)", backdropFilter: "blur(8px)", padding: "12px 20px calc(16px + env(safe-area-inset-bottom))" }}>
      {extra}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: "#EDEDF2", overflow: "hidden" }}>
          <div style={{ width: step === 1 ? "50%" : "100%", height: "100%", background: PURPLE, transition: "width .3s" }} />
        </div>
        <div style={{ font: `700 11px ${FONT}`, color: "#8A8A94" }}>Step {step} of 2</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-disabled={!enabled}
        data-testid={`apply-mobile-cta-${step}`}
        style={{ width: "100%", height: 54, borderRadius: 16, border: 0, cursor: enabled && !busy ? "pointer" : "default", background: enabled ? PURPLE : "#EDEDF2", color: enabled ? "#fff" : "#A0A0AA", font: `800 15.5px ${FONT}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        {busy ? <><Loader2 size={18} className="animate-spin" /> Submitting…</> : label}
      </button>
      {note && <div style={{ marginTop: 8, textAlign: "center", font: `500 11px ${FONT}`, color: "#A0A0AA" }}>{note}</div>}
    </div>
  );
}

export default function ApplyMobileForm({ f }) {
  const photoRef = useRef(null);
  const e = f.fieldErrors || {};
  const clear = (k) => f.setFieldErrors((p) => ({ ...p, [k]: null }));

  const header = (
    <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff", padding: "12px 20px 12px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #F0F0F4" }}>
      <button type="button" aria-label="Back" onClick={f.onBack} style={{ width: 36, height: 36, borderRadius: 18, border: "1px solid #E5E5E2", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <ChevronLeft size={18} color="#0B0B0F" />
      </button>
      <div style={{ flex: 1, font: `800 16px/1.2 ${FONT}`, color: "#0B0B0F", letterSpacing: -0.3 }}>
        {f.step === 1 ? "Your creator profile" : "Sample work & experience"}
      </div>
      {f.step === 1 ? (
        <Link to="/login" style={{ height: 34, padding: "0 14px", borderRadius: 17, border: "1px solid #E5E5E2", display: "flex", alignItems: "center", font: `700 12.5px ${FONT}`, color: "#5A5A64", textDecoration: "none" }}>Sign In</Link>
      ) : (
        <button type="button" onClick={f.onSubmit} disabled={f.loading} style={{ background: "none", border: 0, font: `700 13px ${FONT}`, color: PURPLE, cursor: "pointer", minHeight: 40, padding: "0 6px" /* v332: 40px tap target */ }}>Skip</button>
      )}
    </div>
  );

  if (f.step === 1) {
    return (
      <div style={{ minHeight: "100dvh", background: "#fff", fontFamily: FONT }}>
        {header}
        <div style={{ padding: "0 20px 190px" }}>
          <Gap h={20} />
          {/* Photo */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <button type="button" aria-label="Add profile photo" onClick={() => photoRef.current?.click()} style={{ width: 96, height: 96, borderRadius: 48, background: "#F2F2F6", border: e.photo ? "2px solid #E5484D" : 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              {f.photoUploading ? <Loader2 size={22} className="animate-spin" color="#A0A0AA" />
                : f.photo ? <img src={f.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <Camera size={26} color="#A0A0AA" />}
            </button>
            <button type="button" onClick={() => photoRef.current?.click()} style={{ background: "none", border: 0, font: `700 13px ${FONT}`, color: PURPLE, cursor: "pointer" }}>
              {f.photo ? "Change photo" : "Add profile photo"} <span style={{ color: "#E5484D" }}>*</span>
            </button>
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={f.onPhoto} style={{ display: "none" }} />
            <Err msg={e.photo} />
          </div>
          <Gap h={20} />

          <Label required>Full name</Label>
          <div style={{ ...INPUT, marginTop: 9 }}>
            <User size={18} color="#A0A0AA" />
            <input value={f.fullName} onChange={(ev) => { f.setFullName(ev.target.value); clear("name"); }} placeholder="e.g. Rahul Sharma" autoComplete="name" style={FIELD_TEXT} />
          </div>
          <Err msg={e.name} />
          <Gap />

          <Label required>Gender</Label>
          <button type="button" onClick={() => f.setShowGenderSheet(true)} style={{ ...INPUT, marginTop: 9, width: "100%", border: 0, justifyContent: "space-between", cursor: "pointer" }}>
            <span style={{ font: `500 16px ${FONT}`, color: f.gender ? "#0B0B0F" : "#A0A0AA" }}>{f.gender || "Select gender"}</span>
            <ChevronDown size={18} color="#A0A0AA" />
          </button>
          <Err msg={e.gender} />
          <Gap h={22} />

          <Label required right="Must be public">Instagram handle</Label>
          <div style={{ ...INPUT, marginTop: 9 }}>
            <SocialLogo platform="instagram" size={18} />
            <input value={f.socialHandle} onChange={f.onHandle} placeholder="@yourhandle" autoCapitalize="none" autoCorrect="off" style={{ ...FIELD_TEXT, fontWeight: 600 }} />
          </div>
          <InstagramFetchButton username={f.socialHandle} onFetched={f.onIgFetched} />{/* v352 */}
          <Err msg={e.social_handle} />
          <Gap />

          <Label>Instagram profile URL</Label>
          <div style={{ ...INPUT, marginTop: 9 }}>
            <Link2 size={18} color="#A0A0AA" />
            <input value={f.instagramLink} onChange={(ev) => { f.setInstagramLink(ev.target.value); clear("instagram_link"); }} placeholder="instagram.com/yourusername" inputMode="url" autoCapitalize="none" style={FIELD_TEXT} />
          </div>
          <Err msg={e.instagram_link} />
          <Gap />

          {/* 2-up grid: followers / reach — v354: minmax(0,1fr), the inputs pushed the 2nd column off-screen */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <div>
              <Label required>Followers</Label>
              <div style={{ ...INPUT, marginTop: 9 }}>
                <input value={f.followersInput} onChange={(ev) => { f.setFollowersInput(ev.target.value); clear("followers"); }} placeholder="1,45,000" inputMode="decimal" style={FIELD_TEXT} />
              </div>
              {countHint(f.followersInput) ? <Hint>{countHint(f.followersInput)}</Hint> : <Hint>e.g. 25K or 1.5L</Hint>}
              <Err msg={e.followers} />
            </div>
            <div>
              <Label required>Avg. reach</Label>
              <div style={{ ...INPUT, marginTop: 9 }}>
                <input value={f.avgReach} onChange={(ev) => { f.setAvgReach(ev.target.value); clear("avg_reach"); }} placeholder="12,000" inputMode="decimal" style={FIELD_TEXT} />
              </div>
              {countHint(f.avgReach) ? <Hint>{countHint(f.avgReach)}</Hint> : <Hint>Views per reel</Hint>}
              <Err msg={e.avg_reach} />
            </div>
          </div>
          <Gap />

          <Label required>Mobile number (WhatsApp)</Label>
          <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
            <select value={f.countryCode} onChange={(ev) => f.setCountryCode(ev.target.value)} aria-label="Country code" style={{ ...INPUT, width: 96, border: 0, font: `600 16px ${FONT}` /* v332: 16px so iPhone doesn't zoom */, color: "#0B0B0F", appearance: "none" }}>
              {(f.COUNTRY_CODES || [{ code: "+91", flag: "🇮🇳" }]).map((c) => <option key={c.code + (c.country || "")} value={c.code}>{c.flag ? `${c.flag} ` : ""}{c.code}</option>)}
            </select>
            <div style={{ ...INPUT, flex: 1 }}>
              <input value={f.mobile} onChange={f.onMobile} placeholder={f.countryCode === "+91" ? "10-digit number" : "Mobile number"} inputMode="numeric" type="tel" autoComplete="tel-national" style={FIELD_TEXT} />
            </div>
          </div>
          <Hint>No OTP — the number is saved with your application.</Hint>
          <Err msg={e.mobile} />
          <Gap />

          <Label required>Email address</Label>
          <div style={{ ...INPUT, marginTop: 9 }}>
            <Mail size={18} color="#A0A0AA" />
            <input value={f.email} onChange={(ev) => { f.setEmail(ev.target.value); clear("email"); }} placeholder="you@example.com" inputMode="email" type="email" autoCapitalize="none" autoComplete="email" style={FIELD_TEXT} />
          </div>
          <Err msg={e.email} />
          <Gap />

          {/* 2-up grid: city / price */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <div style={{ position: "relative" }} ref={f.cityRef}>
              <Label required>City</Label>
              <div style={{ ...INPUT, marginTop: 9 }}>
                <MapPin size={16} color="#A0A0AA" />
                <input value={f.city} onChange={(ev) => { f.setCity(ev.target.value); f.setShowCity(true); clear("city"); }} onFocus={() => f.setShowCity(true)} placeholder="Mumbai" style={FIELD_TEXT} />
              </div>
              {f.showCity && f.cityMatches.length > 0 && (
                <div style={{ position: "absolute", left: 0, right: -120, top: 80, zIndex: 20, background: "#fff", border: "1px solid #EDEDF2", borderRadius: 14, boxShadow: "0 12px 30px rgba(0,0,0,.08)", maxHeight: 220, overflowY: "auto" }}>
                  {f.cityMatches.map((m) => {
                    const label = typeof m === "string" ? m : (m.display || `${m.name}${m.state ? `, ${m.state}` : ""}`);
                    return (
                      <button key={`${label}-${m.type || ""}`} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { f.setCity(label); f.setShowCity(false); clear("city"); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", border: 0, background: "none", font: `500 14px ${FONT}`, color: "#0B0B0F", cursor: "pointer" }}>{label}</button>
                    );
                  })}
                </div>
              )}
              <Err msg={e.city} />
            </div>
            <div>
              <Label required>1 UGC video</Label>
              <div style={{ ...INPUT, marginTop: 9 }}>
                <span style={{ font: `600 16px ${FONT}`, color: "#A0A0AA" }}>₹</span>
                <input value={f.charges} onChange={(ev) => { f.setCharges(ev.target.value); clear("charges"); }} placeholder="2,500" inputMode="decimal" style={FIELD_TEXT} />
              </div>
              {countHint(f.charges) && <Hint>{countHint(f.charges).replace("= ", "= ₹")}</Hint>}
              <Err msg={e.charges} />
            </div>
          </div>
          {f.chargesFairness?.type === "warning" && <Hint>{f.chargesFairness.message}</Hint>}
          <Gap />

          <Label required>Primary content niche</Label>
          <div style={{ marginTop: 9 }}>
            <UniversalTagSearch
              label=""
              selectedTags={f.niche ? [f.niche] : []}
              onChange={(tags) => { f.setNiche(tags[tags.length - 1] || ""); clear("niche"); }}
              type="category"
              placeholder="Search a niche, e.g. Beauty"
            />
          </div>
          <Err msg={e.niche} />
          <Gap />

          <Label right="Select all that apply">Collaboration types</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {f.COLLAB_TYPES.map((t) => {
              const on = f.collabTypes.includes(t);
              return (
                <button key={t} type="button" onClick={() => f.toggleCollabType(t)} style={{ height: 38, padding: "0 14px", borderRadius: 19, border: `1px solid ${on ? PURPLE : "#E5E5E2"}`, background: on ? "#F3EEFF" : "#fff", color: on ? PURPLE : "#3A3A44", font: `600 13px ${FONT}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  {on && <Check size={14} />}{t}
                </button>
              );
            })}
          </div>
        </div>
        <Footer step={1} enabled={f.step1Complete} label="Continue to sample work" onClick={f.onNext} note={f.step1Complete ? "" : "Fill the fields marked * to continue"} />
        {f.genderSheet}
      </div>
    );
  }

  // ---------- Step 2 ----------
  return (
    <div style={{ minHeight: "100dvh", background: "#fff", fontFamily: FONT }}>
      {header}
      <div style={{ padding: "0 20px 260px" }}>
        <Gap h={18} />
        <div style={{ font: `500 13.5px/1.6 ${FONT}`, color: "#5A5A64" }}>
          Nothing here is required. Creators who add sample work get reviewed faster — but you can skip straight to submitting.
        </div>
        <Gap h={22} />

        <Label right={f.ugcRating ? `Level ${f.ugcRating} / 10` : ""}>UGC experience level · optional</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 10 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
            const on = f.ugcRating === n;
            return (
              <button key={n} type="button" onClick={() => f.setUgcRating(on ? null : n)} aria-pressed={on} style={{ height: 46, borderRadius: 12, border: `1px solid ${on ? PURPLE : "#EDEDF2"}`, background: on ? PURPLE : "#F7F7FA", color: on ? "#fff" : "#3A3A44", font: `700 15px ${FONT}`, cursor: "pointer" }}>{n}</button>
            );
          })}
        </div>
        <Gap h={22} />

        <Label right="Drive, Reel, YouTube">Sample content links</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
          <div style={{ ...INPUT, flex: 1 }}>
            <Link2 size={16} color="#A0A0AA" />
            <input value={f.currentSampleInput} onChange={(ev) => f.setCurrentSampleInput(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); f.addSampleLink(); } }} placeholder="Paste reel or drive URL" inputMode="url" autoCapitalize="none" style={FIELD_TEXT} />
          </div>
          <button type="button" onClick={f.addSampleLink} style={{ height: 52, padding: "0 14px", borderRadius: 14, border: 0, background: "#F3EEFF", color: PURPLE, font: `700 13px ${FONT}`, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><Plus size={15} /> Add link</button>
        </div>
        {f.sampleLinks.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {f.sampleLinks.map((l, i) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "#F7F7FA" }}>
                <Link2 size={14} color={PURPLE} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: `500 13.5px ${FONT}`, color: "#0B0B0F" }}>{l.replace(/^https?:\/\/(www\.)?/, "")}</span>
                <button type="button" aria-label="Remove link" onClick={() => f.removeSampleLink(i)} style={{ background: "none", border: 0, cursor: "pointer", width: 36, height: 36, margin: "-8px -8px -8px 0", display: "flex", alignItems: "center", justifyContent: "center" /* v332: 36px tap target */ }}><X size={15} color="#8A8A94" /></button>
              </div>
            ))}
          </div>
        )}
        <Gap h={22} />

        <Label right="Optional">Additional notes / short bio</Label>
        <textarea value={f.notes} onChange={(ev) => f.setNotes(ev.target.value.slice(0, 1000))} rows={4} placeholder="Past brand collaborations, equipment, languages spoken…" style={{ marginTop: 9, width: "100%", boxSizing: "border-box", borderRadius: 14, background: "#F7F7FA", border: 0, outline: "none", padding: 14, font: `500 16px/1.5 ${FONT}`, color: "#0B0B0F", resize: "none" }} />
      </div>
      <Footer
        step={2}
        enabled
        busy={f.loading}
        label="Submit application"
        onClick={f.onSubmit}
        note="Reviewed only by the Ybex curation team"
        extra={f.consent}
      />
    </div>
  );
}
