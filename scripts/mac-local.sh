#!/bin/bash
# v372 (Ravi: "deploy karke test karne mein 1 ghanta lagta hai — Mac pe local chala ke dekhna hai, ya iPhone cable se").
# Runs the whole app (server + screens) on the Mac in ~1 minute. No deploy, no build.
#
#   cd <project folder> && bash scripts/mac-local.sh
#
# Then:  Mac browser → http://localhost:3000
#        iPhone (same Wi-Fi) Safari → http://<Mac IP>:3000   (the IP is printed below)
#        iPhone app over cable → second Terminal tab: bash scripts/ios-local.sh
#
# Code change → just refresh the page (Cmd+R / pull to refresh). Stop with Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")/.."
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m!\033[0m %s\n" "$1"; }
die()  { printf "\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

PORT="${PORT:-3000}"

# 1. Node
command -v node >/dev/null || die "Node nahi mila. https://nodejs.org se Node 20+ (LTS) install karo, phir dobara chalao."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node $NODE_MAJOR purana hai — Node 20+ chahiye (https://nodejs.org)."
ok "Node $(node -v)"

# 2. Packages (first time only, ~2 min)
if [[ ! -d node_modules || package.json -nt node_modules ]]; then
  npm ci || npm install
  touch node_modules
fi
ok "packages"

# 3. Keys (.env) — first time only
# v377: the same YBEX_ENV text used on hosting works here too — save it in this folder as YBEX_ENV.txt.
if [[ ! -f .env ]]; then
  for f in YBEX_ENV.txt YBEX_ENV_filled.txt YBEX_ENV.txt.txt; do
    if [[ -f "$f" ]]; then cp "$f" .env; ok ".env bana di ($f se)"; break; fi
  done
fi
if [[ ! -f .env ]]; then
  cp local.env .env      # Supabase address + public key + local secrets already filled
  warn ".env bana di (local.env se). Bas 1 key paste karo: SUPABASE_SERVICE_ROLE_KEY"
  echo "   Cloud Run → ybex service → Edit & deploy new revision → Variables & Secrets se copy karo."
  echo "   (Eva / email / payments / Instagram ke keys bhi wahi se — optional.) Save karke ye script dobara chalao."
  open -e .env 2>/dev/null || true
  exit 0
fi
grep -Eq '^SUPABASE_SERVICE_ROLE_KEY="?[A-Za-z0-9._-]{20,}' .env || die ".env mein SUPABASE_SERVICE_ROLE_KEY khali hai — paste karke dobara chalao (open -e .env)."
ok ".env keys"

# 4. Mac's Wi-Fi address (for the iPhone)
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")"
[[ -n "$IP" ]] || warn "Wi-Fi IP nahi mila — iPhone se kholne ke liye Mac Wi-Fi pe hona chahiye."

# Local run = development mode: screens served live from src/ (no build), OTP code shown on screen,
# Razorpay in test mode. These win over whatever .env says.
export NODE_ENV=development
export PORT
export OTP_ECHO=""
export PAYMENTS_TEST_MODE=true
export DEMO_LOGIN="${DEMO_LOGIN:-true}"
export RESEND_ALLOW_FALLBACK=true
SB_URL="$(grep -E '^SUPABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
SB_ANON="$(grep -E '^SUPABASE_ANON_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"')"
export VITE_SUPABASE_URL="${SB_URL}"
export VITE_SUPABASE_ANON_KEY="${SB_ANON}"
# v377: a copy of the LIVE YBEX_ENV must not take real payments or point links at ybexmedia.in from the Mac.
if grep -Eq '^RAZORPAY_KEY_ID="?rzp_live_' .env; then
  export RAZORPAY_KEY_ID="" RAZORPAY_KEY_SECRET="" RAZORPAY_WEBHOOK_SECRET=""
  warn "Live Razorpay keys local pe band (asli payment nahi hogi)."
fi
export APP_URL="http://localhost:$PORT" SITE_URL="http://localhost:$PORT" VITE_PUBLIC_SITE_URL="http://localhost:$PORT"
export PUBLIC_SITE_URL="http://localhost:$PORT" CORS_ORIGINS="" YBEX_LIVE=""
if [[ -n "$IP" ]]; then
  # the iPhone app (cable / ios-local.sh) talks to this Mac instead of the live server
  export VITE_API_ORIGIN="http://$IP:$PORT"
  export APP_URL="http://$IP:$PORT"
  export SITE_URL="http://$IP:$PORT"
  export VITE_PUBLIC_SITE_URL="http://$IP:$PORT"
fi
echo "$IP" > .local-ip

echo
printf "\033[1;35m  Ybex local chal raha hai\033[0m\n"
echo   "  Mac:            http://localhost:$PORT"
[[ -n "$IP" ]] && echo "  iPhone Safari:  http://$IP:$PORT   (same Wi-Fi)"
[[ -n "$IP" ]] && echo "  iPhone app:     naya Terminal tab → bash scripts/ios-local.sh"
echo   "  Login: email + OTP (code screen pe hi dikhega) ya Creator/Brand Demo buttons."
warn   "Data LIVE database ka hai (same Supabase) — test karte waqt asli users ko kuch mat bhejna."
echo   "  Code badla → page refresh. Band karna: Ctrl+C"
echo
# v377: use the project's own tsx (no "Ok to proceed?" question from npx)
if [[ -x node_modules/.bin/tsx ]]; then exec node_modules/.bin/tsx server.ts; fi
exec npx --yes tsx server.ts
