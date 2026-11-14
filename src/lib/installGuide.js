// Session 42 (Ravi: "on iPhone Chrome there is no install option, it says open in Safari").
// iPhone has no install button any website can press. Since iOS 16.4 every browser can add a site
// to the Home Screen from its Share menu — Safari, Chrome, Edge, Firefox — but the Share button sits
// in a different place in each. This file works out which browser this is and which steps to show.

export function detectPlatform(ua = (typeof navigator !== "undefined" ? navigator.userAgent : "") || "", maxTouch = (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0) || 0) {
  const s = String(ua);
  const ipadOS = /Macintosh/.test(s) && maxTouch > 1; // iPad asking for the desktop site
  const ios = /iPhone|iPad|iPod/i.test(s) || ipadOS;
  const android = /Android/i.test(s);
  let browser = "other";
  // Session 43 (Ravi: ads inside "Ybex" on a Samsung phone): an Android WebView ("; wv)") is some
  // other app showing the site — it adds its own ads and can't install apps. Treated like an in-app browser.
  if (/Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|LinkedInApp|Twitter|WhatsApp/i.test(s) || (android && /; wv\)/.test(s))) browser = "inapp";
  else if (/CriOS/i.test(s)) browser = "chrome";
  else if (/FxiOS/i.test(s)) browser = "firefox";
  else if (/EdgiOS|EdgA/i.test(s)) browser = "edge";
  else if (/SamsungBrowser/i.test(s)) browser = "samsung";
  else if (ios && /Safari/i.test(s) && !/CriOS|FxiOS|EdgiOS/i.test(s)) browser = "safari";
  else if (android && /Chrome/i.test(s)) browser = "chrome";
  const m = s.match(/OS (\d+)[_.](\d+)/);
  const iosVersion = m ? Number(m[1]) + Number(m[2]) / 100 : null;
  return { ios, android, browser, iosVersion, desktop: !ios && !android };
}

/**
 * Steps for this phone. kind:
 *   "steps"  — follow these taps here
 *   "switch" — this browser cannot add to Home Screen: open the link in Safari / Chrome first
 */
export function installSteps({ ios, android, browser, iosVersion }) {
  if (browser === "inapp") {
    return {
      kind: "switch",
      title: "Open Ybex in your browser first",
      lines: [
        "This app's built-in browser can't install apps.",
        ios ? "Tap ••• (top right) and choose \"Open in Safari\" or \"Open in Chrome\" — or copy the link below and paste it there." : "Tap ⋮ (top right) and choose \"Open in Chrome\" — or copy the link below and paste it there.",
      ],
    };
  }
  if (ios) {
    const oldIos = iosVersion !== null && iosVersion < 16.4;
    if (browser !== "safari" && oldIos) {
      return {
        kind: "switch",
        title: "Open Ybex in Safari",
        lines: ["On this iOS version only Safari can add apps to the Home Screen.", "Copy the link below, open Safari and paste it."],
      };
    }
    if (browser === "chrome") {
      return {
        kind: "steps",
        title: "Install Ybex from Chrome",
        steps: [
          "Tap the Share icon in the address bar (top right, a square with an arrow).",
          "Tap \"Add to Home Screen\". Don't see it? Tap \"More\" or scroll the list.",
          "Tap \"Add\". Ybex now opens from your Home Screen like an app.",
        ],
      };
    }
    if (browser === "firefox" || browser === "edge") {
      return {
        kind: "steps",
        title: `Install Ybex from ${browser === "edge" ? "Edge" : "Firefox"}`,
        steps: [
          "Tap the menu (☰ or •••) at the bottom, then tap Share.",
          "Tap \"Add to Home Screen\".",
          "Tap \"Add\".",
        ],
      };
    }
    return {
      kind: "steps",
      title: "Install Ybex on iPhone",
      steps: [
        "Tap the Share button (a square with an arrow) in Safari's toolbar. On newer iPhones it may be inside the ••• menu.",
        "Scroll down and tap \"Add to Home Screen\".",
        "Tap \"Add\". Ybex now opens from your Home Screen like an app.",
      ],
    };
  }
  if (android) {
    return {
      kind: "steps",
      title: "Install Ybex",
      steps: [
        browser === "samsung" ? "Tap the menu (☰) at the bottom." : "Tap the menu (⋮) at the top right.",
        "Tap \"Install app\" or \"Add to Home screen\".",
        "Tap \"Install\". Ybex opens from your Home Screen like an app.",
      ],
    };
  }
  return { kind: "qr", title: "Get Ybex on your phone", lines: ["Scan this with your phone's camera, then tap Install."] };
}
