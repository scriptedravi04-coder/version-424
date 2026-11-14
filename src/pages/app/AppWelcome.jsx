import React, { useEffect } from "react";
import PlayStoreBanner from "../../components/common/PlayStoreBanner"; // v418
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { postLoginPath } from "../auth/Login";
import { captureRefFromUrl } from "../../lib/referralCapture";
import AppLoginScreen from "../../components/app/AppLoginScreen";
import useDemoLogin from "../../lib/useDemoLogin";

// Session 42 (Ravi): what the installed app shows when nobody is logged in. Logged in → straight to
// the dashboard. The website landing page is never shown inside the app.
// Session 43 (v282): the screen is Ravi's Claude Design "Ybex Login" (AppLoginScreen). The email
// screen ships in the main bundle (App.jsx), so tapping a card no longer flashes a blank page.
export default function AppWelcome() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const demoOn = useDemoLogin();

  useEffect(() => { try { captureRefFromUrl(); } catch { /* no referral in the link */ } }, []);

  useEffect(() => {
    if (!loading && user) navigate(postLoginPath(user), { replace: true });
  }, [user, loading, navigate]);

  if (loading || user) return <div className="min-h-[100dvh] bg-[#F2F1F7]" aria-busy="true" />;

  return (
    <div data-testid="app-welcome" style={{ background: "#F2F1F7", minHeight: "100dvh" }}>
      <PlayStoreBanner page="signup" />{/* v418: Android browsers get the Play Store app first */}
      <AppLoginScreen
        footer={demoOn ? (
          <div className="text-center">
            <Link to="/login?demo=1" className="text-[12.5px] font-semibold text-[#7C3AED] underline underline-offset-2" data-testid="app-demo-link">
              Demo access (test server)
            </Link>
          </div>
        ) : null}
      />
    </div>
  );
}
