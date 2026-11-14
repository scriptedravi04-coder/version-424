import React, { useRef, useEffect } from "react";
import { countUp } from "../../lib/motion";

// Session 37: framer-motion counter (GSAP removed — one animation library for the app).
const fmt = (isCurrency) => (v) => {
  const n = Math.round(v).toLocaleString("en-IN");
  return isCurrency ? "\u20B9" + n : n;
};

export default function CountUp({ value, duration = 0.8, isCurrency = false, className = "font-mono text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight" }) {
  const elementRef = useRef(null);

  useEffect(() => {
    if (!elementRef.current) return;
    return countUp(elementRef.current, value, { duration, format: fmt(isCurrency) });
  }, [value, duration, isCurrency]);

  return (
    <span ref={elementRef} className={className}>
      {isCurrency ? "\u20B90" : "0"}
    </span>
  );
}
