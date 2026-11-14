import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import CreatorOnboarding from "../../pages/onboarding/CreatorOnboarding";
import CreatorOnboardingMobile from "../../pages/onboarding/CreatorOnboardingMobile";
import BrandOnboardingFlow from "../../components/Onboarding/BrandOnboardingFlow";
import BrandOnboardingMobile from "../../pages/onboarding/BrandOnboardingMobile";
import useIsMobile from "../../hooks/useIsMobile";
import { User, Building2 } from "lucide-react";
import { ignored } from "../../utils/ignored";
import FollowerGate from "../../components/onboarding/FollowerGate"; // v397: 500+ followers to join
import { onboardingGated, gateReason, loadFollowerMin } from "../../lib/followerGate";
import { useOnboardingStore } from "../../store/useOnboardingStore";
import { saveProgress, loadProgress } from "../../lib/onboardingProgress";
import { fillOnboardingFromIg, igFormNumbers } from "../../components/instagram/InstagramFetchButton"; // v397: check again

export default function Onboarding() {
  const { user, refreshUser, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [savingRole, setSavingRole] = useState(false);
  const autoTried = useRef(false);

  // v397 (Ravi: "500 se kam followers wale kachra aa rahe hain, ads ka budget kharab"): a creator whose Instagram
  // (fetched from Meta, not typed) has under 500 followers sees a clean page with a work-link box instead of the form.
  const igHandle = useOnboardingStore((st) => st.instagramHandle);
  const igFollowers = useOnboardingStore((st) => st.followerCount);
  const igVia = useOnboardingStore((st) => st.instagramConnectedVia);
  const gateOpen = useOnboardingStore((st) => Boolean(st.followerGateOpen));
  const [resumedGated, setResumedGated] = useState(false);
  const [, setMinTick] = useState(0);
  useEffect(() => { if (user?.role === "creator") loadFollowerMin().then(() => setMinTick((t) => t + 1)); }, [user?.role]); // admin-set minimum
  useEffect(() => {
    // came back later: the saved answers already passed step 1 with an under-500 Instagram → straight to the clean page
    if (user?.role !== "creator") return undefined;
    let alive = true;
    loadProgress().then((p) => {
      if (!alive || !p?.basics_done || !onboardingGated(p.answers || {})) return;
      useOnboardingStore.getState().applySnapshot(p.answers);
      setResumedGated(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user?.role]);
  const gateWhy = gateReason({ instagramHandle: igHandle, followerCount: igFollowers, instagramConnectedVia: igVia });
  const gatedNow = user?.role === "creator" && (gateOpen || resumedGated) && Boolean(gateWhy);
  // v397: "check again" after switching to a public Professional account — back to the form, Instagram is read again
  // (a fresh page, so the earlier "not found" answer isn't reused).
  // v397: "check again" asks Instagram right here. Read now → the numbers go in and the page moves on (or shows the
  // "under N followers" page); still unreadable → false, and the gate slides the work-link box in.
  const retryInstagram = async () => {
    const handle = String(igHandle || "").replace(/^@+/, "").trim();
    if (!handle) return false;
    try {
      const { data } = await api.post("instagram/preview", { username: handle });
      const n = data?.stats ? igFormNumbers(data.stats) : null;
      if (!n || n.followers === null || n.followers === undefined) return false;
      fillOnboardingFromIg(useOnboardingStore.getState().updateField, n, useOnboardingStore.getState());
      return true;
    } catch { return false; }
  };
  const [gateInfo, setGateInfo] = useState(null); // { exempt, submitted } from the server
  useEffect(() => {
    if (!gatedNow || gateInfo) return undefined;
    let alive = true;
    api.get("creator/follower-gate").then((r) => {
      if (!alive) return;
      const info = r.data || { exempt: false, submitted: false };
      if (info.exempt) useOnboardingStore.getState().updateField("followerGateExempt", true); // the team let them in
      setGateInfo(info);
    })
      .catch(() => { if (alive) setGateInfo({ exempt: false, submitted: false }); });
    return () => { alive = false; };
  }, [gatedNow, gateInfo]);
  const changeIgAccount = async () => {
    const st = useOnboardingStore.getState();
    st.updateField("instagramHandle", "");
    st.updateField("followerCount", "");
    st.updateField("instagramAvgReach", "");
    st.updateField("instagramConnectedVia", "");
    // the server copy of the answers is what the form resumes from, so it has to forget the old handle first
    await saveProgress({ flow: isMobile ? "creator_mobile" : "creator_desktop", page: "identity", pos: isMobile ? { step: 1 } : { step: 1, sub: 1 }, answers: useOnboardingStore.getState().snapshot() }).catch(() => {});
    st.updateField("followerGateOpen", false);
    setResumedGated(false);
    setGateInfo(null);
  };

  // An account with no role (e.g. a Google sign-up) used to fall through to the creator form,
  // even for a brand. Save the role first — from the sign-up link if it carries one, otherwise
  // by asking.
  const chooseRole = async (role) => {
    if (savingRole) return;
    setSavingRole(true);
    try {
      await api.post("auth/role", { role });
      await refreshUser();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save your account type. Please try again.");
    } finally {
      setSavingRole(false);
    }
  };

  useEffect(() => {
    if (!user || user.role || autoTried.current) return;
    const fromLink = new URLSearchParams(location.search).get("role");
    if (fromLink === "creator" || fromLink === "brand") {
      autoTried.current = true;
      chooseRole(fromLink);
    }
  }, [user, location.search]);

  useEffect(() => {
    // If they finish onboarding, send them off — except while the phone onboarding is showing its
    // last "this is how creators see you" preview (session 41: the brand preview used to be skipped
    // because the saved account flipped to onboarded and this sent them to the dashboard at once).
    let previewOpen = false;
    try { previewOpen = sessionStorage.getItem("ybex_onboarding_preview") === "1"; } catch (e) { ignored("Onboarding:preview", e); }
    if (!previewOpen && (user?.onboarding_completed || user?.onboarding_complete || user?.onboarded)) {
      navigate('/dashboard', { replace: true }); // Session 58: Back used to bounce dashboard ↔ onboarding forever
    }
  }, [user, navigate]);

  if (!user) return <div className="min-h-screen bg-[var(--bg-base)]" aria-busy="true" aria-label="Loading" />; // v415: no bare "Loading..." text flash

  if (!user.role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)] p-6">
        <div className="w-full max-w-md">
          <h1 className="text-xl font-bold text-center">How will you use Ybex?</h1>
          <p className="text-sm text-[var(--text-secondary)] text-center mt-1 mb-6">Pick one to set up your account.</p>
          <div className="grid gap-3">
            <button
              type="button"
              disabled={savingRole}
              onClick={() => chooseRole("creator")}
              className="flex items-center gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--violet)] text-left disabled:opacity-60 cursor-pointer"
            >
              <User size={22} className="text-[var(--violet)] shrink-0" />
              <span><span className="block font-bold text-sm">I'm a Creator</span><span className="block text-xs text-[var(--text-secondary)]">Get brand deals and UGC orders</span></span>
            </button>
            <button
              type="button"
              disabled={savingRole}
              onClick={() => chooseRole("brand")}
              className="flex items-center gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--violet)] text-left disabled:opacity-60 cursor-pointer"
            >
              <Building2 size={22} className="text-[var(--violet)] shrink-0" />
              <span><span className="block font-bold text-sm">I'm a Brand</span><span className="block text-xs text-[var(--text-secondary)]">Run campaigns and order UGC</span></span>
            </button>
          </div>
          <button type="button" onClick={() => logout()} className="mt-6 w-full text-xs text-[var(--text-secondary)] hover:underline cursor-pointer">Log out</button>
        </div>
      </div>
    );
  }

  if (gatedNow && (!gateInfo || !gateInfo.exempt)) {
    if (!gateInfo) return <div className="min-h-screen bg-white" data-testid="follower-gate-loading" />;
    return (
      <FollowerGate
        handle={igHandle}
        sent={Boolean(gateInfo.submitted)}
        min={gateInfo.min}
        reason={gateWhy}
        onRetry={gateWhy === "unverified" ? retryInstagram : undefined}
        onSend={(link) => api.post("creator/follower-gate/work", { link, handle: igHandle, followers: igFollowers === "" ? null : Number(igFollowers), reason: gateWhy })}
        onChangeAccount={changeIgAccount}
        onLogout={() => logout()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans relative overflow-x-hidden w-full max-w-full">
      {user?.role === 'brand' ? (
        isMobile ? (
          <BrandOnboardingMobile
            user={user}
            onComplete={async () => {
              setUser({ ...user, onboarding_completed: true });
              try { await refreshUser(); } catch (e) { ignored("Onboarding:95", e); }
            }}
          />
        ) : (
          <BrandOnboardingFlow 
            user={user} 
            onComplete={async () => {
              setUser({ ...user, onboarding_completed: true });
              try { await refreshUser(); } catch (e) { ignored("Onboarding:103", e); }
              navigate('/dashboard');
            }} 
          />
        )
      ) : isMobile ? (
        <CreatorOnboardingMobile
          user={user}
          onComplete={async () => {
            setUser({ ...user, onboarding_completed: true });
            try { await refreshUser(); } catch (e) { ignored("Onboarding:113", e); }
          }}
        />
      ) : (
        <CreatorOnboarding 
          user={user} 
          onComplete={async () => {
            setUser({ ...user, onboarding_completed: true });
            try { await refreshUser(); } catch (e) { ignored("Onboarding:121", e); }
            navigate('/dashboard');
          }} 
        />
      )}
      {/* v291 (Ravi): the second Log Out (bottom-left) is gone — the header already has one. */}
    </div>
  );
}
