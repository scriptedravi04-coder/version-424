import React, { useEffect, useState } from "react";
import { api } from "../../../lib/api";

// Session 43 (Ravi: "142 verified creators" was a made-up number with grey circles). This shows the
// REAL creators that fit the brief, from the same public list Explore uses (cached by the server):
// how many, and up to four real faces. Few creators on Ybex today → a small true number, never a
// made-up one. When nothing is known yet the line simply says the brief goes to matching creators.
let cache = null; // one list per app session
const photoOf = (c) => c?.photo || c?.profile_photo_url || c?.picture || c?.avatar_url || "";
const lower = (v) => String(v || "").toLowerCase();

export function matchCreators(list, { categories = [], platforms = [] } = {}) {
  const cats = categories.map(lower).filter(Boolean);
  const plats = platforms.map(lower).filter(Boolean);
  return (Array.isArray(list) ? list : []).filter((c) => {
    const niche = lower([c.category, ...(Array.isArray(c.content_niches) ? c.content_niches : [c.content_niches])].join(","));
    const plat = lower([...(Array.isArray(c.platforms) ? c.platforms : [c.platforms]), c.instagram_handle ? "instagram" : "", c.youtube_handle ? "youtube" : ""].join(","));
    const nicheOk = !cats.length || cats.some((k) => niche.includes(k));
    const platOk = !plats.length || !plat.replace(/,/g, "") || plats.some((p) => plat.includes(p));
    return nicheOk && platOk;
  });
}

export function useMatchingCreators(criteria) {
  const [list, setList] = useState(cache);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    api.get("creators/explore").then(({ data }) => {
      const rows = Array.isArray(data) ? data : data?.creators || data?.data || [];
      cache = rows;
      if (alive) setList(rows);
    }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, []);
  if (!list) return null;
  return matchCreators(list, criteria);
}

export function CreatorFaces({ creators = [], size = 26, ring = "#F1E8FF" }) {
  const faces = creators.filter((c) => photoOf(c)).slice(0, 4);
  if (!faces.length) return null;
  return (
    <div className="flex shrink-0" data-testid="creator-faces">
      {faces.map((c, i) => (
        <img key={c.id || c.user_id || i} src={photoOf(c)} alt="" loading="lazy"
          className="rounded-full object-cover bg-white"
          style={{ width: size, height: size, border: `1.5px solid ${ring}`, marginLeft: i ? -8 : 0 }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ))}
    </div>
  );
}

export default function CreatorMatchStrip({ categories, platforms }) {
  const matches = useMatchingCreators({ categories, platforms });
  if (matches === null) return null;
  const n = matches.length;
  return (
    <div className="p-3.5 rounded-[14px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-3" data-testid="creator-match-strip">
      <CreatorFaces creators={matches} />
      <div className="flex-1 text-[12px] leading-[1.45] text-[#5B21B6]">
        {n > 0 ? (
          <><span className="font-semibold">{n} verified creator{n === 1 ? "" : "s"}</span> match this brief right now</>
        ) : (
          <>Your brief goes to every creator who fits it — including new ones as they join</>
        )}
      </div>
    </div>
  );
}
