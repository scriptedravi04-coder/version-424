"""Session 43 — link-preview picture (WhatsApp / Telegram / Gmail / Android share sheet).
Run: python3 scripts/brand/generate_share_image.py   (needs: pip install cairosvg pillow)
Writes public/og-image.jpg (1200x630): the app's purple, the vector "Ybex." wordmark, tagline.
"""
import io, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image
from generate_brand_assets import LETTERS, GRAD, OUT, cairosvg, _page

W, H = 1200, 630
stops = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in GRAD)
s = 0.36  # wordmark scale; its box is x 600..1970, y 260..660 in design units
tx = (W - 1370 * s) / 2 - 600 * s
ty = 150 - 260 * s
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">{stops}</linearGradient>
<radialGradient id="glow" cx="80%" cy="10%" r="60%"><stop offset="0" stop-color="#C084FC" stop-opacity=".45"/><stop offset="1" stop-color="#C084FC" stop-opacity="0"/></radialGradient></defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/><rect width="{W}" height="{H}" fill="url(#glow)"/>
<g transform="translate({tx:.1f} {ty:.1f}) scale({s})" fill="#fff">{LETTERS}</g>
<text x="{W/2}" y="440" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="700" fill="#fff">Where brands meet creators</text>
<text x="{W/2}" y="500" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="27" fill="#E9D5FF">Verified creators · Secure payment hold · Legal contracts</text>
</svg>'''
if cairosvg:
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=W, output_height=H)
else:
    pg = _page(W, H); pg.set_content(f'<body style="margin:0">{svg}</body>'); png = pg.screenshot(type="png"); pg.close()
Image.open(io.BytesIO(png)).convert("RGB").save(os.path.join(OUT, "og-image.jpg"), quality=88, optimize=True, progressive=True)
print("wrote public/og-image.jpg (jpg is not in the offline download list)")
