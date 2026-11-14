import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// v376: the website build reads VITE_* (and the Supabase address) from the one YBEX_ENV secret too — only names not
// set on their own (same rule as backend/envBundle.ts). Values are never printed.
(function applyYbexEnvForBuild() {
  try {
    for (const raw of String(process.env.YBEX_ENV || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
      if (v !== '' && (process.env[m[1]] === undefined || process.env[m[1]] === '')) process.env[m[1]] = v;
    }
  } catch { /* build continues with the separate settings */ }
})();

function sanitizeSupabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const match = rawUrl.trim().match(/^(https?:\/\/[a-zA-Z0-9-]+\.supabase\.co)/i);
  return match ? match[1] : rawUrl.trim();
}

if (process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = sanitizeSupabaseUrl(process.env.VITE_SUPABASE_URL);
}
if (process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = sanitizeSupabaseUrl(process.env.SUPABASE_URL);
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Session 58: 'prompt' — the new version waits until the user taps "Refresh" or leaves the app (autoUpdate reloaded
      // the page by itself 5–30 s after opening: an OTP being typed, a form or the payment window was wiped).
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
      // Session 41: the manifest is public/manifest.json (linked in index.html, served by server.ts).
      // A second generated manifest.webmanifest would give the browser two different manifests.
      manifest: false,
      workbox: {
        // Session 41: push notification handlers (public/push-sw.js).
        importScripts: ['/push-sw.js'],
        // Never answer API / socket / file links with the cached app page: an "Open" link to
        // /api/media (KYC PDF) must reach the server, not index.html.
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io/, /^\/\.well-known\//, /^\/uploads\//,
          // v334: landing photos / sitemap / robots are files, never the app page.
          /^\/landing\//, /^\/sitemap/, /^\/robots\.txt$/],
        // v334 (offline app): every page link opened with no internet gets the saved app page, which then opens the
        // screen from the saved files — the app boots fully offline on iPhone and Android.
        navigateFallback: 'index.html',
        // v334: login-screen pictures (.webp / .jpg) and font files are part of the offline download too.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff,woff2,ttf,otf}'],
        // v334: Workbox skips any file over 2 MB by default — a big screen chunk (charts, editor) was then missing
        // offline. 6 MB keeps every route chunk in the offline download.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // v334: old versions' saved files are removed once the new version takes over (the new version still waits
        // for "Refresh" — registerType 'prompt', no skipWaiting / clientsClaim here on purpose, session 58).
        cleanupOutdatedCaches: true,
        // Session 43: iPhone launch images are read by iOS only when the app is added — keep them out
        // of the offline download so the service worker is ready sooner.
        // v333: the landing page's photos / fonts (public/landing, ~6 MB) are not part of the app's offline
        // download — they are cached the first time the landing page is opened (runtimeCaching below).
        // v378 (QA L4: ~11 MB precached on every phone incl. the 1.3 MB Admin screens): admin screens are not part of
        // the offline download (only staff open them); they are cached the first time they are opened.
        globIgnores: ['splash/**', 'landing/**'],
        manifestTransforms: [async (entries) => ({ manifest: entries.filter((e) => !/(^|\/)assets\/[^/]*(admin|jspdf|html2canvas|purify)[^/]*\.js$/i.test(e.url)), warnings: [] })],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /^\/assets\/[^/]*(admin|jspdf|html2canvas|purify)[^/]*\.js$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'ybex-admin-screens', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/landing/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ybex-landing-assets', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all',
    hmr: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    entries: [
      'index.html',
      'src/**/*.{js,jsx,ts,tsx}',
    ],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      'framer-motion',
      'lucide-react',
      'sonner',
      'axios',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'date-fns',
      'recharts',
      'driver.js',
      'canvas-confetti',
      'qrcode.react',
      '@radix-ui/react-popover',
      '@radix-ui/react-slot',
      'react-day-picker',
      'zustand',
      'marked',
      'papaparse',
      'jspdf',
      'socket.io-client',
      '@supabase/supabase-js',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-image',
      '@tiptap/extension-link',
      '@tiptap/extension-placeholder',
      'd3',
    ],
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: false,
  },
});
