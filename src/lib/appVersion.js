// v356: one place for the version label (settings footer, Eva bug reports).
// v364 (Ravi: "Settings footer abhi v356 dikhata hai"): an old VITE_APP_VERSION hosting secret (e.g. "v356") no longer
// hides the real version — the higher of the secret and this zip's version is shown.
const BUILT_IN = "v445";
const num = (v) => Number(String(v || "").replace(/[^0-9]/g, "")) || 0;
const fromEnv = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_APP_VERSION) || "";
export const APP_VERSION = num(fromEnv) > num(BUILT_IN) ? fromEnv : BUILT_IN;
