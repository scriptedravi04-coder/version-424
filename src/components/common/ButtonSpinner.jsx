import React from "react";
import { Loader2 } from "lucide-react";

// The only loading indicator a button shows while its own action runs (useBusy). Keeps the
// label so the button doesn't jump in width.
export default function ButtonSpinner({ label = null, size = 14, className = "" }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1.5 ${className}`} role="status" aria-live="polite">
      <Loader2 size={size} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Working…</span>}
    </span>
  );
}
