// Session 22. The frontend had ~47 empty `catch {}` blocks (localStorage, JSON.parse fallbacks,
// best-effort UI calls). Behaviour is unchanged — the error is still swallowed — but during
// development it now shows in the console, once per place per minute, instead of vanishing.
const last = new Map();
const isDev = (() => {
  try { return !!import.meta.env?.DEV; } catch (e) { return false; }
})();

export function ignored(where, err) {
  if (!isDev) return;
  const now = Date.now();
  if (now - (last.get(where) || 0) < 60_000) return;
  last.set(where, now);
  console.debug(`[ignored] ${where}:`, err?.message || err);
}
