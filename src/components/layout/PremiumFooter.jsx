import React from "react";
import {  } from "lucide-react";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

export default function PremiumFooter({ headline, subtitle, showInstagram, clearBottomBar = false }) {
  return (
    <>
      {/* Session 58 (Ravi: "ye line footer ke upar batwara bana rahi hai, bekar hai"): no divider line on top. */}
      {/* Session 41 (Ravi: "footers sare rakhne hain"): back on phones too. Chat / inbox never get
          one (no-footer list in Layout). On a page with its own fixed bottom bar (campaign Apply bar)
          `clearBottomBar` leaves room under the footer so the bar never covers it. */}
      {/* v360 (Ravi: "purane footers mein bahut khaali space"): phone spacing tightened — was 64px above + 40px below
          + a padded Instagram row; the page under the footer already leaves room for the bottom bar. */}
      <footer className={`w-full mt-2 md:mt-12 bg-transparent pt-5 md:pt-12 px-5 md:px-6 ${clearBottomBar ? "pb-[150px] md:pb-10" : "pb-3 md:pb-10"}`} data-testid="premium-footer">
        <div className="max-w-none">
          {/* Big Headline */}
          <div className="mb-2 md:mb-3 w-full relative">
            {headline && headline.map((line, index) => (
              <h2 
                key={index} 
                className="text-[28px] sm:text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] opacity-15 leading-[1.08]"
              >
                {line}
              </h2>
            ))}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <p className={`text-sm md:text-base font-semibold text-[var(--text-tertiary)] max-w-xl ${showInstagram ? "mb-2 md:mb-8" : "mb-0 md:mb-8"}`}>
              {subtitle}
            </p>
          )}

          {/* Bottom Row */}
          {showInstagram && (
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-0 md:pt-6 md:border-t border-[var(--border-default)]">
              <div className="flex flex-wrap items-center gap-4">
                <a 
                  href="https://instagram.com/ybex.in" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--violet)] transition-colors -ml-3 md:ml-0 px-3 py-2 rounded-lg hover:bg-[var(--violet)]/10"
                >
                  <SocialLogo platform="instagram" size={16} /> @ybex.in
                </a>
              </div>
            </div>
          )}
        </div>
      </footer>
    </>
  );
}
