import React, { useId } from "react";

// v364 (Ravi: "Social_Logos_offline.html — pure app mai jahan jahan in apps ke logo lagenge, waha ye laga. Ye real hai,
// inse trust badhega"). The real marks, drawn inline (no image links, so they also show offline in the app):
//   • from Ravi's file: Instagram (gradient app icon), Facebook (#0866FF), WhatsApp (#25D366), YouTube (#FF0000),
//     Meta (#0064E1 → #0082FB)
//   • the same official marks for the rest: LinkedIn (#0A66C2), X (black), Snapchat (#FFFC00), Google "G"
//     (four colours on white, per Google's sign-in rules) and Apple (black).
// <SocialLogo platform="instagram" size={20} variant="color" | "mono" | "tile" />
//   color = the brand's own colours · mono = one colour (currentColor) for chips on coloured backgrounds ·
//   tile  = the colour mark centred in a soft rounded square (replaces the old letter boxes like "f" / "in" / "X").

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "whatsapp", "youtube", "meta", "linkedin", "x", "snapchat", "google", "apple", "threads"];

export const SOCIAL_COLORS = {
  instagram: "#E4405F", facebook: "#0866FF", whatsapp: "#25D366", youtube: "#FF0000", meta: "#0082FB",
  linkedin: "#0A66C2", x: "#000000", snapchat: "#FFFC00", google: "#4285F4", apple: "#000000", threads: "#000000",
};
export const SOCIAL_NAMES = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", youtube: "YouTube", meta: "Meta",
  linkedin: "LinkedIn", x: "X", snapchat: "Snapchat", google: "Google", apple: "Apple", threads: "Threads",
};
const TILE_BG = {
  instagram: "#FFF0F6", facebook: "#EEF4FF", whatsapp: "#EAFBF1", youtube: "#FFF1F1", meta: "#EEF5FF",
  linkedin: "#EEF5FB", x: "#F2F2F3", snapchat: "#FFFDE0", google: "#FFFFFF", apple: "#F2F2F3", threads: "#F2F2F3",
};

/** "Instagram", "instagram.com/x", "@ig", "yt", "YouTube Short", "twitter", "fb", "in" … → platform key, or null. Pure. */
export function socialPlatformOf(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return null;
  if (/(^|[^a-z])(instagram|insta|ig)([^a-z]|$)|instagr\.am/.test(s)) return "instagram";
  if (/youtube|youtu\.be|(^|[^a-z])yt([^a-z]|$)/.test(s)) return "youtube";
  if (/whatsapp|wa\.me|(^|[^a-z])wa([^a-z]|$)/.test(s)) return "whatsapp";
  if (/threads/.test(s)) return "threads";
  if (/facebook|fb\.com|fb\.me|(^|[^a-z])fb([^a-z]|$)/.test(s)) return "facebook";
  if (/linkedin|(^|[^a-z])li([^a-z]|$)|^in$/.test(s)) return "linkedin";
  if (/twitter|(^|[^a-z])x\.com|^x$|^𝕏$/.test(s)) return "x";
  if (/snapchat|(^|[^a-z])snap([^a-z]|$)/.test(s)) return "snapchat";
  if (/(^|[^a-z])meta([^a-z]|$)/.test(s)) return "meta";
  if (/google|gmail/.test(s)) return "google";
  if (/apple|icloud/.test(s)) return "apple";
  return null;
}

const P = {
  facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  whatsappBubble: "M12.05 2.1c5.45 0 9.89 4.43 9.89 9.88 0 5.45-4.44 9.88-9.89 9.88a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.17 6.53 6.6 2.1 12.05 2.1Z",
  whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z",
  youtube: "M27.4 3.12A3.5 3.5 0 0 0 24.93.6C22.75 0 14 0 14 0S5.25 0 3.07.6A3.5 3.5 0 0 0 .6 3.12C0 5.32 0 10 0 10s0 4.68.6 6.88a3.5 3.5 0 0 0 2.47 2.52C5.25 20 14 20 14 20s8.75 0 10.93-.6a3.5 3.5 0 0 0 2.47-2.52C28 14.68 28 10 28 10s0-4.68-.6-6.88Z",
  youtubePlay: "M11.2 14.29 18.47 10 11.2 5.71Z",
  meta: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z",
  linkedin: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  snapchat: "M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z",
  apple: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701",
  threads: "M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z",
};

function Svg({ size, viewBox, title, children, style, className }) {
  const s = typeof size === "number" ? size : /%$/.test(String(size)) ? size : Number(size) || 20; // "100%" = fill the parent
  return (
    <svg width={s} height={s} viewBox={viewBox} role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}
      focusable="false" style={{ display: "block", flexShrink: 0, ...style }} className={className} xmlns="http://www.w3.org/2000/svg">
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

function ColorMark({ platform, size, title, style, className, uid }) {
  const id = (k) => `sl-${uid}-${k}`;
  switch (platform) {
    case "instagram":
      // Ravi's file: the full-colour app icon (radial gradient + soft gloss).
      return (
        <Svg size={size} viewBox="0 0 512 512" title={title} style={style} className={className}>
          <defs>
            <radialGradient id={id("a")} cx="0.27" cy="1.02" r="1.25">
              <stop offset="0" stopColor="#FFD600" /><stop offset="0.18" stopColor="#FFB000" /><stop offset="0.36" stopColor="#FF6930" />
              <stop offset="0.55" stopColor="#FF0069" /><stop offset="0.75" stopColor="#D300C5" /><stop offset="1" stopColor="#7638FA" />
            </radialGradient>
            <radialGradient id={id("b")} cx="0.05" cy="0" r="0.6">
              <stop offset="0" stopColor="#4F5BD5" stopOpacity="0.85" /><stop offset="1" stopColor="#7638FA" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={id("g")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.38" /><stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.08" /><stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            {/* v366: Ravi's updated logo file (Social_Logos.dc_1) adds a soft edge highlight + a shadow under the glyph */}
            <linearGradient id={id("e")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" /><stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" /><stop offset="1" stopColor="#000000" stopOpacity="0.18" />
            </linearGradient>
            <filter id={id("s")} x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#5A0A3C" floodOpacity="0.28" /></filter>
          </defs>
          <rect width="512" height="512" rx="120" fill={`url(#${id("a")})`} />
          <rect width="512" height="512" rx="120" fill={`url(#${id("b")})`} />
          <path d="M120 0h272a120 120 0 0 1 120 120v84C430 232 340 246 256 246S82 232 0 204v-84A120 120 0 0 1 120 0Z" fill={`url(#${id("g")})`} />
          <rect x="3" y="3" width="506" height="506" rx="117" fill="none" stroke={`url(#${id("e")})`} strokeWidth="6" />
          <g filter={`url(#${id("s")})`}>
            <g fill="none" stroke="#FFFFFF" strokeWidth="38"><rect x="100" y="100" width="312" height="312" rx="88" /><circle cx="256" cy="256" r="74" /></g>
            <circle cx="346" cy="166" r="21" fill="#FFFFFF" />
          </g>
        </Svg>
      );
    case "facebook":
      return (
        <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}>
          <circle cx="12" cy="12" r="11.6" fill="#FFFFFF" /><path fill="#0866FF" d={P.facebook} />
        </Svg>
      );
    case "whatsapp":
      return (
        <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}>
          <path fill="#FFFFFF" d={P.whatsappBubble} /><path fill="#25D366" d={P.whatsapp} />
        </Svg>
      );
    case "youtube":
      return (
        <Svg size={size} viewBox="0 -4 28 28" title={title} style={style} className={className}>
          <path fill="#FF0000" d={P.youtube} /><path fill="#FFFFFF" d={P.youtubePlay} />
        </Svg>
      );
    case "meta":
      return (
        <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}>
          <defs><linearGradient id={id("m")} x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stopColor="#0064E1" /><stop offset="0.5" stopColor="#0073EE" /><stop offset="1" stopColor="#0082FB" /></linearGradient></defs>
          <path fill={`url(#${id("m")})`} d={P.meta} />
        </Svg>
      );
    case "linkedin":
      return <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}><rect x="1" y="1" width="22" height="22" rx="3" fill="#FFFFFF" /><path fill="#0A66C2" d={P.linkedin} /></Svg>;
    case "x":
      return <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}><path fill="#000000" d={P.x} /></Svg>;
    case "threads":
      return <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}><path fill="#000000" d={P.threads} /></Svg>;
    case "snapchat":
      return (
        <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}>
          <rect width="24" height="24" rx="5.5" fill="#FFFC00" />
          <path fill="#FFFFFF" stroke="#000000" strokeWidth="1.1" strokeLinejoin="round" d={P.snapchat} transform="translate(2.4 2.6) scale(0.8)" />
        </Svg>
      );
    case "google":
      // Google sign-in rules: the four-colour "G" on white, never recoloured.
      return (
        <Svg size={size} viewBox="0 0 48 48" title={title} style={style} className={className}>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </Svg>
      );
    case "apple":
      return <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}><path fill="#000000" d={P.apple} /></Svg>;
    default:
      return null;
  }
}

function MonoMark({ platform, size, title, style, className, color = "currentColor" }) {
  const box = (vb, d, extra) => <Svg size={size} viewBox={vb} title={title} style={style} className={className}>{extra}<path fill={color} fillRule="evenodd" d={d} /></Svg>;
  switch (platform) {
    case "instagram":
      return (
        <Svg size={size} viewBox="0 0 24 24" title={title} style={style} className={className}>
          <g fill="none" stroke={color} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5.2" /><circle cx="12" cy="12" r="4.2" /></g>
          <circle cx="17.3" cy="6.7" r="1.25" fill={color} />
        </Svg>
      );
    case "facebook": return box("0 0 24 24", P.facebook);
    case "whatsapp": return box("0 0 24 24", P.whatsapp);
    case "youtube": return box("0 -4 28 28", `${P.youtube} ${P.youtubePlay}`);
    case "meta": return box("0 0 24 24", P.meta);
    case "linkedin": return box("0 0 24 24", P.linkedin);
    case "x": return box("0 0 24 24", P.x);
    case "threads": return box("0 0 24 24", P.threads);
    case "snapchat": return box("0 0 24 24", P.snapchat);
    case "apple": return box("0 0 24 24", P.apple);
    case "google": return <ColorMark platform="google" size={size} title={title} style={style} className={className} uid="m" />; // never recoloured
    default: return null;
  }
}

/**
 * Real platform logo. `platform` may be a key ("instagram") or any text socialPlatformOf() understands
 * ("Instagram", "youtube.com/…"). Unknown → renders `fallback` (default nothing).
 */
export default function SocialLogo({ platform, size = 20, variant = "color", title = undefined, className = undefined, style = undefined, color = undefined, radius = undefined, fallback = null }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const key = SOCIAL_PLATFORMS.includes(String(platform || "").toLowerCase()) ? String(platform).toLowerCase() : socialPlatformOf(platform);
  if (!key) return fallback;
  const label = title === undefined ? undefined : title || SOCIAL_NAMES[key];
  if (variant === "mono") return <MonoMark platform={key} size={size} title={label} style={style} className={className} color={color} />;
  if (variant === "tile") {
    const s = Number(size) || 36;
    // Instagram and Snapchat marks are already tiles; the rest sit centred on a soft brand-tinted square.
    if (key === "instagram" || key === "snapchat") {
      return <span className={className} style={{ display: "inline-flex", width: s, height: s, flexShrink: 0, ...style }} data-platform={key}><ColorMark platform={key} size={s} title={label} uid={uid} /></span>;
    }
    return (
      <span className={className} data-platform={key}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: s, height: s, flexShrink: 0,
          borderRadius: radius ?? Math.round(s * 0.28), background: TILE_BG[key], boxShadow: key === "google" ? "inset 0 0 0 1px #E5E7EB" : undefined, ...style }}>
        <ColorMark platform={key} size={Math.round(s * (key === "youtube" ? 0.62 : 0.56))} title={label} uid={uid} />
      </span>
    );
  }
  return <ColorMark platform={key} size={size} title={label} style={style} className={className} uid={uid} />;
}

// v364: a drop-in for places that keep an icon COMPONENT in a config ({ icon: Instagram } → { icon: logoIcon("instagram") })
// and render it as <Icon size={18} />. Same size prop, real logo.
const ICON_CACHE = {};
export function logoIcon(platform) {
  const key = String(platform || "").toLowerCase();
  if (!ICON_CACHE[key]) {
    const C = ({ size = 18, className, style }) => <SocialLogo platform={key} size={size} className={className} style={style} />;
    C.displayName = `Logo(${key})`;
    ICON_CACHE[key] = C;
  }
  return ICON_CACHE[key];
}

// v364: the phone "app icon" look used by onboarding channel rows — fills its parent box.
export function SocialAppIcon({ platform, radius = 9 }) {
  const key = SOCIAL_PLATFORMS.includes(String(platform || "").toLowerCase()) ? String(platform).toLowerCase() : socialPlatformOf(platform);
  if (!key) return null;
  const box = (bg, child, border) => (
    <div data-platform={key} style={{ width: "100%", height: "100%", borderRadius: radius, background: bg, boxShadow: border ? "inset 0 0 0 1px #ECECF1" : undefined, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{child}</div>
  );
  if (key === "instagram" || key === "snapchat") return <div data-platform={key} style={{ width: "100%", height: "100%" }}><SocialLogo platform={key} size="100%" /></div>;
  if (key === "x" || key === "threads" || key === "apple") return box("#000000", <SocialLogo platform={key} variant="mono" color="#FFFFFF" size="52%" />);
  if (key === "facebook") return box("#FFFFFF", <SocialLogo platform="facebook" size="100%" />);
  return box("#FFFFFF", <SocialLogo platform={key} size="64%" />, true);
}
