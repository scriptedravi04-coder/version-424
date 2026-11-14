export const parseNumberInput = (raw) => { const n = parseCount(raw); return n === null ? "" : n; };

export const formatRupeesInput = (raw) => {
  if (!raw) return "";
  const num = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
  if (isNaN(num)) return "";
  return "₹" + num.toLocaleString('en-IN');
};

export const formatNumberDisplay = (raw) => {
  if (!raw && raw !== 0) return "";
  // don't format if it's already got K, M, L in it or if they are typing it
  if (String(raw).match(/[KkLmM]/)) return raw;
  const num = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
  if (isNaN(num)) return raw;
  return num.toLocaleString('en-IN');
};

// Session 34: ONE number rule for the creator application — same as the server
// (backend/creatorApplication.ts parseCount; creatorFormValidation.test.js checks both agree).
// "1.5L" / "1.5 lakh" → 150000, "150K" → 150000, "1,50,000" → 150000, "1.2M", "2cr".
export const parseCount = (raw) => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  const s = String(raw).toLowerCase().replace(/[₹,\s]/g, "").replace(/rs\.?/g, "");
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lac|lakh|lakhs|m|mn|million|cr|crore|crores)?\+?$/);
  if (!m) return null;
  const mult = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7, crores: 1e7 };
  const v = Math.round(parseFloat(m[1]) * (m[2] ? mult[m[2]] : 1));
  return Number.isFinite(v) ? v : null;
};

/** 150000 → "1,50,000" */
export const formatIndian = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");

/** Small hint under a number field: "1.5L" → "= 1,50,000". Empty when nothing to add. */
export const countHint = (raw) => {
  const n = parseCount(raw);
  if (n === null) return "";
  return /[a-z]/i.test(String(raw)) ? `= ${formatIndian(n)}` : "";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Session 34 (Ravi): required = photo, name, gender, email, mobile, Instagram handle, city,
 * followers, avg reach, price for 1 UGC video, niche. Optional = profile link, collab types,
 * experience, sample links, notes. Same rules as the server.
 */
export const validateCreatorForm = (fields) => {
  const f = fields || {};
  const errors = {};
  const handle = String(f.social_handle || "").trim().replace(/^@+/, "");
  const digits = String(f.mobile || "").replace(/\D/g, "");
  const cc = f.country_code || "+91";
  if (!f.photo) errors.photo = "Profile photo is required";
  if (String(f.name || "").trim().length < 2) errors.name = "Full name is required";
  if (!["Male", "Female", "Other"].includes(f.gender)) errors.gender = "Gender is required";
  if (!EMAIL_RE.test(String(f.email || "").trim())) errors.email = "Enter a valid email address";
  if (cc === "+91" ? !/^[6-9]\d{9}$/.test(digits) : (digits.length < 6 || digits.length > 12)) {
    errors.mobile = cc === "+91" ? "Enter a valid 10-digit mobile number" : "Enter a valid mobile number";
  }
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) errors.social_handle = "Instagram handle is required";
  if (String(f.city || "").trim().length < 2) errors.city = "City is required";
  const followers = parseCount(f.followers);
  if (followers === null) errors.followers = "Enter followers, e.g. 12,500 or 1.5L"; // v397: under 500 goes to the work-link page
  const reach = parseCount(f.avg_reach);
  if (reach === null || reach < 1) errors.avg_reach = "Enter avg reach, e.g. 8,000 or 1.2L";
  const price = parseCount(f.charges);
  if (price === null || price < 100) errors.charges = "Enter your price (at least ₹100)";
  const niche = Array.isArray(f.niche) ? f.niche[0] : f.niche;
  if (!String(niche || "").trim()) errors.niche = "Choose your main niche";
  const link = String(f.instagram_link || "").trim();
  if (link && !/^https?:\/\//i.test(link)) errors.instagram_link = "Link must start with https://";
  return { isValid: Object.keys(errors).length === 0, errors };
};

/** True when every required field is filled and valid — drives the disabled state of Continue. */
export const isCreatorFormComplete = (fields) => validateCreatorForm(fields).isValid;

export const checkChargesWarning = (reachStr, chargesRaw) => {
  if (!chargesRaw || !reachStr) return null;

  // Session 34: same number rule as the form and the server ("1.5L" = 1,50,000).
  const reach = parseCount(reachStr) || 0;
  const charges = parseCount(chargesRaw) || 0;
  if (!reach || !charges) return null;

  const benchmark = reach * 0.30;
  const fairRounded = Math.round(benchmark);

  if (charges > benchmark) {
    return {
      type: "warning",
      fair: fairRounded,
      reach,
      charges,
      message: `⚠️ Heads up! Based on your avg reach of ${reach.toLocaleString('en-IN')}, a competitive rate would be around ₹${fairRounded.toLocaleString('en-IN')} (₹0.30/view). Your quoted charges are higher — you can still submit, brands may negotiate.`
    };
  }

  return {
    type: "ok",
    fair: fairRounded,
    reach,
    charges,
    message: "✅ Your charges look justified for your reach. Brands will find this competitive."
  };
};
