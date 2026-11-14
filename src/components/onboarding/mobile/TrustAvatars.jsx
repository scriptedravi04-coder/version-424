import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../lib/api";

// Session 39 (Ravi, M41): small round photos that keep rotating next to "Build trust with a clear
// photo…". Only the real creators the admin picked ("Show on creator home"); none → nothing shown.
// v397 (Ravi): `fromExplore` → when the admin picked fewer than 4, the photos come from Explore's live creators too
// (shuffled), like the brand onboarding line — used under "One last step" ("Trusted by 3,000+ creators").
const isRealPhoto = (u) => u && !/dicebear|ui-avatars/i.test(String(u));
export default function TrustAvatars({ size = 38, fromExplore = false, max = 4 }) {
  const [photos, setPhotos] = useState([]);
  const [start, setStart] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get("creators/home-picks")
      .then(async (r) => {
        let list = (r?.data?.picks || []).map((p) => p.picture).filter(isRealPhoto);
        if (fromExplore && list.length < 8) {
          try {
            const { data } = await api.get("creators/explore", { timeout: 20000 });
            const rows = Array.isArray(data) ? data : (data?.creators || data?.items || []);
            const more = rows.map((c) => c?.photo || c?.profile_photo_url || c?.picture || c?.avatar_url).filter(isRealPhoto);
            for (let i = more.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [more[i], more[j]] = [more[j], more[i]]; }
            list = Array.from(new Set([...list, ...more])).slice(0, 12);
          } catch { /* only the picks */ }
        }
        if (alive) setPhotos(fromExplore ? list : list.slice(0, 4));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [fromExplore]);

  useEffect(() => {
    if (photos.length < 2) return undefined;
    const t = setInterval(() => setStart((s) => (s + 1) % photos.length), 2200);
    return () => clearInterval(t);
  }, [photos.length]);

  if (photos.length === 0) return null;
  const shown = photos.map((_, i) => photos[(start + i) % photos.length]).slice(0, Math.min(max, photos.length));
  return (
    <div className="flex items-center" data-testid="trust-avatars" aria-hidden="true">
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((src, i) => (
          <motion.img
            key={src}
            layout
            src={src}
            alt=""
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.35 }}
            style={{ width: size, height: size, marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}
            className="rounded-full object-cover border-2 border-white bg-[#F2F2F7]"
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
