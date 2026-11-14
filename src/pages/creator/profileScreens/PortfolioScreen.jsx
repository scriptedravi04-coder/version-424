import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

// Session 49 (clean-up): the "portfolio" screen of CreatorMobileProfile (props come from there; layout only —
// the server calls live in src/components/portfolio/portfolioApi.js).
// v363 (Ravi's "Instagram Auto Fetch" design — "portfolio ke pages mein preview nahi dikh raha, design jaisa karo"):
//   0 pieces → empty state (1h): one frosted stack + "Add your first collab"; the green "N collabs found on @handle"
//     chip only when the Instagram fetch found collab posts.
//   "Add" → Add collabs (1d): Select (reels from the username) / Paste link / Upload → Tag the brand (1g) → save.
//   Saved → frosted brand stacks (1e) with a stacks / grid switch; tap or long-press a stack to rename / remove.
// Covers of picked Instagram reels are copied to our storage before saving (Instagram's links expire — that's why
// the old list only showed a play icon). Old items (plain links / the old object) still show, as "Other work" when
// they have no brand.
import InstagramReelPicker from "../../../components/instagram/InstagramReelPicker"; // v354; v363 glass grid
import { igUsername } from "../../../components/instagram/InstagramFetchButton"; // v354
import AddCollabsScreen from "../../../components/portfolio/AddCollabsScreen";
import { PortfolioEmpty, PortfolioStacks, BrandSheet } from "../../../components/portfolio/PortfolioViews";
import { Bloom } from "../../../components/portfolio/PortfolioParts";
import { parseList, groupByBrand, toSaved, linkKey, newId } from "../../../components/portfolio/portfolioModel";
import { fetchIgMedia, copyCovers } from "../../../components/portfolio/portfolioApi";
import { EntryDoneSheet } from "../../../components/challenge/ChallengeUi"; // v367: Diwali Challenge
import { getMyChallenge, stampEntries } from "../../../lib/challengeApi"; // v367, v373
import { trackFunnel } from "../../../lib/metaPixel"; // v367: ChallengeEntry funnel event

export default function PortfolioScreen(props) {
  const { profile, renderBackHeader, saveProfileChanges, profileState = "ready" } = props;

  const items = useMemo(() => parseList(profile?.portfolio), [profile?.portfolio]);
  const groups = useMemo(() => groupByBrand(items), [items]);
  const igHandle = igUsername(profile?.instagram_handle || profile?.instagram || profile?.socials?.find?.((x) => x.platform === "Instagram")?.url);

  const [ig, setIg] = useState({ loading: Boolean(igHandle), media: [], handle: igHandle || "" });
  // v367: /creator/settings?section=portfolio&add=1 (Join on /challenge) opens "Add collabs" straight away
  const [adding, setAdding] = useState(() => { try { return new URLSearchParams(window.location.search).get("add") === "1"; } catch { return false; } });
  // v377: …&diwali=1 (after sign-up from the offer page, the Home card, /offer) opens it as "Add your Diwali reel"
  const [diwaliAdd, setDiwaliAdd] = useState(() => { try { return new URLSearchParams(window.location.search).get("diwali") === "1"; } catch { return false; } });
  const [done, setDone] = useState(null); // v367: { entries, left } → Entry done sheet
  const [me, setMe] = useState(null); // v372: Diwali strip on the wall (entries · close date)
  const [openGroup, setOpenGroup] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!igHandle) return undefined;
    let alive = true;
    fetchIgMedia()
      .then((r) => { if (alive) setIg({ loading: false, media: r.media, handle: r.handle || igHandle }); })
      .catch(() => { if (alive) setIg({ loading: false, media: [], handle: igHandle }); });
    return () => { alive = false; };
  }, [igHandle]);

  const have = useMemo(() => new Set(items.map((i) => linkKey(i.content_url))), [items]);
  useEffect(() => {
    let alive = true;
    getMyChallenge().then((d) => { if (alive) setMe(d || null); }).catch(() => {});
    return () => { alive = false; };
  }, [done]);

  // v372 (Ravi's screenshot: "Other work" showed an empty purple card): pieces saved by the older onboarding picker
  // have no cover. When the Instagram list has the same post, copy its cover to our storage once and save it.
  const coverFixTried = React.useRef(false);
  useEffect(() => {
    if (coverFixTried.current || ig.loading || !ig.media.length || !saveProfileChanges) return;
    const byLink = new Map(ig.media.filter((m) => m?.permalink && m?.thumb).map((m) => [linkKey(m.permalink), m]));
    const need = items.filter((i) => !i.cover && byLink.has(linkKey(i.content_url)));
    if (!need.length) return;
    coverFixTried.current = true;
    (async () => {
      const covers = await copyCovers(need.map((i) => ({ id: i.id, url: byLink.get(linkKey(i.content_url)).thumb })));
      if (!Object.values(covers).some(Boolean)) return;
      const next = items.map((i) => {
        if (!covers[i.id]) return i;
        const m = byLink.get(linkKey(i.content_url));
        return { ...i, cover: covers[i.id], views: i.views || m?.views || null, likes: i.likes || m?.likes || null, date: i.date || m?.at || "" };
      });
      await saveProfileChanges({ portfolio: toSaved(next) }, { silent: true });
    })().catch(() => { /* placeholder stays */ });
  }, [ig.loading, ig.media, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const collabCount = ig.media.filter((m) => m?.collab && m?.permalink && !have.has(linkKey(m.permalink))).length;
  const freshCount = ig.media.filter((m) => m?.permalink && !have.has(linkKey(m.permalink))).length; // v372: "N found on @handle"

  const save = async (next) => {
    if (!saveProfileChanges) return false;
    setBusy(true);
    try { return (await saveProfileChanges({ portfolio: toSaved(next) }, { silent: true })) !== false; }
    finally { setBusy(false); }
  };

  const onAdded = async (newItems, info = {}) => {
    const ok = await save([...newItems, ...items]);
    // v367: entered the Diwali Challenge → fetch the entry numbers and show "Entry #N is in"
    if (ok && info.entered?.length) {
      trackFunnel("ChallengeEntry", { reels: info.entered.length });
      const me = await getMyChallenge();
      const ids = new Set(info.entered);
      const mine = (me?.entries || []).filter((e) => ids.has(e.item_id));
      setDone({ entries: mine.length ? mine : info.entered.map((id) => ({ item_id: id, no: "…", cover: newItems.find((n) => n.id === id)?.cover })), all: me?.entries || null, left: me?.left || 0, resultsAt: me?.results_at });
    }
    return ok;
  };
  // v373: enter a reel that is already in the portfolio (from the brand sheet)
  const onEnterExisting = async (orig, handle = "") => {
    // older pieces got a made-up id like "old_0_…/AbC12/" that the server refuses — give it a clean one first
    const item = /^[\w.-]{3,80}$/.test(String(orig.id)) ? orig : { ...orig, id: newId() };
    let stamps = {};
    try { stamps = await stampEntries([item], handle); }
    catch (e) { toast.error(e.message); return false; }
    if (!stamps[item.id]) { toast.error("Could not enter the challenge. Try again."); return false; }
    const ok = await save(items.map((i) => (i.id === orig.id ? { ...i, id: item.id, ...stamps[item.id] } : i)));
    if (!ok) return false;
    trackFunnel("ChallengeEntry", { reels: 1 });
    const fresh = await getMyChallenge();
    const mine = (fresh?.entries || []).filter((e) => e.item_id === item.id);
    setOpenGroup(null);
    setDone({ entries: mine.length ? mine : [{ item_id: item.id, no: "…", cover: item.cover }], all: fresh?.entries || null, left: fresh?.left || 0, resultsAt: fresh?.results_at });
    return true;
  };
  const onRemove = async (ids) => {
    const drop = new Set(ids);
    const ok = await save(items.filter((i) => !drop.has(i.id)));
    if (ok) { toast.success(ids.length === 1 ? "Removed" : `${ids.length} removed`); setOpenGroup(null); }
  };
  const onRename = async (group, brand) => {
    const ids = new Set(group.items.map((i) => i.id));
    const ok = await save(items.map((i) => (ids.has(i.id) ? { ...i, brand_name: brand, title: `${brand} collab` } : i)));
    if (ok) { toast.success("Brand renamed"); setOpenGroup(null); }
    return ok;
  };

  const brandCount = groups.filter((g) => g.key !== "__none").length;

  return (
    <div className="relative min-h-screen flex flex-col pb-28" data-testid="portfolio-screen">
      <Bloom />
      {renderBackHeader("Portfolio", items.length > 0 ? (
        <button type="button" onClick={() => setAdding(true)} aria-label="Add collabs"
          className="w-10 h-10 rounded-full bg-[#7C3AED] text-white flex items-center justify-center shadow-[0_8px_18px_-8px_rgba(124,58,237,1)]">
          <Plus size={19} />
        </button>
      ) : null)}

      <div className="relative flex-1">
        <div className="relative">
          {profileState !== "ready" && items.length === 0 ? (
            // v372: not loaded yet → not "No brand collabs yet" (that made people add the same reels twice)
            <div className="px-4 pt-6 grid grid-cols-3 gap-2" aria-label="Loading portfolio">
              {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/5] rounded-2xl bg-white/70 animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <PortfolioEmpty onAdd={() => setAdding(true)} collabCount={collabCount} handle={ig.handle} />
          ) : (
            <div className="px-4 pt-3">
              <div className="text-[12.5px] font-semibold text-slate-500 mb-4">
                {items.length} collab{items.length === 1 ? "" : "s"}{brandCount ? ` · ${brandCount} brand${brandCount === 1 ? "" : "s"}` : ""}
              </div>
              <PortfolioStacks groups={groups} items={items} onOpen={setOpenGroup} onAdd={() => setAdding(true)} found={collabCount || freshCount} handle={ig.handle} challenge={me} />
            </div>
          )}
        </div>
      </div>

      {adding && (
        <AddCollabsScreen
          handle={ig.handle}
          media={ig.media}
          mediaLoading={ig.loading}
          existing={items}
          onClose={() => {
            setAdding(false);
            setDiwaliAdd(false);
            // v367 deep test: drop ?add=1 so Back / reopening Portfolio doesn't pop "Add collabs" open again
            try { const u = new URL(window.location.href); if (u.searchParams.has("add") || u.searchParams.has("diwali")) { u.searchParams.delete("add"); u.searchParams.delete("diwali"); window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash); } } catch { /* ignore */ }
          }}
          onSave={onAdded}
          diwali={diwaliAdd}
          renderPicker={(p) => <InstagramReelPicker {...p} variant="glass" max={30} />}
        />
      )}
      {done && <EntryDoneSheet entries={done.entries} all={done.all} left={done.left} resultsAt={done.resultsAt || undefined} onClose={() => setDone(null)} />}
      {openGroup && (
        <BrandSheet group={openGroup} busy={busy} onClose={() => setOpenGroup(null)} onRename={onRename} onRemove={onRemove} challenge={me} onEnter={onEnterExisting} />
      )}
    </div>
  );
}
