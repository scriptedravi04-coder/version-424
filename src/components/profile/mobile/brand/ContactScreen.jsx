import React, { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../lib/api";
import {
  MobileScreen, Section, Field, TextInput, PrimaryButton, SecondaryButton, Pill,
} from "./brandMobileUi";

// Screen 1e — point of contact. Phone and name save straight to brand_profiles.
// The business email goes through the same real OTP pair BrandSettings.jsx uses
// (/otp/send then /otp/verify) before it's written.
//
// Note: the backend stores no "email verified" boolean on brand_profiles, so this
// screen shows the email as verified only for the session in which the OTP was
// actually confirmed — it does not claim a verified state the row can't back up.

export default function ContactScreen({ onBack, profile, saving, onSave, loadFailed = false }) {
  const [name, setName] = useState(profile.pocName || "");
  const [designation, setDesignation] = useState(profile.pocDesignation || "");
  const [phone, setPhone] = useState(profile.pocPhone || "");
  const [email, setEmail] = useState(profile.pocEmail || "");

  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState(null);

  const emailChanged = email.trim() !== (profile.pocEmail || "").trim();
  const emailConfirmed = verifiedEmail && verifiedEmail === email.trim();

  const sendOtp = async () => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { // v415: "a@b" passed and the code went nowhere
      toast.error("Enter a valid business email.");
      return;
    }
    setSendingOtp(true);
    try {
      const res = await api.post("/otp/send", { target: "email", value });
      if (res.data?.ok) {
        setOtpOpen(true);
        toast.success(`Code sent to ${value}`);
      } else {
        toast.error("Couldn't send the code. Please try again."); // v332: the button used to do nothing here
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || "Couldn't send the code.");
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (verifying || otp.length !== 6) return; // v415: Enter key can't double-submit
    const value = email.trim();
    setVerifying(true);
    try {
      const res = await api.post("/otp/verify", { target: "email", value, code: otp.trim() });
      if (!res.data?.ok) {
        toast.error("That code didn't work. Please check it and try again."); // v332: no silent failure
      } else {
        const ok = await onSave({ pocEmail: value }, { silent: true });
        if (ok) {
          setVerifiedEmail(value);
          setOtpOpen(false);
          setOtp("");
          toast.success("Email verified and linked.");
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error || "That code didn't work.");
    } finally {
      setVerifying(false);
    }
  };

  // v415: a phone number with too few digits was saved as typed
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneError = phone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 13) ? "Enter a valid mobile number." : "";
  const detailsDirty =
    name !== (profile.pocName || "") ||
    designation !== (profile.pocDesignation || "") ||
    phone !== (profile.pocPhone || "");

  return (
    <MobileScreen
      title="Point of contact"
      onBack={onBack}
      footer={
        <PrimaryButton
          disabled={saving || !detailsDirty || Boolean(phoneError) || loadFailed}
          busy={saving}
          onClick={() => onSave({ pocName: name.trim(), pocDesignation: designation.trim(), pocPhone: phone.trim() })}
        >
          {saving ? "Saving…" : "Save contact"}
        </PrimaryButton>
      }
    >
      <Section hint="Our support and payments team use these details to reach you.">{/* v415: no "secure payment hold" jargon */}
        <Field label="Contact name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </Field>

        <Field label="Designation">
          <TextInput
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Founder, Marketing head…"
          />
        </Field>

        <Field
          label="Mobile number"
          hint="No code needed — tap Save contact to keep it. Used only if our support or payments team needs to reach you." /* v358: nothing saved "as you type" · v415: plain wording */
        >
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 99999 88800"
            inputMode="tel"
            type="tel" // v332
            autoComplete="tel"
            aria-invalid={Boolean(phoneError) || undefined}
          />
          {phoneError && <p className="mt-1 text-[12px] font-semibold text-red-600" role="alert">{phoneError}</p>}
        </Field>
      </Section>

      <div className="border-t border-gray-100" />

      <Section
        title="Business email"
        hint="Payment receipts, campaign approvals and dispute notices all go here." /* v415: plain wording */
      >
        {/* v332: no "Verify to confirm" badge when there is no email at all */}
        {/* v358: the email already on file shows no warning; only a NEW email says it needs verifying (Save contact doesn't change the email) */}
        {(emailConfirmed || (email.trim() && emailChanged)) && (
        <div className="flex items-center gap-2 mb-2">
          {emailConfirmed
            ? <Pill tone="green">Verified</Pill>
            : <Pill tone="amber">New email · verify to save it</Pill>}
        </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1 min-w-0">{/* v332: long emails don't push the Verify button off a 320px screen */}
            <TextInput
              value={email}
              onChange={(e) => { setEmail(e.target.value); setOtpOpen(false); setOtp(""); }}
              aria-label="Business email" // v415: the field had no label
              placeholder="ops@yourbrand.com"
              inputMode="email"
              type="email"
              autoCapitalize="none" // v332: phones capitalised the first letter of the email
            />
          </div>
          <SecondaryButton onClick={sendOtp} disabled={sendingOtp || verifying || !email.trim()}>
            {sendingOtp ? "Sending…" : otpOpen ? "Resend" : "Verify"}
          </SecondaryButton>
        </div>

        {otpOpen && (
          <div className="mt-3 rounded-2xl border border-gray-200 p-4">
            <p className="text-xs text-gray-600 mb-3">
              Enter the 6-digit code we emailed to {email.trim()}.
            </p>
            <div className="flex gap-2">
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="6-digit code" // v332: label + phone can autofill the emailed code
                placeholder="••••••"
                autoFocus // v415: the code box takes focus when it opens
                onKeyDown={(e) => { if (e.key === "Enter") verifyOtp(); }}
                className="flex-1 min-w-0 h-11 rounded-xl border border-gray-200 bg-gray-50 text-center text-base font-semibold tracking-[0.3em] text-gray-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white"
              />
              <button
                type="button"
                onClick={verifyOtp}
                aria-busy={verifying || undefined} // v415
                disabled={verifying || otp.length !== 6}
                className="h-11 px-5 rounded-xl bg-[#7C3AED] text-white font-bold text-sm disabled:opacity-50"
              >
                {verifying ? "Checking…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
      </Section>
    </MobileScreen>
  );
}
