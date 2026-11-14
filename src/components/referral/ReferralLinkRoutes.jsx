import React from "react";
import { Navigate, useParams } from "react-router-dom";
import { rememberReferral, rememberCreatorCode } from "../../lib/referralCapture";

// /r/<CODE>  → remember the inviter and open creator SIGN-UP (Ravi: referrals should bring sign-ups).
// The code is also passed as ?ref= so the sign-up form sends it; ReferralClaimer is the backup
// (Google sign-up, or the visitor signs up later within 30 days).
export function ReferralLanding() {
  const { code } = useParams();
  rememberReferral(code);
  const ref = encodeURIComponent(String(code || "").trim().toUpperCase());
  return <Navigate to={`/signup?role=creator&ref=${ref}`} replace />;
}

// v290 (Ravi): /b/<CODE> → the same inviter, but opens BRAND sign-up (the "Invite a brand" link).
export function BrandReferralLanding() {
  const { code } = useParams();
  rememberReferral(code);
  const ref = encodeURIComponent(String(code || "").trim().toUpperCase());
  return <Navigate to={`/signup?role=brand&ref=${ref}`} replace />;
}

// /code/<CODE> → remember a creator code; ReferralClaimer saves it once the creator is signed in
export function CreatorCodeLanding() {
  const { code } = useParams();
  rememberCreatorCode(code);
  return <Navigate to="/earnings" replace />;
}
