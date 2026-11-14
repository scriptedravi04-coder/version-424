import React, { Suspense } from "react";
import { waitForHomeReady, anyPopupOnScreen } from "./lib/popupRules";
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate, useNavigate, useParams, useNavigationType } from "react-router-dom";
import { Toaster } from "sonner";
import { motion, MotionConfig } from "framer-motion";
import { pageDirection } from "./lib/motion";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import useIsMobile from "./hooks/useIsMobile";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LoadingProvider } from "./contexts/LoadingContext";
import GlobalLoader from "./components/layout/GlobalLoader";
import { useLoading } from "./contexts/LoadingContext";
import ColdStartSplash from "./components/layout/ColdStartSplash";
import AppLaunchSplash from "./components/layout/AppLaunchSplash";
import OfflineBanner, { YbexDownPage } from "./components/common/OfflineBanner";
import { InstallPopup, LandingInstallBar } from "./components/common/PWAInstallPrompt"; // v378
import { apiUrl } from "./lib/native"; // v378
import TermsUpdateGate from "./components/legal/TermsUpdateGate";
import ReferralClaimer from "./components/referral/ReferralClaimer";
import { ReferralLanding, BrandReferralLanding, CreatorCodeLanding } from "./components/referral/ReferralLinkRoutes";
import GoogleAnalytics from "./components/GoogleAnalytics";
import Layout from "./components/layout/Layout";
import PageSkeleton from "./components/layout/PageSkeleton";
import PageErrorBoundary from "./components/PageErrorBoundary";
import StatusBarSync from "./components/layout/StatusBarSync";
import { isStandalone, appAuthTarget } from "./lib/standalone";
import { captureRefFromUrl } from "./lib/referralCapture"; // v370
import PhoneFrame from "./components/app/DesktopAuthFrame"; // v372: phone card 768–1023px, desktop page ≥1024px

// Immediate critical routes for instant first paint
import Landing from "./pages/dashboard/Landing";
import Login from "./pages/auth/Login";
// v282: the app's email screen is in the main bundle, so tapping "I'm a Creator / Brand" on the
// login screen opens it instantly (Ravi's recording showed a blank flash while its file loaded).
import AppContinue from "./pages/app/AppContinue";
import AppOAuthDone from "./pages/app/AppOAuthDone";
import AppQuickDetails from "./pages/app/AppQuickDetails"; // v376: Google sign-up → Instagram + WhatsApp
import { isFinishLater } from "./lib/onboardingLater";
import { isChunkLoadError, recoverFromStaleBuild } from "./lib/staleBuild";
import { SupportModeBanner } from "./components/admin/ExploreHideControl"; // v429

// Helper to safely load dynamic imports with auto-retry; a stale page after a deploy moves to the new version (v398: lib/staleBuild).
const lazyWithRetry = (componentImport) =>
  React.lazy(async () => {
    // v390: a chunk that resolves to nothing (stale page after a deploy) must count as a failed load, not crash React.
    const load = async () => {
      const m = await componentImport();
      if (!m || !m.default) throw new Error("Failed to fetch dynamically imported module (empty chunk)");
      return m;
    };
    try {
      return await load();
    } catch (error) {
      console.warn("[App] Dynamic import failed, retrying module...", error);
      await new Promise((r) => setTimeout(r, 400));
      try {
        return await load();
      } catch (retryErr) {
        if (isChunkLoadError(retryErr) && recoverFromStaleBuild()) return new Promise(() => {}); // page is moving to the new version
        throw retryErr;
      }
    }
  });

// Code-split dynamic routes for ultra-fast initial bundle loading
// v391 (speed QA): popups, Signup and Dashboard load as their own files, not in the first download. The popups mount when the browser is idle (max 1.2 s) so the landing paints first.
const NotificationPopup = lazyWithRetry(() => import("./components/NotificationPopup"));
const WhatsNewPopup = lazyWithRetry(() => import("./components/whatsNew/WhatsNewPopup"));
const PushPermissionScreen = lazyWithRetry(() => import("./components/push/PushPermissionScreen"));
const PromoPopup = lazyWithRetry(() => import("./components/promo/PromoPopup"));
const DiwaliEntryScreen = lazyWithRetry(() => import("./components/challenge/DiwaliEntryScreen"));
const ProfileCompleteCongrats = lazyWithRetry(() => import("./components/challenge/ProfileCompleteCongrats"));
const Signup = lazyWithRetry(() => import("./pages/auth/Signup"));
const Dashboard = lazyWithRetry(() => import("./pages/dashboard/Dashboard"));
function Idle({ children }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const go = () => setReady(true);
    if (typeof window.requestIdleCallback === "function") { const id = window.requestIdleCallback(go, { timeout: 1200 }); return () => window.cancelIdleCallback && window.cancelIdleCallback(id); }
    const t = setTimeout(go, 600); return () => clearTimeout(t);
  }, []);
  return ready ? <Suspense fallback={null}>{children}</Suspense> : null;
}
const VerifyEmail = lazyWithRetry(() => import("./pages/auth/VerifyEmail"));
const AppWelcome = lazyWithRetry(() => import("./pages/app/AppWelcome"));
const ForgotPassword = lazyWithRetry(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/auth/ResetPassword"));
const AuthCallback = lazyWithRetry(() => import("./pages/auth/AuthCallback"));
const Onboarding = lazyWithRetry(() => import("./pages/auth/Onboarding"));
const AccountStatus = lazyWithRetry(() => import("./pages/auth/AccountStatus"));
const Explore = lazyWithRetry(() => import("./pages/dashboard/Explore"));
const CreatorPublicView = lazyWithRetry(() => import("./pages/creator/CreatorPublicView"));
const PublicCreatorApply = lazyWithRetry(() => import("./pages/creator/PublicCreatorApply"));
const CreatorProfile = lazyWithRetry(() => import("./pages/creator/CreatorProfile"));
const CreatorSettings = lazyWithRetry(() => import("./pages/creator/CreatorSettings"));
const BrandProfile = lazyWithRetry(() => import("./pages/brand/BrandProfile"));
const BrandPublicView = lazyWithRetry(() => import("./pages/brand/BrandPublicView"));
const BrandSettings = lazyWithRetry(() => import("./pages/brand/BrandSettings"));
// const Dashboard removed
const Campaigns = lazyWithRetry(() => import("./pages/campaigns/Campaigns"));
const CampaignDetail = lazyWithRetry(() => import("./pages/campaigns/CampaignDetail"));
const Collabs = lazyWithRetry(() => import("./pages/collabs/Collabs"));
const DealDetail = lazyWithRetry(() => import("./pages/collabs/DealDetail"));
const AddCollab = lazyWithRetry(() => import("./pages/collabs/AddCollab"));
const UploadedCollab = lazyWithRetry(() => import("./pages/collabs/UploadedCollab"));
const Notifications = lazyWithRetry(() => import("./pages/dashboard/Notifications"));
const Settings = lazyWithRetry(() => import("./pages/dashboard/Settings"));
const Earnings = lazyWithRetry(() => import("./pages/dashboard/Earnings"));
const Chat = lazyWithRetry(() => import("./pages/dashboard/Chat"));
const Admin = lazyWithRetry(() => import("./pages/admin/Admin"));
const AdminLogin = lazyWithRetry(() => import("./pages/admin/AdminLogin"));
const AppPhotoStep = lazyWithRetry(() => import("./pages/app/AppPhotoStep")); // v402: new creator → photo + name
const UgcOrders = lazyWithRetry(() => import("./pages/ugc/UgcOrders"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/dashboard/PrivacyPolicy"));
const DeleteAccount = lazyWithRetry(() => import("./pages/legal/DeleteAccount"));
const InfoHub = lazyWithRetry(() => import("./pages/dashboard/InfoHub"));
const CreatorCampaignFlow = lazyWithRetry(() => import("./pages/creator/CreatorCampaignFlow"));
const Refer = lazyWithRetry(() => import("./pages/dashboard/Refer"));
const ChallengePage = lazyWithRetry(() => import("./pages/ChallengePage")); // v367: Diwali Creator Challenge

// Help Center
const HelpCenter = lazyWithRetry(() => import("./pages/help/HelpCenter"));
const HelpCategory = lazyWithRetry(() => import("./pages/help/HelpCategory"));
const HelpTickets = lazyWithRetry(() => import("./pages/help/HelpTickets"));

// Blog & Journal Pages
const BlogIndex = lazyWithRetry(() => import("./pages/blog/BlogIndex"));
const BlogPostDetail = lazyWithRetry(() => import("./pages/blog/BlogPostDetail"));

// Brand Specific Pages
const BrandCampaigns = lazyWithRetry(() => import("./pages/brand/BrandCampaigns"));
const BrandCampaignCreate = lazyWithRetry(() => import("./pages/brand/BrandCampaignCreate"));
const BrandCampaignApplicants = lazyWithRetry(() => import("./pages/brand/BrandCampaignApplicants"));
const BrandInbox = lazyWithRetry(() => import("./pages/brand/BrandInbox"));
const BrandNotifications = lazyWithRetry(() => import("./pages/brand/BrandNotifications"));
const CreatorInbox = lazyWithRetry(() => import("./pages/creator/CreatorInbox"));
const CreatorNotifications = lazyWithRetry(() => import("./pages/creator/CreatorNotifications"));
const BrandPayments = lazyWithRetry(() => import("./pages/brand/BrandPayments"));
const BrandKyc = lazyWithRetry(() => import("./pages/brand/BrandKyc"));

const CreatorKyc = lazyWithRetry(() => import("./pages/creator/CreatorKyc"));
const KYCStatus = lazyWithRetry(() => import("./pages/kyc/KYCStatus"));
import { api, isBrandLike } from "./lib/api"; // v416: isBrandLike

// Dashboard is imported eagerly above for instant access
const PublicUGC = lazyWithRetry(() => import("./pages/ugc/PublicUGC"));
const BrandInstantUGC = lazyWithRetry(() => import("./pages/brand/BrandInstantUGC"));
const BrandUGCBriefs = lazyWithRetry(() => import("./pages/brand/BrandUGCBriefs"));
const BrandUGCPost = lazyWithRetry(() => import("./pages/brand/BrandUGCPost"));
const BrandUGCOrders = lazyWithRetry(() => import("./pages/brand/BrandUGCOrders"));
const CreatorUGCBrowse = lazyWithRetry(() => import("./pages/creator/CreatorUGCBrowse"));
const CreatorUGCOrders = lazyWithRetry(() => import("./pages/creator/CreatorUGCOrders"));

// v378: the old App Upgrade / Quick Update maintenance scenes were replaced by Ravi's design (YbexDownPage).

// Session 58: after login, come back to the page the person was trying to open (an email link to a chat used to
// land on the dashboard). Only in-app paths are kept.
function LoginRedirect() {
  const location = useLocation();
  const next = `${location.pathname}${location.search || ""}`;
  const keep = next && next !== "/" && next.startsWith("/") && !next.startsWith("//") && !/^\/(login|signup|app)\b/.test(next);
  return <Navigate to={keep ? `/login?next=${encodeURIComponent(next)}` : "/login"} replace />;
}

function KeepQueryRedirect({ to }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search || ""}`} replace />;
}

function ProtectedRoute({ children, requireOnboarded = true }) {
  const { user, loading } = useAuth();
  if (loading) return (
      <div className="flex flex-col min-h-screen p-6 md:p-8 bg-[var(--bg-base)] w-full">
        <PageSkeleton />
      </div>
    );
  if (!user) return <LoginRedirect />;
  const isAdminUser = user.role === 'admin' || user.team_role === 'sub_admin';
  // Session 39 (M8): a creator who tapped "Finish later" after the basics may use the app.
  const finishLater = (user.role || "creator") === "creator" && isFinishLater(user.user_id || user.id);
  if (requireOnboarded && !isAdminUser && !finishLater && !user.onboarded && !user.onboarding_completed && !user.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return children;
}


// Session 39 (M34, Ravi): creators don't get the Explore creators page — they go Home.
function NotForCreators({ children }) {
  const { user, loading } = useAuth();
  if (loading) return children;
  if (user && (user.role || "creator") === "creator") return <Navigate to="/dashboard" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
      <div className="flex flex-col min-h-screen p-6 md:p-8 bg-[var(--bg-base)] w-full">
        <PageSkeleton />
      </div>
    );
  if (!user) return <Navigate to="/ybx-admin" replace />;
  const isAdminUser = user.role === 'admin' || user.team_role === 'sub_admin';
  if (!isAdminUser) return <Navigate to="/dashboard" replace />;
  return children;
}

function BrandRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
      <div className="flex flex-col min-h-screen p-6 md:p-8 bg-[var(--bg-base)] w-full">
        <PageSkeleton />
      </div>
    );
  if (!user) return <LoginRedirect />;
  // Session 58: agency / talent-manager accounts are brand accounts too (they were sent away from every brand page).
  if (!isBrandLike(user.role)) return <Navigate to="/dashboard" replace />; // v416 (CR4): shared helper (src/lib/api.js)
  if (!user.onboarded && !user.onboarding_completed && !user.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return children;
}

// Session 37: route change = one short fade (desktop, tab switches) or a small slide on phones
// (deeper page from the right, back from the left). The old page leaves instantly, so a tap
// never waits for an animation (before: 0.35 s out + 0.35 s in on every navigation).
const PageDirectionContext = React.createContext("none");

function Page({ children }) {
  const location = useLocation();
  const direction = React.useContext(PageDirectionContext);
  const isMobile = useIsMobile();
  const isChatRoute = location.pathname.startsWith("/chat")
    || location.pathname.startsWith("/brand/inbox")
    || location.pathname.startsWith("/creator/inbox");
  // v343 (Ravi's screenshots: page text + bottom bar showing ON TOP of popups): the wrapper used to fade
  // with framer-motion. Its inline opacity / will-change made the whole page one stacking layer, so every
  // popup inside a page (z 9999) could not rise above the footer headline (z 10) or the bottom nav (z 50).
  // Same fade now in plain CSS with fill-mode "backwards" — once it ends, nothing stays on the wrapper.
  const fadeMs = (isMobile ? direction : "none") === "none" ? 140 : 200;

  return (
    <div
      className={`yb-page-in flex flex-col w-full relative ${isChatRoute ? 'h-full flex-1' : ''}`}
      style={{ animationDuration: `${fadeMs}ms` }}
      data-testid="page-wrapper"
    >
      {/* Every route renders through <Page>, so one boundary here covers all 77 of them.
          Keyed on the pathname so navigating away from a broken page clears the error. */}
      <PageErrorBoundary routeKey={location.pathname}>
        <Suspense fallback={<RouteNeutralFallback />}>{/* v417: neutral fallback — the page draws its own skeleton (no skeleton → other skeleton jump) */}
          {children}
        </Suspense>
      </PageErrorBoundary>
    </div>
  );
}

function KycRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    async function checkStatus() {
      if (!user) return;
      try {
        const { data } = await api.get("verifications/me").catch(() => ({ data: null }));
        const status = data?.status;
        if (status === "approved" || status === "APPROVED" || status === "pending" || status === "PENDING" || status === "UNDER_REVIEW") { // Session 58: user.verified is email, not KYC
          navigate("/kyc/status", { replace: true });
        } else if (isBrandLike(user.role)) { // v423: agency / talent manager are brand-side too
          navigate("/brand/kyc", { replace: true });
        } else {
          navigate("/creator/kyc", { replace: true });
        }
      } catch (e) {
        if (isBrandLike(user.role)) {
          navigate("/brand/kyc", { replace: true });
        } else {
          navigate("/creator/kyc", { replace: true });
        }
      }
    }
    checkStatus();
  }, [user, navigate]);

  return (
    <div className="flex flex-col w-full min-h-screen bg-[var(--bg-base)] p-6 md:p-8">
      <PageSkeleton />
    </div>
  );
}

function ProfileDispatcher() {
  const { user } = useAuth();
  if (isBrandLike(user?.role)) { // v423
    return <BrandProfile />;
  }
  return <CreatorProfile />;
}

// Unknown URLs used to redirect silently to "/", so a mistyped or stale link looked like the
// app had thrown the user out. Say what happened and offer the way back.
// Session 42: inside the installed app, "/" and "/login" (plain, no ?ref= / ?next= links) open the
// app welcome instead of the website pages. Browser tabs are unchanged.
// v333 (Ravi): a phone push notification opened the old /notifications page (no back button, "stuck"). On a
// phone, creators and brands now land on their own Notifications screen (All / Briefs / Payouts) with the same
// query string; admins and desktop keep the full page.
function NotificationsEntry() {
  const { user } = useAuth();
  const location = useLocation();
  const isPhone = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
  const isAdminUser = user?.role === "admin" || user?.team_role === "sub_admin";
  if (isPhone && user && !isAdminUser) {
    const to = isBrandLike(user.role) ? "/brand/notifications" : "/creator/notifications"; // v423
    return <Navigate to={`${to}${location.search || ""}`} replace />;
  }
  return <Layout><Page><Notifications /></Page></Layout>;
}

// v370: the website uses the app's sign-in too (role cards → email → password / OTP, Google below).
function WebAuthToApp({ children, login = false }) {
  const location = useLocation();
  const target = appAuthTarget(location.search, { login });
  if (!target) return children;
  try { captureRefFromUrl(); } catch { /* no referral in the link */ }
  return <Navigate to={target} replace />;
}

// v370: on a computer the app's sign-in screens sat in a phone-sized card. v372: ≥1024px is a real desktop page
// (src/components/app/DesktopAuthFrame.jsx); 768–1023px keeps the phone card; phones unchanged.
function InstalledAppGoesToApp({ children }) {
  const location = useLocation();
  // v431 (Ravi's video: the Play Store app opened the website landing with broken logos — the app doesn't carry the
  // website's photos): inside the installed / native app "/" always goes to the app start, keeping any ?ref etc.
  if (isStandalone()) return <Navigate to={"/app" + (location.search || "")} replace />;
  return children;
}

// v408: /admin/kyc, /admin/users/123 … (old links, bookmarks, a tab name typed in the bar) → /admin?tab=<first part>
function AdminSubPathToPanel() {
  const location = useLocation();
  const first = String(location.pathname || "").replace(/^\/admin\/?/, "").split("/")[0].replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  const q = new URLSearchParams(location.search || "");
  if (first && !q.get("tab")) q.set("tab", first);
  const qs = q.toString();
  return <Navigate to={"/admin" + (qs ? "?" + qs : "")} replace />;
}

function NotFoundPage() {
  // v332: signed-in people go back to their Home (the button opened the public website page) and no "Error 404" tech label.
  const { user } = useAuth();
  const isAdminUser = user?.role === "admin" || user?.team_role === "sub_admin"; // v408: admins go back to the panel
  const homeHref = isAdminUser ? "/admin" : user ? "/dashboard" : "/";
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-16">
      <p className="text-xs font-bold tracking-widest uppercase text-[var(--text-tertiary)]">Page not found</p>
      <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-[var(--text-primary)]">This page doesn't exist</h1>
      <p className="mt-3 max-w-md text-sm md:text-base text-[var(--text-secondary)]">The link may be old or mistyped.</p>
      <a href={homeHref} className="mt-8 inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[var(--violet)] text-white font-bold text-sm min-h-[44px]">Go to home</a>
    </div>
  );
}

function RouteLoaderFallback() {
  // Session 30 (loader design 14b): while a page's code loads, the 2px top bar runs too.
  const loadingCtx = useLoading();
  React.useEffect(() => {
    loadingCtx?.startLoading?.();
    return () => loadingCtx?.stopLoading?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <RouteNeutralFallback />; // v417: was the generic PageSkeleton, then the page's own skeleton (layout jump)
}

// v417: while a page's code loads — same light background, nothing shaped like content, and a small
// centered spinner only if it takes a moment (fast loads show nothing at all). The 2px top bar still runs.
function RouteNeutralFallback() {
  const [showSpinner, setShowSpinner] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setShowSpinner(true), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" aria-busy="true" aria-label="Loading" data-testid="route-fallback" data-dashboard-loading="true" className="w-full flex-1 min-h-[calc(100vh-64px)] flex items-center justify-center bg-transparent">
      {showSpinner && (
        <span aria-hidden="true" className="w-6 h-6 rounded-full border-2 border-[#DDD6FE] border-t-violet-600 animate-spin motion-reduce:animate-none" />
      )}
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const navType = useNavigationType();
  const prevPath = React.useRef(location.pathname);
  const direction = React.useMemo(
    () => pageDirection(prevPath.current, location.pathname, navType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location.pathname]
  );
  React.useEffect(() => { prevPath.current = location.pathname; }, [location.pathname]);
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Suspense fallback={<RouteLoaderFallback />}>
      <PageDirectionContext.Provider value={direction}>
        <Routes location={location} key={location.pathname}>
          {/* Session 42: the installed app starts at /app (manifest start_url). Inside the app, the
              website landing and the website login send people there too. */}
          <Route path="/app" element={<PhoneFrame><Suspense fallback={<div className="min-h-[100dvh] bg-[#F2F1F7]" />}><AppWelcome /></Suspense></PhoneFrame>} />
          <Route path="/app/continue/:role" element={<PhoneFrame><AppContinue /></PhoneFrame>} />
          <Route path="/app/oauth" element={<AppOAuthDone />} />
          <Route path="/app/details" element={<AppQuickDetails />} />{/* v376 */}
          <Route path="/app/photo" element={<AppPhotoStep />} />{/* v402 */}
          <Route path="/" element={<InstalledAppGoesToApp><Landing /><LandingInstallBar /></InstalledAppGoesToApp>} />{/* v333: the new landing has its own nav + footer */}
          <Route path="/login" element={<WebAuthToApp login><Layout><Page><Login /></Page></Layout></WebAuthToApp>} />{/* v370: → app sign-in (old form only for ?demo) */}
          <Route path="/forgot-password" element={<Layout><Page><ForgotPassword /></Page></Layout>} />
          <Route path="/reset-password" element={<Layout><Page><ResetPassword /></Page></Layout>} />
          <Route path="/account-status" element={<Layout><Page><AccountStatus /></Page></Layout>} />
          <Route path="/signup" element={<WebAuthToApp><Layout><Page><Signup /></Page></Layout></WebAuthToApp>} />{/* v370 */}
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/onboarding" element={<ProtectedRoute requireOnboarded={false}><Layout><Page><Onboarding /></Page></Layout></ProtectedRoute>} />
          <Route path="/creators" element={<NotForCreators><Layout><Page><Explore /></Page></Layout></NotForCreators>} />
          <Route path="/explore" element={<NotForCreators><Layout><Page><Explore /></Page></Layout></NotForCreators>} />
          <Route path="/apply-creator" element={<Page><PublicCreatorApply /></Page>} />
          <Route path="/apply" element={<Page><PublicCreatorApply /></Page>} />
          <Route path="/challenge" element={<Page><ChallengePage /></Page>} />{/* v367: public, no login */}
          <Route path="/offer" element={<Page><ChallengePage /></Page>} />{/* v368: stable link to the current offer (banners, popups, ads) */}
          <Route path="/offers" element={<Page><ChallengePage /></Page>} />
          {/* Session 58: links used by notifications / emails that had no page (they opened "not found" profiles) */}
          <Route path="/creator/dashboard" element={<Navigate to="/dashboard" replace />} />
          <Route path="/creator/refer" element={<Navigate to="/refer" replace />} />
          <Route path="/brand/ugc" element={<Navigate to="/brand/ugc/orders" replace />} />
          <Route path="/auth/register" element={<KeepQueryRedirect to="/signup" />} />
          <Route path="/creator/:id" element={<Layout><Page><CreatorPublicView /></Page></Layout>} />
          <Route path="/profile" element={<ProtectedRoute><Layout><Page><ProfileDispatcher /></Page></Layout></ProtectedRoute>} />
          <Route path="/profile/overview" element={<ProtectedRoute><Layout><Page><ProfileDispatcher /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/profile" element={<ProtectedRoute><Layout><Page><CreatorProfile /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand/profile" element={<BrandRoute><Layout><Page><BrandProfile /></Page></Layout></BrandRoute>} />{/* Session 58: brand-only */}
          <Route path="/creator/settings" element={<ProtectedRoute><Layout><Page><CreatorSettings /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand/settings" element={<BrandRoute><Layout><Page><BrandSettings /></Page></Layout></BrandRoute>} />
          <Route path="/brand/account" element={<BrandRoute><Layout><Page><BrandSettings /></Page></Layout></BrandRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute requireOnboarded><Layout><Page><Dashboard /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand" element={<BrandRoute><Layout><Page><Dashboard /></Page></Layout></BrandRoute>} />
          <Route path="/brand/dashboard" element={<BrandRoute><Layout><Page><Dashboard /></Page></Layout></BrandRoute>} />
          <Route path="/brand/discover" element={<NotForCreators><Layout><Page><Explore /></Page></Layout></NotForCreators>} />
          <Route path="/campaigns" element={<Layout><Page><Campaigns /></Page></Layout>} />
          <Route path="/campaigns/:id" element={<Layout><Page><CampaignDetail /></Page></Layout>} />
          <Route path="/deals" element={<ProtectedRoute><Layout><Page><Collabs /></Page></Layout></ProtectedRoute>} />
          <Route path="/collabs" element={<ProtectedRoute><Layout><Page><Collabs /></Page></Layout></ProtectedRoute>} />
          <Route path="/deals/:id" element={<ProtectedRoute><Layout><Page><DealDetail /></Page></Layout></ProtectedRoute>} />
          <Route path="/deals/:id/add-collab" element={<ProtectedRoute><Layout><Page><AddCollab /></Page></Layout></ProtectedRoute>} />
          <Route path="/deals/:id/uploaded-collab" element={<ProtectedRoute><Layout><Page><UploadedCollab /></Page></Layout></ProtectedRoute>} />
          <Route path="/inbox" element={<ProtectedRoute><Layout><Page><Chat /></Page></Layout></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><Layout><Page><Chat /></Page></Layout></ProtectedRoute>} />
          <Route path="/chat/:userId" element={<ProtectedRoute><Layout><Page><Chat /></Page></Layout></ProtectedRoute>} />
          {/* Session 35: some notifications link to /messages/:id (campaign approved, payment released). */}
          <Route path="/messages/:id" element={<MessagesRedirect />} />
          <Route path="/messages" element={<Navigate to="/chat" replace />} />
          {/* Session 36: referral + creator-code links */}
          <Route path="/r/:code" element={<ReferralLanding />} />
          <Route path="/b/:code" element={<BrandReferralLanding />} />
          {/* v290: poster links — /invite (friends) and /invite/brand (brand section of the same page) */}
          <Route path="/invite" element={<Navigate to="/refer" replace />} />
          <Route path="/invite/brand" element={<Navigate to="/refer#brand" replace />} />
          <Route path="/code/:code" element={<CreatorCodeLanding />} />

          {/* Brand Dedicated Routes */}
          <Route path="/brand/campaigns" element={<BrandRoute><Layout><Page><BrandCampaigns /></Page></Layout></BrandRoute>} />
          <Route path="/brand/campaigns/create" element={<BrandRoute><Layout><Page><BrandCampaignCreate /></Page></Layout></BrandRoute>} />
          <Route path="/brand/campaigns/:id/applicants" element={<BrandRoute><Layout><Page><BrandCampaignApplicants /></Page></Layout></BrandRoute>} />
          <Route path="/brand/inbox" element={<BrandRoute><Layout><Page><BrandInbox /></Page></Layout></BrandRoute>} />
          <Route path="/brand/inbox/:userId" element={<BrandRoute><Layout><Page><BrandInbox /></Page></Layout></BrandRoute>} />
          <Route path="/brand/notifications" element={<BrandRoute><Layout><Page><BrandNotifications /></Page></Layout></BrandRoute>} />
          <Route path="/creator/inbox" element={<ProtectedRoute><Layout><Page><CreatorInbox /></Page></Layout></ProtectedRoute>} />
          {/* Session 41: UGC "Chat with Brand" opens /creator/inbox/<thread> — this page was missing (404). */}
          <Route path="/creator/inbox/:userId" element={<ProtectedRoute><Layout><Page><CreatorInbox /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/notifications" element={<ProtectedRoute><Layout><Page><CreatorNotifications /></Page></Layout></ProtectedRoute>} />
          <Route path="/brand/payments" element={<BrandRoute><Layout><Page><BrandPayments /></Page></Layout></BrandRoute>} />
          <Route path="/brand/kyc" element={<BrandRoute><Layout><Page><BrandKyc /></Page></Layout></BrandRoute>} />
          
          {/* Compliance and KYC Verification Routes */}
          <Route path="/kyc" element={<ProtectedRoute><Layout><Page><KycRedirect /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/kyc" element={<ProtectedRoute><Layout><Page><CreatorKycMobileAware /></Page></Layout></ProtectedRoute>} />
          <Route path="/kyc/status" element={<ProtectedRoute><Layout><Page><KycStatusMobileAware /></Page></Layout></ProtectedRoute>} />
          
          {/* Brand UGC */}
          <Route path="/brand/ugc/instant" element={<BrandRoute><Layout><Page><BrandInstantUGC /></Page></Layout></BrandRoute>} />
          <Route path="/brand/ugc/briefs" element={<BrandRoute><Layout><Page><BrandInstantUGC /></Page></Layout></BrandRoute>} />
          <Route path="/brand/ugc/post" element={<BrandRoute><Layout><Page><BrandUGCPost /></Page></Layout></BrandRoute>} />
          <Route path="/brand/ugc/orders" element={<BrandRoute><Layout><Page><BrandUGCOrders /></Page></Layout></BrandRoute>} />
          <Route path="/brand/ugc/payments" element={<Navigate to="/brand/payments" replace />} />{/* v445: same money is on Payments */}
          <Route path="/brand/:id" element={<Layout><Page><BrandPublicView /></Page></Layout>} />
          <Route path="/brands/:id" element={<Layout><Page><BrandPublicView /></Page></Layout>} />
          
          {/* Creator UGC & Deals */}
          <Route path="/creator/ugc" element={<ProtectedRoute><Layout><Page><CreatorUGCBrowse /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/ugc/browse" element={<ProtectedRoute><Layout><Page><CreatorUGCBrowse defaultTab="browse" /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/ugc/orders" element={<ProtectedRoute><Layout><Page><CreatorUGCBrowse defaultTab="orders" /></Page></Layout></ProtectedRoute>} />
          <Route path="/creator/ugc/earnings" element={<Navigate to="/earnings" replace />} />{/* v445: same money is on Earnings */}
          <Route path="/creator/deals" element={<ProtectedRoute><Layout><Page><Collabs /></Page></Layout></ProtectedRoute>} />

          <Route path="/ugc" element={<Layout><Page><PublicUGC /></Page></Layout>} />
          <Route path="/leaderboard" element={<Navigate to="/" replace />} />{/* v445: leaderboard removed (no menu link) */}
          <Route path="/notifications" element={<ProtectedRoute><NotificationsEntry /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Layout><Page><Settings /></Page></Layout></ProtectedRoute>} />
          <Route path="/earnings" element={<ProtectedRoute><Layout><Page><Earnings /></Page></Layout></ProtectedRoute>} />
          <Route path="/refer" element={<ProtectedRoute><Layout><Page><Refer /></Page></Layout></ProtectedRoute>} />
          <Route path="/admin/ybx" element={<Navigate to="/admin-login" replace />} />{/* v378: quick PIN entry removed */}
          <Route path="/admin" element={<AdminRoute><Layout><Page><Admin /></Page></Layout></AdminRoute>} />
          {/* v408 (Ravi: "admin pe kabhi 'This page doesn't exist' aata hai"): any /admin/<old-or-typo> link opens the panel */}
          <Route path="/admin/*" element={<AdminSubPathToPanel />} />
          <Route path="/ybx-admin" element={<Page><AdminLogin /></Page>} />
          <Route path="/y-admin" element={<Page><AdminLogin /></Page>} />
          <Route path="/y.admin" element={<Page><AdminLogin /></Page>} />
          <Route path="/admin-login" element={<Page><AdminLogin /></Page>} />
          <Route path="/ugc-orders" element={<Layout><Page><UgcOrders /></Page></Layout>} />
          <Route path="/privacy-policy" element={<Layout><Page><PrivacyPolicy /></Page></Layout>} />
          <Route path="/delete-account" element={<Layout><Page><DeleteAccount /></Page></Layout>} />
          {/* Session 34: short legal addresses (signup used /terms and /privacy, which did not exist) */}
          <Route path="/terms" element={<Navigate to="/info/terms" replace />} />
          <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
          <Route path="/refunds" element={<Navigate to="/info/refunds" replace />} />
          <Route path="/info/:slug" element={<Layout><Page><InfoHub /></Page></Layout>} />
          <Route path="/creator-campaign-flow" element={<Layout><Page><CreatorCampaignFlow /></Page></Layout>} />
          
          {/* Blog & Journal */}
          <Route path="/blog" element={<Layout><Page><BlogIndex /></Page></Layout>} />
          <Route path="/blog/:slug" element={<Layout><Page><BlogPostDetail /></Page></Layout>} />

          {/* Help Center */}
          <Route path="/help" element={<Layout><Page><HelpCenter /></Page></Layout>} />
          <Route path="/help/category/:category" element={<Layout><Page><HelpCategory /></Page></Layout>} />
          <Route path="/help/tickets" element={<Layout><Page><HelpTickets /></Page></Layout>} />
          <Route path="/help/tickets/:ticketId" element={<Layout><Page><HelpTickets /></Page></Layout>} />{/* v425 (T1): a ticket has its own address, so phone Back closes it */}
          <Route path="/support/tickets/:ticketId" element={<Layout><Page><HelpTickets /></Page></Layout>} />

          <Route path="*" element={<Layout><Page><NotFoundPage /></Page></Layout>} />
        </Routes>
      </PageDirectionContext.Provider>
    </Suspense>
  );
}

// Session 35: on a phone, a creator's KYC opens the mobile KYC screen in Profile (same calls as
// desktop CreatorKyc: GET verifications/me, upload?bucket=kyc-documents, creator KYC submit),
// not the desktop page squeezed down. Brands and desktop keep their pages.
function CreatorKycMobileAware() {
  const isMobile = useIsMobile();
  if (isMobile) return <Navigate to="/creator/settings?section=kyc" replace />;
  return <CreatorKyc />;
}
function KycStatusMobileAware() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  if (isMobile && user?.role === "creator") return <Navigate to="/creator/settings?section=kyc" replace />;
  return <KYCStatus />;
}

// Old notification links (/messages/:threadId) open the same chat as /chat/:threadId.
function MessagesRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/chat/${encodeURIComponent(id)}` : "/chat"} replace />;
}

export default function App() {
  const [maintenance, setMaintenance] = React.useState(null);

  // v378 (Ravi: "maintenance mode control karne pe chale"): it was read ONCE when the app opened, so turning it on / off
  // in Admin did nothing for people already in the app. Now: read on open, every 30 s while the page is visible, when
  // the app comes back to the front, and at once when any API answers "under maintenance" (src/lib/api.js event).
  React.useEffect(() => {
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetch(apiUrl('/api/system-status'), { cache: "no-store", credentials: "include" })
        .then(r => r.json())
        .then(d => { if (alive && d && typeof d === "object") setMaintenance(d); })
        .catch(() => {});
    };
    load();
    const iv = setInterval(() => { if (document.visibilityState !== "hidden") load(); }, 120000); // v422 (Supabase egress): was 30 s; an API 503 still flips it at once
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    const onFlag = () => load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("ybex:maintenance", onFlag);
    return () => { alive = false; clearInterval(iv); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("ybex:maintenance", onFlag); };
  }, []);

  return (
    <div className="App">
      {/* Session 37: phones with "reduce motion" on get fades instead of slides, app-wide. */}
      <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <GoogleAnalytics />
        <ThemeProvider>
          <AuthProvider>
            <LoadingProvider>
              <ColdStartSplash />
              <AppLaunchSplash />
              <GlobalLoader />
              <Idle><NotificationPopup /></Idle>
              <OfflineBanner />{/* v333 */}
              <TermsUpdateGate />
              <Idle><PromoPopup /></Idle>
              <Idle><DiwaliEntryScreen /></Idle>
              <Idle><ProfileCompleteCongrats /></Idle>
              <InstallPopup />{/* v378: website visitors on phones — one-tap install (Android) / Share → Add to Home Screen (iPhone) */}
              <Idle><WhatsNewPopup /></Idle>
              <Idle><PushPermissionScreen /></Idle>
              <ReferralClaimer />
              <TabWarmup />
              <StatusBarSync />
              {/* Session 43 (Ravi): the "Optimized for Desktop Experience" popup is gone — the app is built for phones now. */}
              <MaintenanceWrapper maintenance={maintenance}>
                <AnimatedRoutes />
              </MaintenanceWrapper>
      <Toaster position="top-right" theme="light" richColors />
      <SupportModeBanner />{/* v429: admin inside a user account */}
            </LoadingProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      </MotionConfig>
    </div>
  );
}

// Session 42 (Ravi: "tapping Chats / Campaigns loads again like a website"). Once the home screen is
// up, the phone quietly downloads the pages behind the bottom tabs, so a tap opens them at once.
// Only files are fetched here — no data, no server calls.
function TabWarmup() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  React.useEffect(() => {
    if (!user?.user_id || !isMobile) return undefined;
    const isCreator = user.role === "creator";
    const pages = isCreator
      ? [() => import("./pages/creator/CreatorInbox"), () => import("./pages/campaigns/Campaigns"), () => import("./pages/creator/CreatorUGCBrowse"), () => import("./pages/creator/CreatorProfile")]
      : [() => import("./pages/brand/BrandInbox"), () => import("./pages/brand/BrandCampaigns"), () => import("./pages/dashboard/Explore"), () => import("./pages/brand/BrandProfile")];
    // v426: not while Home is loading or a popup is opening (that is when the phone is busiest) — wait for
    // Home's data, then for no popup on screen (checked each second, at most ~20 s).
    let t; let alive = true; let tries = 0;
    const go = () => {
      if (!alive) return;
      if (anyPopupOnScreen() && ++tries < 20) { t = setTimeout(go, 1000); return; }
      pages.forEach((load, i) => setTimeout(() => alive && load().catch(() => {}), i * 400));
    };
    waitForHomeReady(6000).then(() => { if (alive) t = setTimeout(go, 1500); });
    return () => { alive = false; clearTimeout(t); };
  }, [user?.user_id, user?.role, isMobile]);
  return null;
}

function MaintenanceWrapper({ children, maintenance }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // v421: server switch FORCE_MAINTENANCE (database down / blocked) — the page for everyone, signed in or not,
  // on every screen except the blog and admin (login can't work while the database is unreachable anyway).
  if (maintenance?.forced && !location.pathname.startsWith('/admin') && !location.pathname.startsWith('/blog')) {
    const fside = isBrandLike(user?.role) ? 'brand' : 'creator';
    return <YbexDownPage mode="maintenance" side={fside} back={maintenanceBackText(maintenance, fside)} />;
  }
  if (loading) return children;

  const publicRoutes = ['/', '/login', '/signup', '/register', '/onboarding', '/forgot-password', '/reset-password', '/blog'];
  if (publicRoutes.includes(location.pathname) || location.pathname.startsWith('/blog') || location.pathname.startsWith('/admin') || !user || user.role === 'admin') {
     return children;
  }

  const side = isBrandLike(user.role) ? 'brand' : 'creator'; // v423: agency / talent manager follow brand maintenance
  const on = side === 'brand' ? maintenance?.maintenance_mode_brand : maintenance?.maintenance_mode_creator;
  if (!on) return children;
  // v378 (Ravi's "Ybex Offline Page" design + "auto-off set hai toh wo time, warna ek ghante ka, ya manually off"):
  // "Back by <auto-off time>" when Admin set one; otherwise about an hour from when it was switched on; once that has
  // passed (still on, switched off by hand later) "Back in some time".
  return <YbexDownPage mode="maintenance" side={side} back={maintenanceBackText(maintenance, side)} />;
}

/** v378: the "Back …" line of the maintenance page. Pure. */
export function maintenanceBackText(m, side, now = Date.now()) {
  const fmt = (t) => new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).toUpperCase() + " IST";
  const until = Date.parse(String((side === "brand" ? m?.brand_until : m?.creator_until) || ""));
  if (Number.isFinite(until) && until > now) return `by ${fmt(until)}`;
  const since = Date.parse(String(m?.enabled_at || ""));
  if (Number.isFinite(since) && since + 3600000 > now) return `by ${fmt(since + 3600000)}`;
  return "in some time";
}
