import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

// Session 39 (M13): pages opened from the five main pages have no bottom bar, so they carry
// a back arrow. Goes back one step; with no history (opened from a link) it goes Home.
export default function MobileBackButton({ fallback = "/dashboard", className = "" }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return (
    <button
      type="button"
      aria-label="Back" /* v332: 40px tap target (was 36px) */
      onClick={goBack}
      className={`w-10 h-10 shrink-0 rounded-full bg-[#F2F2F7] flex items-center justify-center active:scale-95 transition-transform ${className}`}
    >
      <ChevronLeft size={19} className="text-[#0A0A0A]" />
    </button>
  );
}
