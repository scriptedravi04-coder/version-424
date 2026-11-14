import { safeStorage } from "../../utils/storage";
import { isUgcThread as isUgc } from "../../utils/dealFlow";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { Search, ShieldAlert, Lock, MessageSquare } from "lucide-react";
import ChatBox from "../../components/chat/ChatBox";
import ChatBoxMobile from "../../components/chat/mobile/ChatBoxMobile";
import InboxMobile from "../../components/inbox/mobile/InboxMobile";
import useIsMobile from "../../hooks/useIsMobile";
import { acquireSocket } from "../../lib/sharedSocket";
import { sortThreadsByActivity, createCoalescedRunner } from "../../lib/chatSync";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import { OfflineAware } from "../../components/common/OfflineState"; // v334
import PersonPhoto from "../../components/common/PersonPhoto"; // v358

// v414: newest message time of a list row (0 when unknown).
// v417: also the newest message the open chat saw (_activity_at from ChatBox) — after switching threads the badge
// came back for messages read while the chat was open, because the list had not counted them yet.
const lastMsgTime = (t) => {
  let best = 0;
  for (const c of [t?.last_message?.created_at, t?.last_message_at, t?._activity_at]) {
    const v = new Date(c || 0).getTime();
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best;
};

export default function Chat() {
  const { userId: urlUserId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { isBusy, run } = useBusy();
  
  // Extract target ID from either path parameter or query string
  const queryTargetId = searchParams.get("thread") || 
    searchParams.get("threadId") || 
    searchParams.get("dealId") || 
    searchParams.get("deal_id") || 
    searchParams.get("orderId") || 
    searchParams.get("order_id") || 
    searchParams.get("creator") || 
    searchParams.get("creator_id") || 
    searchParams.get("id");
  
  const urlThreadId = urlUserId || queryTargetId;

  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [search, setSearch] = useState("");
  const [isRestricted, setIsRestricted] = useState(false);
  const [restrictionMessage, setRestrictionMessage] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  
  const [allCreators, setAllCreators] = useState([]);
  const [virtualPartner, setVirtualPartner] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [tabFilter, setTabFilter] = useState("all"); // 'all' | 'campaigns' | 'ugc' | 'unread'
  // v414: a chat from the URL that could not be opened: { id, kind: 'forbidden' | 'error' }. Any load error used to
  // make a fake "new_<id>" chat where every send failed; now only a 404 does, and only once per id (no re-toast).
  const [threadOpenError, setThreadOpenError] = useState(null);
  const openTriedRef = useRef(null);
  // v414: threadId -> { t: last message time, n: message count } seen while the chat was open. The unread badge
  // stays off for it until a NEWER incoming message arrives (a list refresh used to bring the badge back).
  const readMarksRef = useRef({});

  const isBrand = user?.role === 'brand' || user?.user_type === 'brand';

  // Helper to match thread across IDs, UGC order IDs, deal IDs, and partner user IDs
  const matchThread = useCallback((threadList, targetId) => {
    if (!targetId || !Array.isArray(threadList)) return null;
    const tid = String(targetId).trim();
    if (!tid) return null;

    // 1. Direct ID matches
    let found = threadList.find(x => 
      String(x.id) === tid || 
      String(x.deal_id) === tid || 
      String(x.collab_id) === tid || 
      String(x.ugc_order_id) === tid ||
      String(x.ugc_order?.id) === tid ||
      String(x.ugc_order?.order_id) === tid ||
      (x.id && x.id.replace(/^thread_ugc_/, '') === tid) ||
      (x.deal_id && String(x.deal_id).replace(/^thread_ugc_/, '') === tid) ||
      (tid.startsWith('thread_ugc_') && x.id === tid.replace('thread_ugc_', '')) ||
      (tid.startsWith('thread_ugc_') && x.deal_id === tid.replace('thread_ugc_', ''))
    );
    if (found) return found;

    // 2. Match by partner user ID
    const userMatches = threadList.filter(x => String(x.creator_id) === tid || String(x.brand_id) === tid);
    if (userMatches.length > 0) {
      userMatches.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
      return userMatches[0];
    }

    // 3. Match new_ prefix if applicable
    if (tid.startsWith("new_")) {
      const actualId = tid.replace("new_", "");
      return matchThread(threadList, actualId);
    }

    return null;
  }, []);

  // Fetch all creators for contact list when viewer is brand
  useEffect(() => {
    if (isBrand && user) {
      api.get("creators")
        .then(({ data }) => {
          if (data && Array.isArray(data)) {
            setAllCreators(data);
          }
        })
        .catch(err => console.error("Error loading creators for contact list:", err));
    }
  }, [isBrand, user]);

  // Fetch virtual partner profile (when thread isNew)
  useEffect(() => {
    if (activeThread?.isNew) {
      const partnerId = isBrand ? activeThread.creator_id : activeThread.brand_id;
      if (isBrand && partnerId) {
        // Check if creator exists in allCreators first
        const existing = allCreators?.find(c => String(c.user_id || c.id) === String(partnerId));
        if (existing) {
          setVirtualPartner({
            user_id: partnerId,
            name: existing.name || existing.full_name || "Creator",
            profile_picture_url: existing.photo || existing.picture || existing.profile_picture_url,
            logo_url: existing.photo || existing.picture || existing.profile_picture_url,
            profile: existing
          });
          return;
        }

        // Try /creators/:id/profile then /creators/:id, with fallback
        api.get(`/creators/${partnerId}/profile`)
          .then(({ data }) => {
            if (data) {
              setVirtualPartner({
                user_id: partnerId,
                name: data.name || data.full_name || "Creator",
                profile_picture_url: data.photo || data.picture || data.profile_picture_url,
                logo_url: data.photo || data.picture || data.profile_picture_url,
                profile: data
              });
            }
          })
          .catch(() => {
            api.get(`/creators/${partnerId}`)
              .then(({ data }) => {
                if (data) {
                  setVirtualPartner({
                    user_id: partnerId,
                    name: data.name || data.full_name || "Creator",
                    profile_picture_url: data.photo || data.picture || data.profile_picture_url,
                    logo_url: data.photo || data.picture || data.profile_picture_url,
                    profile: data
                  });
                }
              })
              .catch(() => {
                // Graceful fallback for new/virtual partner thread
                setVirtualPartner({
                  user_id: partnerId,
                  name: "Creator Partner",
                  profile_picture_url: "",
                  logo_url: "",
                  profile: {}
                });
              });
          });
      }
    } else {
      setVirtualPartner(null);
    }
  }, [activeThread?.id, activeThread?.isNew, isBrand, allCreators]);

  // v414: what to do when a chat from the URL can't be fetched.
  const handleThreadOpenError = (err, targetId) => {
    const st = err?.response?.status;
    if (st === 404) {
      const actualId = targetId.startsWith("new_") ? targetId.replace("new_", "") : targetId;
      setThreadOpenError(null);
      setActiveThread({
        id: targetId.startsWith("new_") ? targetId : `new_${actualId}`,
        creator_id: isBrand ? actualId : (user?.user_id || user?.id),
        brand_id: isBrand ? (user?.user_id || user?.id) : actualId,
        status: 'NEGOTIATING',
        isNew: true
      });
    } else if (st === 403) {
      setActiveThread(null);
      setThreadOpenError({ id: targetId, kind: "forbidden" });
    } else {
      setActiveThread(null);
      setThreadOpenError({ id: targetId, kind: "error" });
    }
  };
  const openThreadById = (targetId) => {
    openTriedRef.current = targetId;
    setThreadOpenError(null);
    return api.get(`chat/v2/threads/${targetId}`)
      .then(({ data }) => {
        if (data) {
          setActiveThread(data);
          setThreads(prev => [...prev.filter(x => x.id !== data.id), data]);
        }
      })
      .catch((err) => handleThreadOpenError(err, targetId));
  };

  // Real-time socket connection for user online presence and message listeners
  useEffect(() => {
    if (!user) return;

    // Session 31: one shared connection per tab (src/lib/sharedSocket.js).
    const socket = acquireSocket(user.user_id || user.id);
    socket.onConnect(() => {
      socket.emit("register_user", user.user_id || user.id);
      socket.emit("get_online_users");
    });

    socket.on("online_users_list", (users) => {
      setOnlineUsers(users || []);
    });

    socket.on("user_status_change", ({ userId, status }) => {
      setOnlineUsers(prev => {
        if (status === "online") {
          if (prev.includes(userId)) return prev;
          return [...prev, userId];
        } else {
          return prev?.filter(id => id !== userId);
        }
      });
    });

    // One list refresh for a burst of thread events (session 23: every action now sends one).
    const refreshList = createCoalescedRunner(() => api.get("chat/v2/threads", { bypassCache: true }).then(({ data }) => {
        if (data) {
          setThreads(data);
          setActiveThread(prev => {
            if (!prev) return prev;
            const updated = data.find(t => t.id === prev.id || (prev.deal_id && t.deal_id === prev.deal_id));
            return updated ? { ...prev, ...updated } : prev;
          });
        }
      }).catch(err => console.error("Socket thread update error:", err)), 400);
    socket.on("thread_updated", () => refreshList());

    // The open chat reports each new message, so its thread moves to the top at once.
    const onActivity = (e) => {
      const { threadId, at } = e?.detail || {};
      if (!threadId) return;
      setThreads(prev => prev.map(t => (t.id === threadId || t.deal_id === threadId) ? { ...t, _activity_at: at } : t));
    };
    window.addEventListener("chat_activity", onActivity);

    return () => {
      refreshList.cancel();
      window.removeEventListener("chat_activity", onActivity);
      socket.release();
    };
  }, [user]);

  // Mark active thread as read
  useEffect(() => {
    if (activeThread && user && threads.length > 0) {
      const activeT = threads.find(t => t.id === activeThread.id);
      if (activeT) {
        safeStorage.setItem(`last_read_count_${user.user_id || user.id}_${activeThread.id}`, String(activeT.total_messages_count || 0));
      }
    }
    // v414: remember what was seen while it was open — keeps its badge off after the list refreshes
    if (activeThread?.id) {
      const activeT = threads.find(t => t.id === activeThread.id) || activeThread;
      const prev = readMarksRef.current[activeThread.id] || { t: 0, n: 0 };
      readMarksRef.current[activeThread.id] = {
        t: Math.max(prev.t, lastMsgTime(activeT)),
        n: Math.max(prev.n, Number(activeT.total_messages_count || 0)),
      };
    }
  }, [activeThread?.id, threads, user]);

  // v415: M8 opening a chat marks its messages read on the server (in the background) — tell the nav badge
  // to count again shortly after, so it doesn't keep the old number for up to 45 s.
  useEffect(() => {
    if (!activeThread?.id || activeThread?.isNew || typeof window === "undefined") return undefined;
    const t = setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent("ybex:chat-read", { detail: { threadId: activeThread.id } })); } catch { /* old browser */ }
    }, 2000);
    return () => clearTimeout(t);
  }, [activeThread?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen to read updates from ChatBox
  useEffect(() => {
    const handleReadUpdate = () => {
      setThreads(prev => [...prev]);
    };
    window.addEventListener("chat_read_update", handleReadUpdate);
    return () => {
      window.removeEventListener("chat_read_update", handleReadUpdate);
    };
  }, []);

  useEffect(() => {
    setHasLoaded(false);
  }, [user?.user_id || user?.id]);

  useEffect(() => {
    if (!hasLoaded) {
      loadThreads();
    } else {
      if (urlThreadId) {
        let t = matchThread(threads, urlThreadId);

        if (t) {
          setActiveThread(t);
          setThreadOpenError(null);
        } else if (urlThreadId.length > 0 && openTriedRef.current !== urlThreadId) {
          // Attempt direct fetch from server before setting new thread placeholder
          // v414: once per chat id — this effect re-runs on every list refresh and used to re-fetch + re-toast.
          openThreadById(urlThreadId);
        }
      } else {
        // When urlThreadId is missing (e.g. /inbox), reset the active thread to null
        setActiveThread(null);
        setThreadOpenError(null);
        openTriedRef.current = null;
      }
    }
  }, [user, urlThreadId, threads, hasLoaded, matchThread]);

  const loadThreads = async () => {
    if (!user) return;
    // No full-screen loader here. The inbox used to blur the WHOLE app behind the Ybex splash
    // until the thread list arrived — 20–30 s on a slow link — and again on every reload of the
    // list. The list area shows its own skeleton (below) and the rest of the screen stays usable.
    try {
      // Session 23: the list was fetched ONCE. A slow first answer (cold server / waking DB) hit
      // the 30 s timeout and the inbox stayed empty until a manual refresh — "refresh 2–3 times".
      // Now: 45 s timeout, up to 3 tries with backoff; a 403/401 is not retried.
      let data = null, lastErr = null;
      for (const wait of [0, 2000, 5000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
          ({ data } = await api.get("chat/v2/threads", { timeout: 45000 }));
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const st = e?.response?.status;
          if (st === 401 || st === 403) break;
        }
      }
      if (lastErr) throw lastErr;
      setLoadFailed(false);
      setThreads(data || []);
      setIsRestricted(false);
      
      if (urlThreadId) {
        let t = matchThread(data || [], urlThreadId);

        if (t) {
          setActiveThread(t);
        } else if (urlThreadId.length > 0 && openTriedRef.current !== urlThreadId) {
          // v414: a virtual "new_" chat only on 404; 403 / other errors show a message (see handleThreadOpenError)
          openThreadById(urlThreadId);
        }
      }
    } catch (err) {
      console.error(err);
      if (err.response?.status === 403 && err.response?.data?.restricted) {
        setIsRestricted(true);
        setRestrictionMessage(err.response.data.detail);
      } else {
        setLoadFailed(true);
      }
    } finally {
      setHasLoaded(true);
    }
  };

  // A failed load retries by itself when the tab comes back or the network returns.
  useEffect(() => {
    if (!loadFailed) return;
    const again = () => { if (!document.hidden) loadThreads(); };
    window.addEventListener("focus", again);
    window.addEventListener("online", again);
    const t = setInterval(again, 20000);
    return () => { window.removeEventListener("focus", again); window.removeEventListener("online", again); clearInterval(t); };
  }, [loadFailed]); // eslint-disable-line react-hooks/exhaustive-deps

  // v414: unread badge for the list — 0 for the open chat, my own last message, or nothing new since I opened it.
  const effectiveUnread = (t) => {
    if (activeThread?.id === t.id) return 0;
    if (t.last_message?.sender_user_id === (user?.user_id || user?.id)) return 0;
    const server = t.unread_count ?? t.unreadCount ?? 0;
    const mark = readMarksRef.current[t.id];
    if (!mark) return server;
    // v417: by message time; the message count only when the row has no time (the count grew after a switch
    // for messages already read here, and brought the badge back).
    const lt = lastMsgTime(t);
    const newer = lt > 0 ? lt > mark.t : Number(t.total_messages_count || 0) > mark.n;
    if (newer) { delete readMarksRef.current[t.id]; return server; } // a new incoming message: badge is back
    return 0;
  };

  // Merge actual threads with active virtual and default seeded creators
  const displayThreads = [...threads];
  
  if (activeThread && activeThread.isNew) {
    const virtualThreadWithPartner = {
      ...activeThread,
      creator: isBrand ? virtualPartner : activeThread.creator,
      brand: !isBrand ? virtualPartner : activeThread.brand,
      updated_at: activeThread.updated_at || new Date().toISOString()
    };
    if (!threads.some(t => t.id === activeThread.id || t.creator_id === activeThread.creator_id)) {
      displayThreads.push(virtualThreadWithPartner);
    }
  }

  const filteredThreads = sortThreadsByActivity(displayThreads?.filter(t => {
    const opp = isBrand ? t.creator : t.brand;
    // v332: search also checks the brand name kept on the profile and the campaign / brief title
    // (typing a campaign name found nothing; brands saved only under profile.company_name never matched).
    const q = search.toLowerCase().trim();
    const hay = [opp?.name, opp?.company_name, opp?.full_name, opp?.profile?.company_name, opp?.profile?.full_name,
      t.campaign_title, t.campaigns?.title, t.ugc_title, t.ugc_brief?.title, t.ugc_order?.title].filter(Boolean).join(" ").toLowerCase();
    const matchesSearch = !q || !opp || hay.includes(q);
    if (!matchesSearch) return false;

    // Was an inline check that omitted the ugcord_/thread_ugc_ prefixes, so a UGC thread
    // without the is_ugc flag (which the DB does not set) was listed under Campaigns.
    const isUgcThread = isUgc(t);

    if (tabFilter === "campaigns") {
      return !isUgcThread;
    }
    if (tabFilter === "ugc") {
      return isUgcThread;
    }
    if (tabFilter === "unread") {
      return effectiveUnread(t) > 0; // v414
    }
    return true;
  }));

  const displayActiveThread = activeThread?.isNew && virtualPartner ? {
    ...activeThread,
    creator: isBrand ? virtualPartner : activeThread.creator,
    brand: !isBrand ? virtualPartner : activeThread.brand
  } : activeThread;

  if (isMobile) {
    return <InboxMobile role={isBrand ? "brand" : "creator"} />;
  }

  if (isRestricted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[var(--bg-base)] relative overflow-hidden min-h-[500px] h-full">
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-[120%] h-[120%] absolute bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTMwIDBMMCAwaDB2MzBoMzBWMHptLTEgMXYyOEgxVjFoMjh6IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDcpIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=')] [mask-image:radial-gradient(circle_at_center,black_0%,transparent_50%)] opacity-40"></div>
        </div>
        
        <div className="relative z-10 flex flex-col items-center max-w-md px-6 py-12 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-default)] shadow-2xl">
          <div className="relative mb-6">
            <div className="w-20 h-20 bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/20 shadow-lg animate-pulse">
               <ShieldAlert size={40} className="text-rose-500" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-[var(--violet)] text-white rounded-xl flex items-center justify-center shadow-md">
               <Lock size={16} />
            </div>
          </div>
          
          <h3 className="text-2xl font-display font-bold text-[var(--text-primary)] mb-3">Inbox Locked 🔒</h3>
          <p className="text-[var(--text-secondary)] text-sm mb-8 leading-relaxed">
            {restrictionMessage || "Please apply to at least one campaign to unlock your chat and inbox section!"}
          </p>

          <Link to="/campaigns" className="px-6 py-3.5 bg-[var(--violet)] hover:bg-[#6b3deb] text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg hover:scale-105 transform duration-200">
             Explore Campaigns &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-[var(--bg-card)] h-full min-w-0 w-full overflow-hidden border-t border-[var(--border-default)] text-[var(--text-primary)]">
      
      {/* 2. Sidebar - Inbox List */}
      {/* v415: H2 on tablets (768–1023) the list and the chat didn't fit side by side — show one or the other there */}
      <div className={`w-full lg:w-80 xl:w-96 border-r border-[var(--border-default)] flex flex-col bg-white dark:bg-[var(--bg-card)] shrink-0 min-w-0 ${activeThread ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-3.5 md:p-5 border-b border-[var(--border-default)] h-13 md:h-20 shrink-0 flex items-center justify-between">
          <h2 className="text-base md:text-xl font-display font-bold text-[var(--text-primary)]">Inbox</h2>
          <div className="flex gap-1 bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-default)] overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'All' },
              { id: 'campaigns', label: 'Campaigns' },
              { id: 'ugc', label: 'UGC' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTabFilter(tab.id)}
                aria-pressed={tabFilter === tab.id}
                className={`px-2 md:px-2.5 py-1 text-[10px] md:text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                  tabFilter === tab.id
                    ? 'bg-[var(--violet)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="p-2.5 md:p-4 border-b border-[var(--border-default)] bg-white dark:bg-[var(--bg-card)] shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] md:w-4 md:h-4" />
            <input 
              type="text" 
              placeholder="Search name or campaign"
              aria-label="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg md:rounded-xl min-h-[40px] pl-8 md:pl-9 pr-3 md:pr-4 py-2 md:py-2.5 text-[16px] md:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--violet)] transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {filteredThreads?.map((t, idx) => {
            const isActive = activeThread?.id === t.id;
            const partner = isBrand ? t.creator : t.brand;
            const isPartnerOnline = partner && onlineUsers.includes(partner.user_id || partner.id);

            const partnerName = (!isBrand ? (partner?.profile?.company_name || partner?.company_name) : (partner?.profile?.full_name || partner?.profile?.name || partner?.full_name)) || partner?.name || (isBrand ? 'Creator' : 'Brand'); // v332: was "Unknown"
            const resolvedPic = (partner ? (
              (!isBrand ? (
                partner.profile?.logo || 
                partner.logo || 
                partner.logo_url || 
                partner.profile?.logo_url ||
                partner.photo || 
                partner.picture || 
                partner.avatar || 
                partner.avatar_url
              ) : (
                partner.photo || 
                partner.picture || 
                partner.avatar || 
                partner.avatar_url || 
                partner.profile?.photo || 
                partner.profile?.picture || 
                partner.profile?.avatar
              )) || ""
            ) : "") || ""; // v358: no third-party avatar service — PersonPhoto shows initials

            const unreadCount = isActive ? 0 : effectiveUnread(t); // v414: stays 0 after I opened it, until a new message

            return (
              <button
                key={`${t.id}-${idx}`}
                onClick={() => {
                  setActiveThread(t);
                  const targetPath = isBrand ? `/brand/inbox/${t.id}` : `/chat/${t.id}`;
                  navigate(targetPath, { replace: true });
                }}
                className={`w-full text-left p-2.5 md:p-4 border-b border-[var(--border-default)] transition-all duration-200 flex items-center gap-2.5 md:gap-3 hover:bg-[var(--bg-elevated)] ${isActive ? 'bg-[var(--bg-elevated)] border-l-4 ' + (isBrand ? 'border-l-[var(--violet)]' : 'border-l-emerald-500') : 'border-l-4 border-l-transparent'}`}
              >
                <div className="relative shrink-0">
                  <div className={`w-9 h-9 md:w-12 md:h-12 rounded-full overflow-hidden bg-[var(--bg-elevated)] shrink-0 border-2 transition-all duration-300 ${isPartnerOnline ? 'border-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] scale-105' : 'border-[var(--border-default)]'}`}>
                    <PersonPhoto src={resolvedPic} name={partnerName} className="w-full h-full object-cover" textClassName="text-xs md:text-sm" />{/* v358: broken photo / none → local initials (the dicebear fallback showed a broken image) */}
                  </div>
                  {isPartnerOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 md:w-3.5 md:h-3.5 bg-emerald-500 border-2 border-[var(--bg-base)] rounded-full animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0 flex items-center justify-between">
                  <div className="flex flex-col flex-1 min-w-0 pr-1.5 md:pr-2">
                    <div className="flex items-center gap-1 md:gap-1.5">
                      <span className={`text-xs md:text-[15px] truncate ${unreadCount > 0 ? 'font-bold text-[var(--text-primary)]' : 'font-semibold text-[var(--text-primary)]'}`}>
                        {partnerName}
                      </span>
                      {isUgc(t) ? (
                        <span className="px-1 py-0.2 text-[11px] md:text-[11px] font-black uppercase tracking-wider rounded bg-[#7C3AED]/10 text-[#6D28D9] border border-[#7C3AED]/25 shrink-0">{/* v415: darker text — purple-400 on pale was hard to read */}
                          UGC
                        </span>
                      ) : (
                        <span className="px-1 py-0.2 text-[11px] md:text-[11px] font-black uppercase tracking-wider rounded bg-blue-500/10 text-[#6D28D9] border border-blue-500/25 shrink-0">{/* v415: contrast */}
                          Campaign
                        </span>
                      )}
                    </div>
                    
                    <div className="text-[11px] md:text-[13px] text-[var(--text-secondary)] truncate flex items-center mt-0.5 font-medium">
                      {t.ugc_title || t.ugc_brief?.title || t.ugc_order?.title || t.campaigns?.title || t.campaign_title || 'Direct Deal'}
                    </div>
                  </div>
                  
                  {unreadCount > 0 && (
                    <div className="shrink-0 flex items-center justify-center ml-1.5 md:ml-2">
                      <span className="min-w-[16px] h-[16px] md:min-w-[20px] md:h-[20px] px-1 md:px-1.5 bg-[#3B82F6] text-white text-[11px] md:text-xs font-bold flex items-center justify-center rounded-full shadow-xs">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
          {loadFailed && filteredThreads.length === 0 ? (
            <OfflineAware compact className="mt-2" onRetry={loadThreads}>{/* v334: offline → OfflineState */}
            <div className="p-6 text-center" role="alert">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Couldn't load your conversations</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">The server is slow to respond. Retrying automatically…</p>
              <button
                onClick={() => run("retry", loadThreads)}
                disabled={isBusy("retry")}
                className="mt-3 min-h-[36px] px-4 py-2 rounded-xl bg-[var(--violet)] text-white text-xs font-bold disabled:opacity-70"
              >
                {/* v332: the button gave no sign it was working (a retry can take up to a minute) */}
                {isBusy("retry") ? <ButtonSpinner label="Retry now" /> : "Retry now"}
              </button>
            </div>
            </OfflineAware>
          ) : !hasLoaded && filteredThreads.length === 0 ? (
            <div className="p-3 space-y-3" aria-busy="true" aria-label="Loading conversations">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-[var(--bg-elevated)]" />
                    <div className="h-2.5 w-1/2 rounded bg-[var(--bg-elevated)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredThreads.length === 0 && (
            <div className="p-6 md:p-8 text-center text-[var(--text-tertiary)] text-xs md:text-sm">
              {/* v332: said "No conversations found." for a brand-new inbox too, and gave no way back from an empty filter */}
              {search.trim() || tabFilter !== "all" ? (
                <>
                  <p>No chats match.</p>
                  <button type="button" onClick={() => { setSearch(""); setTabFilter("all"); }} className="mt-2 min-h-[36px] px-3 text-xs font-bold text-[var(--violet)] hover:underline">Show all chats</button>
                </>
              ) : (
                <p>No conversations yet. Chats open once a brief is claimed or an offer is sent.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Main Chat Area */}
      <div className={`flex-1 min-w-0 flex flex-col ${!activeThread ? 'hidden lg:flex' : 'flex'}`}>{/* v415: H2 min-w-0 so the chat never pushes Send off-screen */}
        {!hasLoaded && urlThreadId ? (
          <div className="flex-1 flex flex-col p-6 space-y-4 bg-[var(--bg-base)]" aria-busy="true">
            <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-default)] animate-pulse">
              <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)]" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-32 rounded bg-[var(--bg-elevated)]" />
                <div className="h-3 w-20 rounded bg-[var(--bg-elevated)]" />
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-end space-y-3 pb-4">
              <div className="h-16 w-3/4 max-w-md rounded-2xl bg-[var(--bg-elevated)] animate-pulse" />
              <div className="h-12 w-1/2 max-w-sm rounded-2xl bg-[var(--bg-elevated)] self-end animate-pulse" />
            </div>
          </div>
        ) : isMobile ? (
          <ChatBoxMobile
            thread={displayActiveThread}
            user={user}
            onlineUsers={onlineUsers}
            onBack={() => {
              setActiveThread(null);
              navigate(isBrand ? '/brand/inbox' : '/chat', { replace: true });
            }}
          />
        ) : !displayActiveThread && threadOpenError && threadOpenError.id === urlThreadId ? (
          /* v414: 403 → not your chat; other errors → retry (no fake chat, no repeated toasts) */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[var(--bg-base)]" data-testid="chat-open-error" role="alert">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
              {threadOpenError.kind === "forbidden" ? <Lock size={28} /> : <MessageSquare size={28} />}
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {threadOpenError.kind === "forbidden" ? "This chat isn't yours" : "Couldn't open this chat"}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-sm">
              {threadOpenError.kind === "forbidden" ? "You're not part of this conversation. Pick one of your chats on the left." : "Check your connection and try again."}
            </p>
            {threadOpenError.kind !== "forbidden" && (
              <button type="button" onClick={() => openThreadById(threadOpenError.id)} className="mt-5 px-5 min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-[var(--violet)] text-white text-sm font-bold">
                Try again
              </button>
            )}
          </div>
        ) : !displayActiveThread && threads.length > 0 ? (
          /* v358: chats exist but none is open — ChatBox's empty state said "No activity yet … notifications" */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[var(--bg-base)]" data-testid="chat-select-placeholder">
            <div className="w-16 h-16 rounded-2xl bg-[var(--violet)]/10 text-[var(--violet)] flex items-center justify-center mb-4">
              <MessageSquare size={28} />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Select a chat to see the messages</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-sm">Pick a conversation on the left. Offers, drafts and payments for each deal live inside its chat.</p>
            {isBrand && (
              <Link to="/creators" className="mt-5 px-5 min-h-[40px] inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">
                <Search size={16} /> Explore Creators
              </Link>
            )}
          </div>
        ) : (
          <ChatBox
            thread={displayActiveThread}
            user={user}
            onlineUsers={onlineUsers}
            onBack={() => {
              setActiveThread(null);
              navigate(isBrand ? '/brand/inbox' : '/chat', { replace: true });
            }}
          />
        )}
      </div>
    </div>
  );
}
