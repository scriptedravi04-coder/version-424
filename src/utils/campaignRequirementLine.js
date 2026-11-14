// The one-line "who the brand is looking for" text built from a campaign's own fields
// (niche, gender, platform, followers, languages, location). Shared by desktop Campaigns and the
// mobile campaign card / detail (Session 39, Ravi: "requirement ki ek line ... vo bhi show honi chahiye").
export const getCreatorRequirementsString = (c) => {
  if (c.isUgc) {
    return "UGC Content Creators skilled in product demonstration videos.";
  }
  const niches = c.categories && c.categories.length > 0 ? c.categories.join(", ") : "Any Niche";
  const platforms = c.platforms && c.platforms.length > 0 ? c.platforms.join(" & ") : "Instagram";
  
  let reach = "";
  if (c.follower_min || c.follower_max) {
    const minK = c.follower_min ? `${c.follower_min >= 1000000 ? (c.follower_min/1000000) + 'M' : (c.follower_min/1000) + 'k'}` : "Any";
    const maxK = c.follower_max ? `${c.follower_max >= 1000000 ? (c.follower_max/1000000) + 'M' : (c.follower_max/1000) + 'k'}` : "";
    reach = maxK ? `${minK} - ${maxK} followers` : `${minK}+ followers`;
  } else {
    reach = "any follower count"; // Session 39: no invented minimum when the brand set none
  }

  const genderText = c.gender && c.gender !== "Both" ? `${c.gender} creators` : "Creators (Any Gender)";
  const langText = c.languages && c.languages.length > 0 ? `fluent in ${c.languages.join(", ")}` : "";
  // v353: "based in Pan India" read oddly — no specific place → "anywhere in India".
  const loc = String(c.location || "").trim();
  const locText = loc && !/^(pan india|anywhere|all india|india)$/i.test(loc) ? `based in ${loc}` : "anywhere in India";

  return `${niches} ${genderText} on ${platforms} with ${reach}, ${langText} ${locText}.`.replace(/ ,/g, ',').replace(/\s+/g, ' ').trim();
};
