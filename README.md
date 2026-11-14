# Ybex Media - Campaign Management Platform

Ybex Media is a comprehensive platform connecting brands with creators. It handles campaigns, negotiations, chat, escrow payments, and UGC content management.

## Tech Stack
- **Frontend**: React (Vite), Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, Socket.io
- **Database**: Supabase (PostgreSQL)
- **Payments**: Razorpay Escrow
- **Email**: Resend

## Setup Instructions

1. **Clone and Install**
   ```bash
   git clone <repo-url>
   npm install
   ```

2. **Environment Setup**
   Copy `.env.example` to `.env` and fill in the required keys.
   ```bash
   cp .env.example .env
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

## Key Commands
- `npm run dev`: Start both Vite dev server and Express backend (port 3000)
- `npm run build`: Compile frontend to static files and bundle backend
- `npm start`: Start the production server from `dist/server.cjs` (run `npm run build` first). Cloud Run / AI Studio deploy uses this.

## Folder Structure
- `/src` — website / app screens (React)
- `/backend` — server (Express, Supabase, Socket.io)
- `/ios-app` — iPhone App Store app (Capacitor) — steps in `ios-app/README.md`
- `/android-overrides` — Android (Play) launch-screen files for the Bubblewrap build
- `/cloudflare` — Worker that connects ybexmedia.in (see `docs/setup/DOMAIN_CLOUDFLARE.md`)
- `/scripts` — build helpers, protected-files check, SQL migrations (`scripts/sql`)
- `/public` — icons, images, fonts, `.well-known`
- `/docs` — all notes and guides (index: `docs/README.md`)
- `AGENTS.md` / `GEMINI.md` — rules for AI coding agents (stay in the root)
- `/dist` — production build output (not in the zip)
