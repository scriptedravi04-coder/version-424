import React from "react";
import { Link, useLocation } from "react-router-dom";
import { HeroCarousel } from "./AppLoginScreen";

// v372 (Ravi: "web app ko app jaisa kaha tha, desktop ko nahi — desktop ke liye design karo"; his canvas
// "Ybex Desktop Sign-in"): on a computer (≥1024px) the sign-in is a desktop page — the site's top bar, the app's
// purple carousel on the left (same 4 slides, auto-sliding), and the same sign-in screens in a white card on the
// right. On a phone nothing changes (children render as they are); 768–1023px keeps the phone-sized card.
// One copy of the children only: the layout around them is CSS, so no screen is mounted twice.

const CSS = `
@media (min-width:768px){
  .yb-auth-card [class*='min-h-[100dvh]'],.yb-auth-card [data-testid='app-welcome'],.yb-auth-card .yb-al{min-height:100%!important}
}
@media (min-width:1024px){
  .yb-auth-card [data-testid='landing-mobile-hero']{display:none!important}
  .yb-auth-card .yb-al,.yb-auth-card [data-testid='app-welcome'],.yb-auth-card .bg-\\[\\#F2F2F7\\],.yb-auth-card .yb-al > div{background:transparent!important}
  .yb-auth-card .yb-al > div[style*='position: fixed']{display:none!important}
  .yb-auth-card .yb-al{justify-content:center}
  .yb-auth-card .yb-al > div:last-of-type{flex:0 0 auto!important;justify-content:center!important;padding:0!important;opacity:1!important;transform:none!important}
  .yb-auth-card .yb-al > div:last-of-type > div:last-child{display:none!important}
}
`;

const NAV = [["Live Campaigns", "/campaigns"], ["Explore Creators", "/creators"], ["UGC Orders", "/ugc-orders"]];

export default function DesktopAuthFrame({ children }) {
  const { pathname } = useLocation();
  const welcome = pathname === "/app" || pathname === "/app/";
  const creatorSide = /\/creator\b/.test(pathname);
  return (
    <div className="md:min-h-[100dvh] md:flex md:flex-col md:bg-[radial-gradient(120%_80%_at_50%_0%,#EDE4FF_0%,#F2F1F7_60%)] lg:bg-[#F2F1F7] lg:h-[100dvh] lg:p-5 lg:pb-6 lg:gap-5" style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="desktop-auth-frame">
      <style>{CSS}</style>
      <header className="hidden lg:flex items-center h-16 shrink-0 rounded-[22px] bg-white border border-[#ECEAF1] pl-7 pr-3 gap-8">
        <Link to="/" className="text-[26px] font-extrabold tracking-[-1px] text-[#0A0A0A] no-underline">Ybex</Link>
        <nav className="flex-1 flex justify-center gap-7" aria-label="Main">
          {NAV.map(([l, to]) => <Link key={to} to={to} className="text-[14px] font-semibold text-[#4B5563] hover:text-[#0A0A0A] no-underline">{l}</Link>)}
        </nav>
        <Link to="/app" className="text-[14px] font-semibold text-[#0A0A0A] no-underline">Sign in</Link>
        <Link to="/app/continue/brand" className="h-11 px-[22px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[14px] font-bold flex items-center no-underline">Get Ybex</Link>
      </header>

      <main className="md:flex-1 md:flex md:items-center md:justify-center md:py-6 lg:py-0 lg:items-stretch lg:gap-6 lg:min-h-0">
        <section aria-label="What Ybex does" className="hidden lg:flex flex-col relative overflow-hidden shrink-0 w-[clamp(440px,42vw,600px)] rounded-[32px] text-white"
          style={{ background: "linear-gradient(165deg,#9B00FF 0%,#6D1FD8 48%,#2E0066 100%)" }} data-testid="desktop-auth-hero">
          <div aria-hidden="true" className="absolute -right-[140px] -top-[140px] w-[380px] h-[380px] rounded-full bg-white/[0.07]" />
          <div aria-hidden="true" className="absolute -left-[100px] -bottom-[160px] w-[360px] h-[360px] rounded-full bg-white/[0.05]" />
          <div className="relative flex-1 flex flex-col justify-center">
            {/* the phone slides, 1.3× — same carousel, same timing */}
            <div className="relative mx-auto w-[340px] pb-[46px]" style={{ zoom: 1.3 }}>
              <HeroCarousel go startAt={creatorSide ? 0 : 1} />
            </div>
          </div>
          <div className="relative flex flex-wrap gap-x-[22px] gap-y-2 px-14 pb-10 text-[13.5px] font-semibold text-[#F3EDFF]">
            <span className="flex items-center gap-2"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>Secure payment hold</span>
            <span className="flex items-center gap-2"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 14h8M8 17h5" /></svg>Legal contracts</span>
            <span className="flex items-center gap-2"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>Verified creators</span>
          </div>
        </section>

        <div className="yb-auth-card yb-phone-frame md:w-[440px] md:h-[min(920px,94dvh)] md:overflow-y-auto md:rounded-[32px] md:shadow-[0_30px_80px_-30px_rgba(76,29,149,0.45)] md:border md:border-white md:[transform:translateZ(0)] bg-[#F2F1F7]
          lg:w-auto lg:flex-1 lg:h-auto lg:min-h-0 lg:bg-white lg:border-[#ECEAF1] lg:shadow-none" data-testid="phone-frame">
          <div className="lg:min-h-full lg:flex lg:flex-col lg:justify-center lg:py-8">
            {welcome && (
              <div className="hidden lg:block w-full max-w-[560px] mx-auto px-6">
                <div className="text-[12px] font-bold tracking-[1.4px] text-[#7C3AED]">WELCOME TO YBEX</div>
                <h1 className="mt-2.5 text-[36px] leading-[1.15] font-extrabold tracking-[-1px] text-[#0A0A0A]">How will you use Ybex?</h1>
                <p className="mt-2.5 mb-6 text-[16px] leading-normal text-[#6B7280]">Pick one. You can log in or make a new account on the next step.</p>
              </div>
            )}
            <div className={`w-full mx-auto ${welcome ? "lg:max-w-[560px]" : "lg:max-w-[480px]"}`}>{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
