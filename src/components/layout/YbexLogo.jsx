import React from "react";

export default function YbexLogo({ className = "h-8", style = {} }) {
  return (
    <svg 
      viewBox="610 270 1230 380" 
      className={`fill-current text-slate-900 dark:text-white ${className}`}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-label="Ybex Logo"
      role="img"
    >
      <g fill="currentColor">
        <polygon points="626,305 706,305 792,449 878,305 953,305 827,515 827,630 752,630 752,514" />
        <rect x="979" y="286" width="73" height="344" />
        <path fillRule="evenodd" d="M1150 377a101 128 0 1 1 0 256a101 128 0 1 1 0-256zM1115 436a63 69 0 1 0 0 138a63 69 0 1 0 0-138z" />
        <g transform="translate(1419 504) rotate(-25) scale(.67)">{/* v378 (Ravi): the "e" is only tilted — its bar no longer pokes out (it read as a cut ø) */}
          <path d="M-155 0H155M155 0A155 155 0 1 0 89 127" fill="none" stroke="currentColor" strokeWidth="92" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <polygon points="1558,380 1639,380 1692,452 1746,380 1823,380 1730,503 1827,630 1744,630 1690,554 1633,630 1554,630 1650,504" />
      </g>
    </svg>
  );
}
