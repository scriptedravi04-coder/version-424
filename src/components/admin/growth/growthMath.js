// Same rule as backend/adminGrowth.ts `change`: percent change, null when there is nothing to compare with.
export function change(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}
