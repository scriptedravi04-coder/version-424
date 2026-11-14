// Session 21. The money/auth files had ~80 empty `catch {}` blocks: when something failed there
// was no trace at all (the OTP "sent" that never went out and the lost sessions were both hidden
// this way). Every one of them now reports here — once per location per minute, so a failure in
// a loop cannot flood the logs. Behaviour is unchanged: the error is still swallowed.

const lastLogged = new Map<string, number>();
const WINDOW_MS = 60_000;

export function logIgnored(where: string, err: any): void {
  const now = Date.now();
  const prev = lastLogged.get(where) || 0;
  if (now - prev < WINDOW_MS) return;
  lastLogged.set(where, now);
  const msg = err?.message || (typeof err === "string" ? err : "") || String(err);
  console.warn(`[ignored error] ${where}: ${msg}`);
}
