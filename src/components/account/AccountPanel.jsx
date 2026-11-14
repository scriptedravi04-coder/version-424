import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Mail, Phone, MonitorSmartphone, FileText, Trash2, ShieldAlert, KeyRound } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { safeStorage } from "../../utils/storage";
import { scrollAppToTop } from "../../lib/scrollTop";

// Session 43 (Ravi): Settings → Account. Shown inside the creator/brand profile's own back-header.
// onOpen(screen) switches to the existing "sessions" / "legal" screens. onDeleted() is called after a
// successful account deletion (the caller logs out + leaves).
export default function AccountPanel({ onOpen, onDeleted }) {
  const { logout, setUser } = useAuth();
  const [info, setInfo] = useState({ email: "", phone: "", email_verified: false });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [edit, setEdit] = useState(null); // 'email' | 'phone' | 'password' | null
  const [del, setDel] = useState(null);    // 'intro' | 'otp' | null

  // Session 48: each inner screen (change email / phone / password, delete) opens at the top.
  useEffect(() => { scrollAppToTop(); }, [edit, del]);
  useEffect(() => {
    api.get("account/overview", { bypassCache: true })
      .then((r) => setInfo(r.data || {}))
      .catch(() => setLoadFailed(true)) // v330: a failed load no longer reads as "Add email" / "Add number"
      .finally(() => setLoading(false));
  }, []);

  if (edit === "email") return <ChangeEmail current={info.email} onDone={(email) => { setInfo((s) => ({ ...s, email })); setEdit(null); }} onCancel={() => setEdit(null)} />;
  if (edit === "phone") return <ChangePhone current={info.phone} onDone={(phone) => { setInfo((s) => ({ ...s, phone })); setEdit(null); }} onCancel={() => setEdit(null)} />;
  if (edit === "password") return <ChangePassword onDone={() => setEdit(null)} onCancel={() => setEdit(null)} />;
  if (del) return <DeleteFlow step={del} setStep={setDel} email={info.email} onDeleted={() => { onDeleted ? onDeleted() : logout?.(); }} />;

  const Row = ({ icon, title, value, onClick, danger }) => (
    <button type="button" onClick={onClick} className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"}`}>{icon}</div>
        <div className="min-w-0">
          <span className={`text-[15px] font-semibold block ${danger ? "text-rose-600" : "text-slate-900"}`}>{title}</span>
          {value ? <span className="text-[12px] text-slate-500 font-medium truncate block">{value}</span> : null}
        </div>
      </div>
      <ChevronRight size={16} className="text-slate-500 shrink-0" />
    </button>
  );

  return (
    <div className="p-4 space-y-5" data-testid="account-panel">
      <div className="space-y-1">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">Login details</span>
        <div className="divide-y divide-slate-100">
          <Row icon={<Mail size={16} />} title="Email" value={loading ? "…" : info.email || (loadFailed ? "Couldn't load — try again later" : "Add email")} onClick={() => setEdit("email")} />
          <Row icon={<Phone size={16} />} title="Phone" value={loading ? "…" : info.phone || (loadFailed ? "Couldn't load — try again later" : "Add number")} onClick={() => setEdit("phone")} />
          <Row icon={<KeyRound size={16} />} title="Password" value="Set or change with an email code" onClick={() => setEdit("password")} />
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">Security &amp; privacy</span>
        <div className="divide-y divide-slate-100">
          <Row icon={<MonitorSmartphone size={16} />} title="Devices &amp; sessions" onClick={() => onOpen?.("sessions")} />
          <Row icon={<FileText size={16} />} title="Privacy &amp; terms" onClick={() => onOpen?.("legal")} />
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">Danger zone</span>
        <div className="divide-y divide-slate-100">
          <Row icon={<Trash2 size={16} />} title="Delete account" danger onClick={() => setDel("intro")} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[12px] font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
// v332: 16px text — at 15px iPhones zoomed in on every field.
const inputCls = "mt-1.5 w-full h-12 rounded-2xl border-[1.5px] border-slate-200 focus:border-[#7C3AED] px-4 text-[16px] font-semibold text-slate-900 outline-none bg-white";
const primaryCls = "w-full h-12 rounded-2xl text-white text-[15px] font-bold active:scale-[0.99] transition disabled:opacity-50";
const primaryStyle = { background: "#7C3AED" }; // v425 (D3): flat brand violet, same as the rest of the app

function ChangePhone({ current, onDone, onCancel }) {
  const [phone, setPhone] = useState(current || "");
  const [busy, setBusy] = useState(false);
  const ok = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ""));
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("account/phone", { phone: phone.replace(/\D/g, "") });
      toast.success("Phone updated");
      onDone(data?.phone || phone);
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't update your number."); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4 space-y-4" data-testid="change-phone">
      <Field label="Mobile number">
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10-digit number" className={inputCls} />
      </Field>
      <p className="text-[12px] text-slate-500">No code needed — your number updates right away.</p>
      <button type="button" onClick={save} disabled={!ok || busy} className={primaryCls} style={primaryStyle}>{busy ? "Saving…" : "Save number"}</button>
      <button type="button" onClick={onCancel} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Cancel</button>
    </div>
  );
}

function ChangeEmail({ current, onDone, onCancel }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await api.post("account/email/send-otp", { email: email.trim().toLowerCase() });
      setSent(true);
      toast.success("Code sent to the new email");
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't send the code."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (otp.trim().length < 4 || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("account/email/verify", { email: email.trim().toLowerCase(), otp: otp.trim() });
      toast.success("Email updated");
      onDone(data?.email || email.trim().toLowerCase());
    } catch (e) { toast.error(e?.response?.data?.detail || "That code didn't work."); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4 space-y-4" data-testid="change-email">
      <p className="text-[12px] text-slate-500">Current: <span className="font-semibold text-slate-600">{current || "—"}</span></p>
      <Field label="New email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} inputMode="email" placeholder="you@email.com" className={inputCls} />
      </Field>
      {!sent ? (
        <button type="button" onClick={send} disabled={!ok || busy} className={primaryCls} style={primaryStyle}>{busy ? "Sending…" : "Send code"}</button>
      ) : (
        <>
          <Field label="Enter the 6-digit code">
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="______" className={`${inputCls} tracking-[6px] text-center`} />
          </Field>
          <button type="button" onClick={verify} disabled={otp.trim().length < 4 || busy} className={primaryCls} style={primaryStyle}>{busy ? "Checking…" : "Update email"}</button>
          <button type="button" onClick={() => setSent(false)} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Use a different email</button>
        </>
      )}
      <button type="button" onClick={onCancel} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Cancel</button>
    </div>
  );
}

function ChangePassword({ onDone, onCancel }) {
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try { await api.post("account/password/send-otp", {}); setSent(true); toast.success("Code sent to your email"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't send the code."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (otp.trim().length < 4 || pw.length < 8 || busy) return;
    setBusy(true);
    try { await api.post("account/password/set", { otp: otp.trim(), new_password: pw }); toast.success("Password saved"); onDone(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't save the password."); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4 space-y-4" data-testid="change-password">
      <p className="text-[12px] text-slate-500">We email you a code first, so this works even if you never set a password.</p>
      {!sent ? (
        <button type="button" onClick={send} disabled={busy} className={primaryCls} style={primaryStyle}>{busy ? "Sending…" : "Email me a code"}</button>
      ) : (
        <>
          <Field label="6-digit code">
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="______" className={`${inputCls} tracking-[6px] text-center`} />
          </Field>
          <Field label="New password (8+ characters)">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className={inputCls} />
          </Field>
          <button type="button" onClick={save} disabled={otp.trim().length < 4 || pw.length < 8 || busy} className={primaryCls} style={primaryStyle}>{busy ? "Saving…" : "Save password"}</button>
        </>
      )}
      <button type="button" onClick={onCancel} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Cancel</button>
    </div>
  );
}

function DeleteFlow({ step, setStep, email, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(null); // {blocked, reasons}
  const [otp, setOtp] = useState("");
  const [checkFailed, setCheckFailed] = useState(false); // v425 (D1): a failed check must not let deletion go ahead
  const [checkKey, setCheckKey] = useState(0);
  const [cooldown, setCooldown] = useState(0); // v425 (D2)

  useEffect(() => {
    if (step !== "intro") return;
    setBlocked(null); setCheckFailed(false);
    api.get("account/delete/preflight", { bypassCache: true })
      .then((r) => setBlocked(r.data || { blocked: false, reasons: [] }))
      .catch(() => setCheckFailed(true));
  }, [step, checkKey]);
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const resend = async () => {
    if (busy || cooldown > 0) return;
    setCooldown(30);
    try { await api.post("account/delete/send-otp", {}); toast.success("New code emailed"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't send a new code."); }
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("account/delete/send-otp", {});
      setStep("otp");
      setCooldown(30);
      toast.success("Confirmation code emailed");
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't start deletion."); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (otp.trim().length < 4 || busy) return;
    setBusy(true);
    try {
      await api.post("account/delete/confirm", { otp: otp.trim() });
      try { safeStorage.removeItem("ybex_token"); safeStorage.removeItem("ybex_user"); } catch { /* ignore */ }
      toast.success("Your account has been deleted.");
      onDeleted?.();
    } catch (e) {
      const d = e?.response?.data;
      if (d?.code === "ACTIVE_MONEY") setBlocked({ blocked: true, reasons: d.reasons || [] });
      toast.error(d?.detail || "Couldn't delete the account.");
      if (d?.code === "ACTIVE_MONEY") setStep("intro");
    } finally { setBusy(false); }
  };

  if (step === "otp") {
    return (
      <div className="p-4 space-y-4" data-testid="delete-otp">
        <p className="text-[13px] text-slate-600">We emailed a code to <span className="font-semibold">{email || "your email"}</span>. Enter it to permanently delete your account.</p>
        <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="______" className={`${inputCls} tracking-[6px] text-center`} />
        <button type="button" onClick={confirm} disabled={otp.trim().length < 4 || busy} className="w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-[15px] font-bold active:scale-[0.99] transition disabled:opacity-50">{busy ? "Deleting…" : "Delete my account"}</button>
        <button type="button" onClick={resend} disabled={busy || cooldown > 0} data-testid="delete-resend" className="w-full h-11 rounded-2xl text-[#7C3AED] text-[14px] font-semibold disabled:text-slate-400">{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
        <button type="button" onClick={() => setStep("intro")} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Back</button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" data-testid="delete-intro">
      <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-2xl p-4">
        <ShieldAlert size={20} className="text-rose-600 shrink-0 mt-0.5" />
        <div className="text-[13px] text-rose-900 leading-relaxed">
          Deleting is permanent. You have 30 days to recover by contacting support, after which it's gone for good.
        </div>
      </div>
      <div className="text-[13px] text-slate-700 leading-relaxed space-y-2">
        {/* Session 58: the copy promised removals that don't happen at once (the account is hidden, records kept). */}
        <p className="font-bold text-slate-900">What happens</p>
        <p>Your account and profile are hidden right away, brands and creators can't find you, and you're signed out on every device.</p>
        {/* v334 (App Store 5.1.1(v) / Play): say what is deleted and when */}
        <p>After 30 days your profile, photos, portfolio, chats, social links and saved bank / UPI details are deleted for good. Changed your mind? Write to support@ybexmedia.in within those 30 days to get the account back.</p>
        <p className="font-bold text-slate-900 pt-1">What we keep</p>
        <p>Payment and invoice records, as the law requires for tax (your name is removed from them).</p>
      </div>
      {blocked?.blocked ? (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-[13px] text-amber-900">
          <p className="font-bold mb-1">Finish these first</p>
          <ul className="list-disc pl-5 space-y-0.5">{(blocked.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          <p className="mt-2">You can delete once no money is on hold.</p>
        </div>
      ) : null}
      {checkFailed && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[13px] text-slate-700" role="alert" data-testid="delete-check-failed">
          <p>Couldn't check your account.</p>
          <button type="button" onClick={() => setCheckKey((k) => k + 1)} className="mt-1 min-h-[44px] font-bold text-[#7C3AED]">Try again</button>
        </div>
      )}
      <button type="button" onClick={start} disabled={busy || checkFailed || blocked == null || blocked?.blocked} className="w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-[15px] font-bold active:scale-[0.99] transition disabled:opacity-50">
        {checkFailed ? "Continue to delete" : blocked == null ? "Checking…" : busy ? "Please wait…" : "Continue to delete"}
      </button>
      <button type="button" onClick={() => setStep(null)} className="w-full h-11 rounded-2xl text-slate-600 text-[14px] font-semibold">Keep my account</button>
    </div>
  );
}
