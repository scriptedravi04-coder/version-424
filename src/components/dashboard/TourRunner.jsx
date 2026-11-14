
import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export function blockingModalOpen(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false;
  // v415: also promo posters / quick-action sheets ([data-popup-open]) and the open Eva panel on desktop.
  // v416 (M2): the notifications drawer and the phone menu drawer have no dialog role — their close buttons only exist while open.
  return Array.from(doc.querySelectorAll('[role="dialog"][aria-modal="true"],[data-popup-open="true"],[data-testid="feedback-chat"][data-desktop],button[aria-label="Close notifications"],button[aria-label="Close menu"]'))
    .some((el) => !el.closest('.driver-popover') && !(el.getAttribute('data-testid') === 'feedback-chat' && evaPanelHidden(el)));
}
// v415: the desktop Eva panel stays mounted while closed — it only blocks when it is actually visible.
function evaPanelHidden(el) {
  try {
    const cs = window.getComputedStyle(el);
    return cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none';
  } catch { return false; }
}

/** v416 (M2): accounts older than 7 days have used the app before — the tour is for new accounts. */
export function isEstablishedAccount(user, now = Date.now()) {
  const t = user?.created_at ? new Date(user.created_at).getTime() : NaN;
  return Number.isFinite(t) && now - t > 7 * 24 * 60 * 60 * 1000;
}
// v416 (M2): the tour's × was a 12px target — 40px, readable.
function ensureTourStyles() {
  if (typeof document === 'undefined' || document.getElementById('ybex-tour-style')) return;
  const el = document.createElement('style');
  el.id = 'ybex-tour-style';
  el.textContent = '.ybex-tour-theme .driver-popover-close-btn{width:40px;height:40px;font-size:22px;line-height:1;top:2px;right:2px;display:flex;align-items:center;justify-content:center;color:#4b5563}';
  document.head.appendChild(el);
}

/** v415: the dashboard has finished loading (no skeleton) — the tour starts only then. */
export function dashboardReady(isCreator, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false;
  const root = doc.querySelector(isCreator ? '[data-testid="creator-dashboard"], #tour-profile-header' : '[data-testid="brand-dashboard"]');
  return Boolean(root) && !doc.querySelector('[data-dashboard-loading="true"]');
}

export default function TourRunner({ user }) {
  const isCreator = user?.role === 'creator';
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;

    const tourKey = `has_seen_tour_${user?.user_id}`;
    if (localStorage.getItem(tourKey)) {
      return;
    }
    // v416 (M2): an existing account on a new browser doesn't get the welcome tour again.
    if (isEstablishedAccount(user)) {
      try { localStorage.setItem(tourKey, 'true'); } catch { /* private mode */ }
      return;
    }
    ensureTourStyles();

    // Small delay to let the dashboard render
    let timer;
    const start = () => {
      hasRun.current = true;

      const stepsCreator = [
        {
          element: '#tour-profile-header',
          popover: {
            title: 'Welcome to Ybex! 👋',
            description: 'This is your dashboard. Start by ensuring your profile is complete to attract premium brands.',
            side: "bottom", align: 'start'
          }
        },
        {
          element: '#tour-stats',
          popover: {
            title: 'Track Performance 📈',
            description: 'Monitor your profile views, brand interest, and total earnings in real-time.',
            side: "bottom", align: 'start'
          }
        },
        {
          element: '[data-testid="tour-nav-campaigns"]',
          popover: {
            title: 'Live Campaigns 🌍',
            description: 'Browse and apply to all live campaigns across the platform here.',
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="tour-nav-ugc"]',
          popover: {
            title: 'Explore Instant UGC ⚡',
            description: 'Find quick, pre-funded UGC tasks to complete without needing to negotiate.',
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="tour-nav-deals"]',
          popover: {
            title: 'Manage Ongoing Deals 💼',
            description: 'Track your active applications, current deliverables, and deadlines.',
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="tour-nav-inbox"]',
          popover: {
            title: 'Inbox & Chat 💬',
            description: 'Communicate directly with brand partners regarding briefs and edits.',
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="tour-nav-earnings"]',
          popover: {
            title: 'Track Earnings 💰',
            description: 'View your completed payouts, upcoming secure payment hold releases, and manage bank details.',
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="tour-nav-settings"]',
          popover: {
            title: 'Settings ⚙️',
            description: 'Manage your account preferences, notifications, and profile details.',
            side: "right", align: 'center'
          }
        }
      ];

      const stepsBrand = [
        {
          element: '#tour-profile-header',
          popover: {
            title: 'Welcome to Ybex! 👋',
            description: 'This is your brand dashboard. Manage your campaigns and creator partnerships from here.', // v416
            side: "bottom", align: 'start'
          }
        },
        {
          element: '#tour-brand-tasks',
          popover: {
            title: 'Important Actions ⚡',
            description: 'Complete these quick tasks to launch and manage your campaigns effectively.',
            side: "bottom", align: 'start'
          }
        },
        {
          element: '[data-testid="nav-explore-creators"]',
          popover: {
            title: 'Find Creators 🔍',
            description: 'Search verified creators by niche, city and reach, and invite them directly.',
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="nav-campaigns"]',
          popover: {
            title: 'Manage Campaigns 📊',
            description: 'Create new campaigns, review creator applications, and track active deliverables.',
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="tour-nav-brand-inbox"]',
          popover: {
            title: 'Inbox & Chat 💬',
            description: 'Message creators directly, negotiate terms, and provide feedback on drafts.',
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="tour-nav-escrow"]',
          popover: {
            title: 'Payments 🛡️',
            description: 'See what you have paid, what is held for live deals, and approve creator payouts.', // v415: plain English
            side: "right", align: 'center'
          }
        },
        {
          element: '[data-testid="tour-nav-settings"]',
          popover: {
            title: 'Settings ⚙️',
            description: 'Update your company details, verify your brand and manage your login.', // v416: no features that don't exist
            side: "right", align: 'center'
          }
        }
      ];

      const steps = isCreator ? stepsCreator : stepsBrand;
      const validSteps = steps.filter(step => document.querySelector(step.element));

      if (validSteps.length > 0) {
        const driverObj = driver({
          showProgress: true,
          nextBtnText: 'Next',
          prevBtnText: 'Prev',
          doneBtnText: 'Done',
          progressText: '{{current}} of {{total}}',
          popoverClass: 'ybex-tour-theme',
          steps: validSteps,
          onDestroyStarted: () => {
             localStorage.setItem(tourKey, 'true');
             driverObj.destroy();
          }
        });
        driverObj.drive();
      }

    };
    // v403: wait while another modal (terms gate, push ask, Diwali screen, popups) is open,
    // so the tour no longer sits on top of the "We've updated our Terms" sheet.
    // v415 (brand QA: the dark tour overlay came up over the loading skeletons): also wait until the dashboard has
    // loaded, then a short beat for its fade-in. Gives up after ~45 s (slow network) and tries on the next visit.
    let tries = 0;
    const tick = () => {
      tries += 1;
      if (tries > 30) return;
      if (blockingModalOpen() || !dashboardReady(isCreator)) { timer = setTimeout(tick, 1500); return; }
      // v416 (M2): a brand that already has campaigns knows the dashboard — no tour.
      if (!isCreator && document.querySelector('[data-testid="brand-dashboard"][data-has-campaigns="true"]')) {
        try { localStorage.setItem(tourKey, 'true'); } catch { /* private mode */ }
        return;
      }
      timer = setTimeout(() => { if (blockingModalOpen() || !dashboardReady(isCreator)) { timer = setTimeout(tick, 1500); return; } start(); }, 900);
    };
    timer = setTimeout(tick, 2000);

    return () => clearTimeout(timer);
  }, [user, isCreator]);

  return null;
}
