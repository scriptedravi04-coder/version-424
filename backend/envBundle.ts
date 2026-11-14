// v375 (Ravi: "bahut saari env keys daalni padti hain, pareshan ho jaata hoon"): ONE hosting secret instead of many.
// Put every setting in a secret called YBEX_ENV, one per line, exactly like a .env file:
//     SUPABASE_URL=https://xxxx.supabase.co
//     RAZORPAY_KEY_ID=rzp_live_xxx
//     # lines starting with # are ignored, blank lines too
// At start-up (before any other server file reads process.env) each KEY=VALUE fills process.env — but only when that
// key isn't already set on its own, so a secret set separately always wins. Values are never logged. Keys stay out of
// the code / GitHub (that is the point: anyone with the code must not get the session or payment secrets).
// Note: VITE_* values are read while the website is BUILT; set those as normal build settings if a build needs them.

/** v385 (Ravi 30 Oct: Google sign-in "didn't finish"): `GOOGLE_CLIENT_SECRET=GOCSPX-xxx  # ── Apple sign-in (iPhone) ──` was loaded
 *  WITH the trailing comment, so Google answered 401 invalid_client. An unquoted value ends at the first " #" (a # that
 *  follows a space / tab); a # inside a value (no space before it) stays. Quoted values keep everything inside the quotes.
 *  Also used on the sign-in keys themselves, in case they were set as separate secrets with a comment on the end. Pure. */
export function cleanEnvVal(raw: any): string {
  let v = String(raw ?? "").trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1);
  const q = /^(["'])(.*?)\1(?:\s+#.*)?$/.exec(v); // "value"  # comment
  if (q) return q[2];
  if (v.startsWith("#")) return ""; // KEY=# comment
  v = v.replace(/\s+#.*$/, "");
  return v.trim();
}

/** "KEY=VALUE" lines → object. Pure (tests). Keeps "=" inside values; strips matching quotes and an "export " prefix. */
export function parseEnvBundle(text: any): Record<string, string> {
  const out: Record<string, string> = {};
  let src = String(text || "");
  // v378 (live 28 Oct: "SUPABASE_SERVICE_ROLE_KEY daal diya phir bhi login unavailable"): some secret boxes save a
  // pasted multi-line value as ONE line (new lines become spaces or a literal "\n"), so only the first key was read.
  // No real new line → split before every "KEY=" that follows a space or a literal \n.
  if (!/[\r\n]/.test(src)) src = splitOutsideJson(src, /(?:\s+|\\n)(?=(?:export\s+)?[A-Z_][A-Z0-9_]*\s*=)/);
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2];
    // v433 (Ravi's YBEX_ENV, 13 Nov): "BROADCAST_DAILY_LIMIT=  FCM_SERVICE_ACCOUNT_JSON= {" — a second KEY= pasted on the same
    // line. The first key is empty and the rest is read as its own line (it used to become the first key's value).
    const second = /^([A-Z_][A-Z0-9_]*\s*=.*)$/.exec(val.trim());
    if (second) { lines[i] = second[1]; setVal(out, m[1], ""); i--; continue; }
    // v433: an unquoted JSON value ({ … } straight from the Firebase file, over many lines) continues until its braces close.
    if (/^\s*[{[]/.test(val) && jsonDepth(val) > 0) {
      let j = i; let acc = val;
      while (jsonDepth(acc) > 0 && j + 1 < lines.length) { j++; acc += "\n" + lines[j]; }
      if (jsonDepth(acc) === 0) { setVal(out, m[1], acc.trim()); i = j; continue; }
    }
    // v388 (QA: an APNS .p8 / FCM key pasted over several lines was cut after its first line — native push stayed off without a word):
    // a value that opens with a quote and does not close it on the same line continues on the following lines until the closing quote.
    const q = /^\s*(["'])/.exec(val);
    if (q && !new RegExp(`^\\s*${q[1]}[\\s\\S]*${q[1]}\\s*(?:\\s#.*)?$`).test(val)) {
      let j = i + 1; let acc = val;
      while (j < lines.length) {
        acc += "\n" + lines[j];
        if (new RegExp(`${q[1]}\\s*(?:\\s#.*)?$`).test(lines[j].trim())) break;
        j++;
      }
      if (j < lines.length) { val = acc; i = j; }
    }
    let v = cleanEnvVal(val); // v385: inline "# comment" no longer ends up inside the value
    // v388: KEY_B64=<base64> is an easy single-line way to give a multi-line secret: it is stored as KEY (decoded).
    const b64 = /^(.*)_B64$/.exec(m[1]);
    if (b64 && v) { try { setVal(out, b64[1], Buffer.from(v, "base64").toString("utf8")); } catch { /* keep the raw key below */ } }
    setVal(out, m[1], v);
  }
  return out;
}

/** v433: the same key twice ("FCM_SERVICE_ACCOUNT_JSON=" empty in its section and filled lower down) — an empty line
 *  never wipes a value given elsewhere; the last filled one wins. */
function setVal(out: Record<string, string>, k: string, v: string) {
  if (v === "" && out[k]) return;
  out[k] = v;
}
/** v433: how many { / [ are still open in a JSON text (strings and escapes skipped). Pure. */
export function jsonDepth(text: string): number {
  let d = 0, inStr = false, esc = false;
  for (const ch of String(text)) {
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") d++;
    else if (ch === "}" || ch === "]") d = Math.max(0, d - 1);
  }
  return inStr ? Math.max(d, 1) : d;
}
/** v433: split a one-line bundle before each KEY=, but never inside a { … } JSON value. Pure. */
function splitOutsideJson(src: string, rx: RegExp): string {
  const parts: string[] = []; let start = 0, d = 0, inStr = false, esc = false;
  const sticky = new RegExp(rx.source, "y");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (d > 0 && ch === '"') { inStr = true; continue; }
    if (ch === "{" || ch === "[") { d++; continue; }
    if ((ch === "}" || ch === "]") && d > 0) { d--; continue; }
    if (d === 0) { sticky.lastIndex = i; const m = sticky.exec(src); if (m && m[0].length) { parts.push(src.slice(start, i)); start = i + m[0].length; i = start - 1; } }
  }
  parts.push(src.slice(start));
  return parts.join("\n");
}

/** Fill env from the bundle (only empty keys). Returns the key names it set (names only, never values). */
export function applyEnvBundle(env: NodeJS.ProcessEnv = process.env, bundleName = "YBEX_ENV"): string[] {
  const set: string[] = [];
  const parsed = parseEnvBundle(env[bundleName]);
  for (const [k, v] of Object.entries(parsed)) {
    if (k === bundleName || v === "") continue;
    if (env[k] === undefined || env[k] === "") { env[k] = v; set.push(k); }
    else { const c = cleanEnvVal(env[k]); if (c !== env[k]) env[k] = c; } // v387: a separately set secret with a "# comment" on the end
  }
  return set;
}

export let ENV_BUNDLE_COUNT = 0; // v378: how many settings YBEX_ENV filled (shown by /api/health, number only)
try {
  const names = applyEnvBundle();
  ENV_BUNDLE_COUNT = names.length;
  if (names.length) console.log(`[env] YBEX_ENV filled ${names.length} settings: ${names.join(", ")}`);
} catch (e: any) {
  console.warn("[env] YBEX_ENV could not be read:", e?.message || e);
}
