/**
 * Utilities for campaign invitations and briefs
 */

export const getDeliverablesCount = (deliverables) => {
  if (!deliverables && deliverables !== 0) return 1;
  if (typeof deliverables === "number") return Math.max(1, deliverables);
  const str = String(deliverables).trim();
  if (!str) return 1;

  // Extract explicit counts like "1 Dedicated Reel + 2 Stories" -> 3
  const matches = str.match(/\b\d+\b/g);
  if (matches && matches.length > 0) {
    const sum = matches.reduce((acc, curr) => acc + parseInt(curr, 10), 0);
    if (sum > 0 && sum < 100) return sum;
  }

  // Otherwise count delimited tokens (commas, pluses, newlines, semicolons)
  const parts = str.split(/[,+\n;]/).map(s => s.trim()).filter(Boolean);
  return parts.length || 1;
};

export const formatBudget = (val) => {
  if (!val && val !== 0) return "Negotiable";
  const str = String(val).trim();
  if (str.toLowerCase().includes("barter")) return str;
  // v347 (Ravi approved): a range stays a range ("₹10,000 – ₹15,000"); otherwise the FIRST number only
  // (gluing all digits made "10000-15000" show as ₹1,00,00,15,000 and "15000 + 18% GST" as ₹15,00,018).
  const plain = str.replace(/(\d),(?=\d)/g, "$1");
  const range = plain.match(/^\D*?(\d+)\s*(?:-|–|—|to)\s*(?:₹|rs\.?|inr)?\s*(\d+)\D*$/i);
  if (range && Number(range[1]) > 0 && Number(range[2]) > 0) {
    return `₹${Number(range[1]).toLocaleString("en-IN")} – ₹${Number(range[2]).toLocaleString("en-IN")}`;
  }
  const first = plain.match(/\d+/);
  const num = first ? parseInt(first[0], 10) : NaN;
  if (!isNaN(num) && num > 0) {
    return `₹${num.toLocaleString("en-IN")}`;
  }
  return str.startsWith("₹") ? str : `₹${str}`;
};
