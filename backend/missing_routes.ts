import { referralSummary } from "./referralProgram";
import { logIgnored } from "./logIgnored";
import express from "express";
import { GoogleGenAI } from "@google/genai";

// Endpoints the frontend already calls that had no backend route (all answered 404).
// Found in session 19d by matching every frontend api.* call against the registered routes.
//
//   GET  /referral/stats           Refer & Earn counters (web + mobile)
//   POST /coupons/validate         Promo code box on the deal page
//   POST /ai/negotiation           "AI assist" in the deal chat
//   POST /ai/profile-suggestions   Profile-strength suggestions on My Profile
//
// Each one is honest about what it knows: no invented counts, and when Gemini is not
// configured the AI routes fall back to plain rules instead of pretending.

export function setupMissingRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    parseAuthUser,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    parseAuthUser: (req: express.Request) => Promise<any>;
  }
) {
  const client = () => privilegedSupabase || supabase;

  // ---------------------------------------------------------------- referrals
  router.get("/referral/stats", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const REWARDED = ["rewarded", "completed", "credited", "paid", "approved"];
    let rows: any[] = [];
    if (supabase) {
      try {
        const { data } = await client().from("referrals").select("id, status, referred_id, created_at").eq("referrer_id", user.user_id);
        if (Array.isArray(data)) rows = data;
      } catch (e) { logIgnored("missing_routes:42", e); }
    }
    const local = (getDb().referrals || []).filter((r: any) => r.referrer_id === user.user_id);
    local.forEach((r: any) => { if (!rows.some((x: any) => x.id === r.id)) rows.push(r); });
    // Session 58: the old column names (brand_reward_amount / creator_reward_amount / reward_amount) don't exist and
    // the "rewarded" statuses are never written — this always said 0. Same numbers as the Refer & earn screen now.
    let rewardAmount: number | null = null;
    let earnedCount: number | null = null;
    try {
      const sum: any = await referralSummary({ supabase, privilegedSupabase, getDb }, user.user_id);
      const amt = Number(user.role === "brand" ? (sum?.cfg?.brand_referral_reward ?? sum?.cfg?.friend_reward) : (sum?.cfg?.friend_reward ?? sum?.cfg?.creator_referral_reward));
      if (Number.isFinite(amt) && amt > 0) rewardAmount = amt;
      earnedCount = sum?.progress?.complete ? sum.progress.complete.size : null;
    } catch (e) { logIgnored("missing_routes:52", e); }
    return res.json({
      total_referred: rows.length,
      rewards_earned: earnedCount ?? rows.filter((r: any) => REWARDED.includes(String(r.status || "").toLowerCase())).length,
      pending: rows.filter((r: any) => String(r.status || "").toLowerCase() === "pending").length,
      reward_amount: rewardAmount,
    });
  });

  // ---------------------------------------------------------------- coupons
  router.post("/coupons/validate", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to use a promo code." });
    const code = String(req.body?.code || "").trim().toUpperCase();
    const amount = Number(req.body?.campaign_amount) || 0;
    if (!code) return res.status(400).json({ error: "Enter a promo code." });

    let coupon: any = null;
    if (supabase) {
      try {
        const { data } = await client().from("coupons").select("*").ilike("code", String(code).replace(/[\\%_]/g, (m: string) => "\\" + m)).limit(1);
        if (Array.isArray(data) && data[0]) coupon = data[0];
      } catch (e) { logIgnored("missing_routes:75", e); }
    }
    if (!coupon) coupon = (getDb().coupons || []).find((c: any) => String(c.code || "").toUpperCase() === code) || null;
    if (!coupon) return res.status(404).json({ valid: false, error: "This promo code does not exist." });

    const now = Date.now();
    if (String(coupon.status || "active").toLowerCase() !== "active") {
      return res.status(400).json({ valid: false, error: "This promo code is no longer active." });
    }
    if (coupon.valid_from && Date.parse(coupon.valid_from) > now) {
      return res.status(400).json({ valid: false, error: "This promo code is not active yet." });
    }
    if (coupon.valid_until && Date.parse(coupon.valid_until) < now) {
      return res.status(400).json({ valid: false, error: "This promo code has expired." });
    }
    if (Number(coupon.usage_limit) > 0 && Number(coupon.used_count || 0) >= Number(coupon.usage_limit)) {
      return res.status(400).json({ valid: false, error: "This promo code has been fully used." });
    }
    if (coupon.min_campaign_value && amount < Number(coupon.min_campaign_value)) {
      return res.status(400).json({ valid: false, error: `This promo code needs a deal of at least ₹${Number(coupon.min_campaign_value).toLocaleString("en-IN")}.` });
    }
    const appliesTo = String(coupon.applies_to || "all").toLowerCase();
    const role = String(user.role || "").toLowerCase();
    if (appliesTo !== "all" && appliesTo !== role && appliesTo !== `${role}s`) {
      return res.status(400).json({ valid: false, error: "This promo code is not available for your account type." });
    }
    return res.json({
      valid: true,
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      discount_amount: Number(coupon.discount_amount) || 0,
      override_fee_rate: coupon.override_fee_rate ?? null,
      applies_to_first_n_payouts: coupon.applies_to_first_n_payouts ?? null,
    });
  });

  // ---------------------------------------------------------------- AI: negotiation
  router.post("/ai/negotiation", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const offer = Number(req.body?.offer) || 0;
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
    const isBrand = String(user.role || "").toLowerCase() === "brand";
    const offerText = offer > 0 ? `₹${offer.toLocaleString("en-IN")}` : "the proposed amount";

    const ruleBased = () => ({
      suggestedResponse: isBrand
        ? `Thanks for the details! We're keen to work with you. Our budget for this is ${offerText} — could we lock the deliverables at this rate, or share what would make it work for you?`
        : `Thanks for the offer! I'd love to do this. Given the deliverables and my usual engagement, would ${offerText} work with one revision included? Happy to discuss.`,
      advice: "Suggestion drafted from your current offer — edit it before sending.",
      source: "rules",
    });

    if (!process.env.GEMINI_API_KEY) return res.json(ruleBased());
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const transcript = history
        .map((m: any) => `${m.sender_role || m.role || "user"}: ${String(m.text || m.content || "").slice(0, 300)}`)
        .join("\n");
      const prompt = `You help a ${isBrand ? "brand" : "creator"} on an Indian influencer-marketing platform reply in a deal negotiation.
Current offer: ${offerText}.
Recent messages:
${transcript || "(none)"}
Write ONE short, polite, professional reply (max 60 words) the ${isBrand ? "brand" : "creator"} could send. Do not invent facts, follower counts or deadlines. Do not ask to move off-platform or share contact details.
Then on a new line starting with "ADVICE:" give one sentence of negotiation advice.`;
      const response = await ai.models.generateContent({ model: "gemini-3.1-flash-lite", contents: prompt });
      const text = String(response.text || "").trim();
      if (!text) return res.json(ruleBased());
      const [reply, advice] = text.split(/\n\s*ADVICE:\s*/i);
      return res.json({ suggestedResponse: reply.trim(), advice: (advice || "AI suggestion loaded — edit before sending.").trim(), source: "gemini" });
    } catch (e: any) {
      console.warn("[ai/negotiation] Gemini failed, using rules:", e?.message || e);
      return res.json(ruleBased());
    }
  });

  // ---------------------------------------------------------------- AI: profile suggestions
  // Rule-based on purpose: the suggestions come from what is actually missing on the profile,
  // so they are specific and never hallucinated.
  router.post("/ai/profile-suggestions", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const c = req.body?.creator || {};
    const has = (v: any) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "" && Number(v) !== 0);
    const out: any[] = [];
    if (!has(c.bio) || String(c.bio || "").length < 40) out.push({ title: "Write a fuller bio", description: "Brands read the bio first. Two or three lines on your niche, audience and style make you easier to shortlist.", category: "Bio" });
    if (!has(c.city) && !has(c.location)) out.push({ title: "Add your city", description: "Many brands filter creators by city. Without one you are left out of those searches.", category: "Bio" });
    if (!has(c.instagram_handle) && !has(c.instagram) && !has(c.youtube_channel) && !has(c.youtube)) out.push({ title: "Link a social account", description: "Connect Instagram or YouTube so brands can see your real reach.", category: "Socials" });
    if (!has(c.portfolio) && !has(c.portfolio_items) && !has(c.past_work)) out.push({ title: "Add portfolio work", description: "Show two or three past posts or brand collaborations. It is the strongest signal for brands.", category: "Portfolio" });
    if (!has(c.rate_card) && !has(c.rates) && !has(c.reel_rate) && !has(c.base_rate)) out.push({ title: "Set your rates", description: "A rate card for reels and stories lets brands send you an offer without back-and-forth.", category: "Rates" });
    if (!has(c.categories) && !has(c.niche) && !has(c.category)) out.push({ title: "Pick your categories", description: "Categories decide which campaigns you are matched with.", category: "Bio" });
    if (!has(c.picture) && !has(c.avatar) && !has(c.profile_picture_url)) out.push({ title: "Upload a profile photo", description: "Profiles with a clear photo get noticeably more brand views.", category: "Bio" });
    if (out.length === 0) out.push({ title: "Your profile looks complete", description: "Keep your portfolio fresh with recent work to stay near the top of brand searches.", category: "Portfolio" });
    return res.json(out.slice(0, 5));
  });
}
