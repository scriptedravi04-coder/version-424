import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../lib/api";
import { prepareUpload } from "../../../../lib/prepareUpload"; // v416 (CR10)
import { useAuth } from "../../../../contexts/AuthContext";
import { VALID_NICHES } from "../../../../lib/constants";

// Load + save for the brand profile row, mirroring BrandSettings.jsx exactly:
// same read order (Supabase brand_profiles → GET brands/me), the same POST
// brands/profile payload, and the same Supabase upsert alongside it. Lives in the
// mobile tree so BrandSettings.jsx itself stays untouched.

export const INDUSTRY_OPTIONS = [
  "Marketing", "Beauty", "Fashion", "D2C food", "Tech", "Fitness", "Travel", "Gaming",
];

export const TEAM_SIZES = [
  "1-10 Employees", "11-50 Employees", "51-200 Employees", "500+ Employees",
];

export const CAMPAIGN_TYPES = [
  "UGC & Product Reviews", "Sponsored Posts", "Brand Ambassador",
  "Affiliate Marketing", "Event Coverage",
];

export const BUDGET_RANGES = ["Under ₹10K", "₹10K–₹50K", "₹50K–₹2L", "₹2L+"];

export const CREATOR_SIZES = ["Nano 1K–10K", "Micro 10K–100K", "Macro 100K–1M", "Mega 1M+"];

export const GENDER_FOCUS = ["Female", "Male", "All"];

export const ALL_NICHES = VALID_NICHES;

// v358: onboarding (phone + desktop) and desktop Settings save these preferences with other wording
// ("Under ₹10,000", "Nano (1K - 10K)", "Men", "Food", ids like "paid"). Read them as the chip they mean,
// so the right chip lights up; values with no chip here still show as their own selected chip.
export const CAMPAIGN_TYPE_LABELS = {
  paid: "Paid collaborations", barter: "Barter / product", onetime: "One-time content", ambassador: "Brand Ambassador",
};
export function aliasPref(kind, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const low = v.toLowerCase();
  if (kind === "budget") {
    if (/^under/.test(low)) return "Under ₹10K";
    const hit = BUDGET_RANGES.find((b) => b.toLowerCase().replace(/[\s–-]/g, "") === low.replace(/[\s–-]/g, ""));
    return hit || v;
  }
  if (kind === "size") {
    const first = low.split(/[\s(]/)[0];
    return CREATOR_SIZES.find((x) => x.toLowerCase().startsWith(first)) || v;
  }
  if (kind === "gender") {
    const one = low.split(",")[0].trim();
    if (one === "men" || one === "male") return "Male";
    if (one === "women" || one === "female") return "Female";
    if (one.startsWith("all")) return "All";
    return v;
  }
  if (kind === "industry") {
    if (low === "food" || low === "food & culinary") return "D2C food";
    return INDUSTRY_OPTIONS.find((x) => x.toLowerCase() === low) || v;
  }
  if (kind === "type") {
    if (low === "ambassador") return "Brand Ambassador";
    return CAMPAIGN_TYPES.find((x) => x.toLowerCase() === low) || v;
  }
  return v;
}

const EMPTY = {
  company_name: "", industry: "", website: "", description: "", location: "",
  pocName: "", pocDesignation: "", pocEmail: "", pocPhone: "",
  campaignTypes: "", budgetRange: "", creatorSize: "", niches: "", genderFocus: "",
  teamSize: "", logo: "", cover: "", is_agency: false, agency_type: "",
  youtubeUrl: "", linkedinUrl: "", twitterUrl: "",
};

export function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value).split(",").map((v) => v.trim()).filter(Boolean);
}

export default function useBrandProfileData(seed = null) {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false); // v358

  const mapRow = useCallback((data) => ({
    user_id: data.user_id || "", // v358: Share Profile needs the real id
    company_name: data.company_name || user?.name || "",
    industry: data.industry || "",
    website: data.website || "",
    description: data.description || "",
    location: (data.city || data.state)
      ? `${data.city || ""}, ${data.state || ""}`.replace(/^, |, $/g, "")
      : "",
    pocName: data.representative_name || data.poc_name || "",
    pocDesignation: data.representative_designation || data.poc_designation || "",
    pocEmail: data.email || user?.email || "",
    pocPhone: data.representative_mobile || data.phone || "",
    campaignTypes: Array.isArray(data.campaign_types)
      ? data.campaign_types.join(", ")
      : (data.campaign_types || ""),
    budgetRange: data.budget_range || "",
    creatorSize: data.preferred_creator_size || "",
    niches: Array.isArray(data.preferred_niches)
      ? data.preferred_niches.join(", ")
      : (data.preferred_niches || ""),
    genderFocus: data.gender_focus || "",
    teamSize: data.team_size || "",
    logo: data.logo || user?.picture || user?.photo || "",
    cover: data.cover_image || "",
    is_agency: Boolean(data.is_agency || user?.is_agency),
    agency_type: data.agency_type || "",
    youtubeUrl: data.youtube_url || "",
    linkedinUrl: data.linkedin_url || "",
    twitterUrl: data.twitter_url || "",
  }), [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let data = null;
      /* Session 58: profiles are read through the server now (the database no longer lets the browser read them) */
      if (!data) {
        const res = await api.get("brands/me").catch(() => null);
        if (res?.data) data = res.data;
      }
      if (data) { setProfile(mapRow(data)); setLoadFailed(false); }
      else setLoadFailed(true); // v358: Save is blocked so empty fields never overwrite the real profile
    } catch (e) {
      console.error("Error loading brand profile (mobile):", e);
    } finally {
      setLoading(false);
    }
  }, [user, mapRow]);

  // Seed/load exactly once. saveProfileChanges calls refreshUser(), which changes the
  // `user` identity and would otherwise re-run this effect and stamp the stale seed row
  // back over the values the brand just saved.
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    // BrandProfile.jsx has usually already fetched this row — use it and skip the
    // duplicate request, but still fall back to a real fetch when it hasn't.
    if (seed && Object.keys(seed).length > 0) {
      initialised.current = true;
      setProfile(mapRow(seed));
      setLoading(false);
      return;
    }
    if (user) {
      initialised.current = true;
      load();
    }
  }, [seed, user, load, mapRow]);

  const save = useCallback(async (updatedFields, { silent = false } = {}) => {
    if (loadFailed) { // v358
      toast.error("Couldn't load your profile, so nothing was saved. Go back and open it again.");
      return false;
    }
    setSaving(true);
    try {
      const merged = { ...profile, ...updatedFields };
      const locParts = (merged.location || "").split(",");
      const city = locParts[0]?.trim() || "";
      const state = locParts[1]?.trim() || "";

      const payload = {
        company_name: merged.company_name,
        industry: merged.industry,
        website: merged.website,
        description: merged.description,
        city,
        state,
        email: merged.pocEmail,
        phone: merged.pocPhone,
        representative_name: merged.pocName,
        representative_designation: merged.pocDesignation,
        representative_mobile: merged.pocPhone,
        youtube_url: merged.youtubeUrl || null,
        linkedin_url: merged.linkedinUrl || null,
        twitter_url: merged.twitterUrl || null,
        campaign_types: toList(merged.campaignTypes),
        budget_range: merged.budgetRange,
        preferred_creator_size: merged.creatorSize,
        preferred_niches: merged.niches,
        gender_focus: merged.genderFocus,
        team_size: merged.teamSize,
        logo: merged.logo,
        cover_image: merged.cover,
        is_agency: Boolean(merged.is_agency),
        agency_type: merged.agency_type || null,
      };

      // v416 (CR16): no browser write to brand_profiles before the server checks permission — the server save
      // below is the only write (a team member without rights could change the row from the browser).
      await api.post("brands/profile", payload);
      if (refreshUser) await refreshUser();
      setProfile(merged);
      if (!silent) toast.success("Changes saved.");
      return true;
    } catch (err) {
      console.error(err);
      // v332: no raw tech text (err.message such as "Network Error") — calm fallback instead
      toast.error(
        err?.response?.data?.error || err?.response?.data?.detail || "Couldn't save your changes. Please try again."
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [profile, user, refreshUser, loadFailed]);

  // Same bucket and response shape BrandSettings.jsx uses for logo/cover uploads.
  const uploadImage = useCallback(async (picked) => {
    if (!picked) return null;
    // v416 (CR10): iPhone HEIC / big camera photos become a normal JPEG first (then the size check runs on that).
    const file = await prepareUpload(picked);
    if (file.type && !/^image\//i.test(file.type)) { // v415: a PDF / video picked by mistake went to the server
      toast.error("Please pick an image (JPG, PNG or WebP).");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("That image is over 5MB. Pick a smaller one.");
      return null;
    }
    const toastId = toast.loading("Uploading…");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("upload?bucket=profile-assets", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (!res.data?.url) throw new Error("Upload returned no URL");
      toast.success("Uploaded.", { id: toastId });
      return res.data.url;
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Couldn't upload the image. Please try again.", { id: toastId }); // v415: calmer wording
      return null;
    }
  }, []);

  return { profile, setProfile, loading, saving, save, reload: load, uploadImage, loadFailed };
}
