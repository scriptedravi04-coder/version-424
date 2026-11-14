import { useEffect, useState } from 'react';

// Session 41 — "Install app". Android Chrome gives us a beforeinstallprompt event (caught early in
// index.jsx and kept on window.__ybexInstallPrompt). iPhone Safari never does: Apple only allows
// Share → Add to Home Screen, so on iOS we show a short guide instead.
//
// Session 55 (Ravi: "Install the app par click karta hun toh app hang kar jata hai"):
// - The install popup event can be used ONCE. The landing page had two buttons (hero + bottom bar),
//   each with its own copy of the event; after the first use the second copy was stale and
//   `prompt()` threw or never answered, so the tap did nothing / froze. Now every button reads the one
//   shared event from window, and a used event is dropped everywhere at once.
// - `install()` never waits forever: if Chrome doesn't answer in 8 seconds we stop waiting.
// - It now returns "accepted" | "dismissed" | "failed" (truthy only for "accepted" checks below), so
//   the caller can open the step-by-step guide when the popup could not be shown.
const USED = 'ybex-install-used';
const TIMEOUT_MS = 8000;

const current = () => (typeof window !== 'undefined' ? window.__ybexInstallPrompt || null : null);
const dropPrompt = () => {
  if (typeof window === 'undefined') return;
  window.__ybexInstallPrompt = null;
  try { window.dispatchEvent(new Event(USED)); } catch { /* old browsers */ }
};
const withTimeout = (p) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('install prompt timeout')), TIMEOUT_MS);
  Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

let busy = false;

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(current);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
    setIsInstalled(Boolean(isStandalone));
    setIsIOS(/iphone|ipad|ipod/.test((navigator.userAgent || '').toLowerCase()));

    const sync = () => setDeferredPrompt(current());
    const onPrompt = (e) => { e.preventDefault(); window.__ybexInstallPrompt = e; setDeferredPrompt(e); };
    const onInstalled = () => { setIsInstalled(true); dropPrompt(); setDeferredPrompt(null); };

    window.addEventListener('ybex-install-ready', sync);
    window.addEventListener(USED, sync);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('ybex-install-ready', sync);
      window.removeEventListener(USED, sync);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  /** @returns {Promise<"accepted"|"dismissed"|"failed">} */
  const install = async () => {
    const ev = current();          // always the shared, fresh event — never a stale copy
    if (!ev || busy) return 'failed';
    busy = true;
    dropPrompt();                  // one use only: no other button can reuse it
    setDeferredPrompt(null);
    try {
      await withTimeout(ev.prompt());
      const choice = await withTimeout(ev.userChoice);
      if (choice?.outcome === 'accepted') { setIsInstalled(true); return 'accepted'; }
      return 'dismissed';
    } catch (err) {
      console.warn('Install prompt error:', err);
      return 'failed';
    } finally {
      busy = false;
    }
  };

  return { isInstallable: Boolean(deferredPrompt), isInstalled, isIOS, install };
}
