# ybexmedia.in jodna — Cloudflare free jugad (v337)

Ybex abhi `ybexapp.ai.studio` pe chalta hai (AI Studio free hosting). Wahan apna domain sirf Cloud Run (billing) se
judta hai. Jugad: domain ko **Cloudflare (free)** pe le jao, aur ek chhota **Worker** lagao jo `ybexmedia.in` ki har
request `ybexapp.ai.studio` ko bhej de. Visitor ko sirf `ybexmedia.in` dikhega.

Kharcha: ₹0 — roz 1,00,000 requests tak (Workers free). Usse zyada ho to Workers Paid $5/mahina (~₹450).
Time: 30–45 min kaam + nameserver badalne mein 10 min se 24 ghante tak wait.

> ⚠️ Sabse zaroori: **email records (Resend) mat todna.** Step 2 dhyan se karo, warna OTP / emails band ho jayenge.

---

## Step 1 — Cloudflare account
1. https://dash.cloudflare.com/sign-up → account banao (admin@ybexmedia.in se).
2. **Add a domain** → `ybexmedia.in` likho → "Quick scan for DNS records" ON rehne do → Continue.
3. Plan: **Free** ($0) → Continue.

## Step 2 — DNS records check (emails ke liye)
Cloudflare GoDaddy ke records copy kar leta hai. List mein ye zaroor hone chahiye (GoDaddy → My Products →
ybexmedia.in → DNS se match karo; jo missing ho, **Add record** se same daal do):
- **MX** records (agar email inbox GoDaddy / Google / Zoho pe hai).
- **TXT** records: `v=spf1 …`, `resend._domainkey` (DKIM), `_dmarc`, Google verification wale.
- Resend ke `send` / `bounce` jaise **MX / TXT** (Resend dashboard → Domains → ybexmedia.in mein jo list hai, sab).
- In sab ka **Proxy status = DNS only (grey cloud)** rakho.

**Delete karo** (Worker inki jagah lega): `ybexmedia.in` (@) aur `www` ke **A / CNAME** records — GoDaddy ka parking
/ forwarding wala. Agar koi website already chal rahi ho to pehle mujhe batao.

## Step 3 — GoDaddy pe nameserver badlo
1. Cloudflare jo 2 nameservers dikhaye (jaise `xxx.ns.cloudflare.com`, `yyy.ns.cloudflare.com`) — copy karo.
2. GoDaddy → My Products → ybexmedia.in → **DNS** → **Nameservers** → **Change nameservers** →
   "I'll use my own nameservers" → dono paste karo → Save.
3. GoDaddy pe **Domain forwarding** laga ho to hata do.
4. Cloudflare ka email aayega "ybexmedia.in is now active" (10 min – 24 ghante). Uske baad Step 4.

## Step 4 — Secret banao
Ek lamba random password banao (40+ characters, koi bhi password generator). Ye **PROXY_SHARED_SECRET** hai.
- AI Studio app ke secrets / environment mein daalo: `PROXY_SHARED_SECRET = <wo password>` aur app redeploy karo
  (v337 ya usse naya code hona chahiye — `backend/domainProxy.ts`).
- Isse server har visitor ka asli IP dekhta hai (warna sab ek IP lagenge aur galat password ki limit sabko lock kar degi).

## Step 5 — Worker banao
1. Cloudflare → **Workers & Pages** → **Create** → **Create Worker** → naam `ybex-proxy` → **Deploy**.
2. **Edit code** → saara code hata ke `cloudflare/ybex-proxy-worker.js` (zip mein hai) ka poora code paste → **Deploy**.
3. Worker → **Settings** → **Variables and Secrets** → **Add** → Type **Secret**, name `PROXY_SHARED_SECRET`,
   value = Step 4 wala same password → Deploy.

## Step 6 — Domain Worker se jodo
Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain**:
- `ybexmedia.in` → Add
- `www.ybexmedia.in` → Add
(SSL / https Cloudflare khud laga deta hai, 5–15 min.)

## Step 7 — Test
1. https://ybexmedia.in/api/health → kuch "ok" jaisa aana chahiye.
2. https://ybexmedia.in/app → login (email + password / OTP), ek chat kholo, message bhejo, photo dekho.
3. https://www.ybexmedia.in → apne aap ybexmedia.in pe jaana chahiye.
4. Koi OTP email aaye to emails sahi hain.
5. Google se login abhi `ybexapp.ai.studio` pe le jayega — ye normal hai, Step 8 ke baad ybexmedia.in pe hi rahega.
Kuch na chale → Worker hata do (Domains & Routes → remove) — `ybexapp.ai.studio` pe sab pehle jaisa chalta rahega.

## Step 8 — Jab sab chal jaye (main address ybexmedia.in banana)
1. AI Studio secrets: `APP_URL`, `SITE_URL`, `VITE_PUBLIC_SITE_URL` = `https://ybexmedia.in` → redeploy.
   (Emails ke links, share links ab ybexmedia.in ke honge.)
2. Google Cloud Console → Credentials → OAuth client → **Authorised redirect URIs** mein add karo:
   `https://ybexmedia.in/api/auth/oauth/google/callback` (purana ai.studio wala bhi rehne do). Apple ho to Apple
   Services ID mein bhi `https://ybexmedia.in/api/auth/oauth/apple/callback`.
3. Razorpay webhook purane address pe bhi chalega — badalna ho to `https://ybexmedia.in/api/payments/razorpay/webhook`.
4. **iPhone app** (baad mein, jab chaho): `VITE_API_ORIGIN=https://ybexmedia.in` set karke deploy → live update se
   saare iPhones naye address pe chale jayenge, App Store release nahi chahiye. `ybexapp.ai.studio` ko kuch hafte chalne do.
5. **Android (Play) app**: `ybexapp.ai.studio` pe hi chalta rahega. Domain badalna ho to ek nayi Play update
   (twa-manifest `host` = ybexmedia.in + assetlinks) — kabhi bhi, jaldi nahi hai.

## Limit dekhte rehna
Cloudflare → Workers & Pages → ybex-proxy → **Metrics** → requests per day. 70–80 hazaar ke paas pahunche to
**Workers Paid ($5)** le lo ya apni hosting (Hostinger VPS) pe shift karne ka time hai.

## Dhyan rakhne wali baatein
- `ybexapp.ai.studio` naam tabhi tak tumhara hai jab tak app published hai — app unpublish / delete mat karna.
- Ye jugad hai: asli server abhi bhi AI Studio free hosting hi hai. Users badhne pe apni hosting lo, tab Worker hata
  ke domain seedha naye server pe point kar denge.
