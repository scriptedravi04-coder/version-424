import React from "react";
import { PAYMENT_SVGS } from "./paymentLogoSvgs";

// v366 (Ravi: new checkout design + "updated logos ki file — kahin pe lagana ho toh"). Real payment marks from
// Ravi's file: UPI, Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, Visa, Mastercard, RuPay, American Express, Razorpay.
// <PaymentLogo name="phonepe" height={20} /> — width follows the mark's own shape. Offline (data: URI, no network).

export const PAYMENT_NAMES = {
  upi: "UPI", gpay: "Google Pay", phonepe: "PhonePe", paytm: "Paytm", bhim: "BHIM", amazonpay: "Amazon Pay",
  visa: "Visa", mastercard: "Mastercard", rupay: "RuPay", amex: "American Express", razorpay: "Razorpay",
};
export const PAYMENT_KEYS = Object.keys(PAYMENT_NAMES);

/** "Google Pay", "google_pay", "gpay", "amazon_pay", "RuPay" … → key, or null. Pure. */
export function paymentKeyOf(v) {
  const s = String(v || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (!s) return null;
  if (s === "gpay" || s.includes("googlepay") || s === "tez") return "gpay";
  if (s.includes("phonepe")) return "phonepe";
  if (s.includes("paytm")) return "paytm";
  if (s.includes("bhim")) return "bhim";
  if (s.includes("amazon")) return "amazonpay";
  if (s.includes("mastercard") || s === "mc") return "mastercard";
  if (s.includes("visa")) return "visa";
  if (s.includes("rupay")) return "rupay";
  if (s.includes("amex") || s.includes("americanexpress")) return "amex";
  if (s.includes("razorpay")) return "razorpay";
  if (s === "upi") return "upi";
  return null;
}

const URI_CACHE = {};
export function paymentLogoUri(key) {
  const k = paymentKeyOf(key) || key;
  if (!PAYMENT_SVGS[k]) return null;
  if (!URI_CACHE[k]) URI_CACHE[k] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(PAYMENT_SVGS[k]);
  return URI_CACHE[k];
}

export default function PaymentLogo({ name, height = 16, maxWidth = undefined, alt = undefined, style = undefined, className = undefined }) {
  const k = paymentKeyOf(name) || name;
  const src = paymentLogoUri(k);
  if (!src) return null;
  return (
    <img src={src} alt={alt ?? PAYMENT_NAMES[k] ?? ""} draggable="false" className={className} data-payment-logo={k}
      style={{ height, width: "auto", maxWidth, display: "block", flexShrink: 0, ...style }} />
  );
}
