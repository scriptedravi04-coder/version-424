"""Session 43 — app icon + iPhone launch images from the final Claude Design file
("Ybex App Icon & Splash", turn 4: 4a icon, 4b splash).

Run: python3 scripts/brand/generate_brand_assets.py   (needs: pip install cairosvg pillow)
Writes into public/. The wordmark below is the design's own vector "Ybex." (no font needed).
"""
import io, os, re
from PIL import Image, ImageFilter
try:
    import cairosvg
except ImportError:          # v292: no cairosvg? draw the SVG with Playwright's Chromium instead
    cairosvg = None

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public")
GRAD = [(0, "#9B00FF"), (0.30, "#7E00DC"), (0.60, "#6200B4"), (1, "#2E0066")]

# "Ybex" letters (design symbol #wml) + the white full stop. Coordinate box: 600 260 1370 400.
LETTERS = (
    '<polygon points="626,305 706,305 792,449 878,305 953,305 827,515 827,630 752,630 752,514"/>'
    '<rect x="979" y="286" width="73" height="344"/>'
    '<path fill-rule="evenodd" d="M1150 377a101 128 0 1 1 0 256a101 128 0 1 1 0-256zM1115 436a63 69 0 1 0 0 138a63 69 0 1 0 0-138z"/>'
    # v292: the design's tilted "e" (its signature) with the cut at the upper-right corner fixed: the crossbar now runs
    # flush into the bowl (H196 = sqrt(201^2 - 46^2), so its corners stay inside the ring) instead of stopping at 155 and leaving a step.
    '<g transform="translate(1419 504) rotate(-45) scale(.67)"><path d="M-155 0H196M155 0A155 155 0 1 0 127 89" fill="none" stroke="#fff" stroke-width="92"/></g>'
    '<polygon points="1558,380 1639,380 1692,452 1746,380 1823,380 1730,503 1827,630 1744,630 1690,554 1633,630 1554,630 1650,504"/>'
    '<circle cx="1889" cy="588" r="50"/>'
)

def grad_defs():
    stops = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in GRAD)
    return f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">{stops}</linearGradient>'

_PW = {}
def _page(w, h, scale=1):
    from playwright.sync_api import sync_playwright
    if "b" not in _PW:
        _PW["p"] = sync_playwright().start(); _PW["b"] = _PW["p"].chromium.launch()
    return _PW["b"].new_page(viewport={"width": w, "height": h}, device_scale_factor=scale)

def render(svg, size):
    if cairosvg:
        png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    else:
        pg = _page(size, size)
        pg.set_content(f'<body style="margin:0;background:transparent"><div style="width:{size}px;height:{size}px">{svg.replace("<svg ", f"<svg width=%d height=%d " % (size, size), 1)}</div></body>')
        png = pg.screenshot(omit_background=True, type="png"); pg.close()
    return Image.open(io.BytesIO(png)).convert("RGBA")

def icon(size, wm_scale=0.64, rounded=False, shading=True):
    """1024 artboard like the design (#g9: translate(-309 216) scale(.64)), centred for other scales."""
    s = wm_scale
    tx = 512 - (600 + 1370 / 2) * s
    ty = 512 - (260 + 400 / 2) * s + (216 + (260 + 200) * 0.64 - 512)  # keep the design's vertical offset
    clip = '<clipPath id="c"><rect width="1024" height="1024" rx="230"/></clipPath>' if rounded else ""
    shade = (
        '<linearGradient id="hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".07" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        '<linearGradient id="lo" x1="0" y1="0" x2="0" y2="1"><stop offset=".8" stop-color="#1E0050" stop-opacity="0"/><stop offset="1" stop-color="#1E0050" stop-opacity=".45"/></linearGradient>'
    ) if shading else ""
    over = '<rect width="1024" height="1024" fill="url(#hi)"/><rect width="1024" height="1024" fill="url(#lo)"/>' if shading else ""
    g = f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s})" fill="#fff">{LETTERS}</g>'
    head = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{grad_defs()}{shade}{clip}</defs>'
    cp = ' clip-path="url(#c)"' if rounded else ""
    base = render(f'{head}<g{cp}><rect width="1024" height="1024" fill="url(#bg)"/>{over}</g></svg>', size)
    mark = render(f'{head}{g}</svg>', size)
    # soft drop shadow under the wordmark (design: 0 8px 10px rgba(30,0,80,.35) at 356 px)
    k = size / 356
    a = mark.split()[3].point(lambda v: int(v * 0.35))
    sh = Image.new("RGBA", mark.size, (30, 0, 80, 0)); sh.putalpha(a)
    sh = sh.filter(ImageFilter.GaussianBlur(max(0.5, 5 * k)))
    off = Image.new("RGBA", mark.size, (0, 0, 0, 0)); off.paste(sh, (0, round(8 * k)), sh)
    if rounded:  # keep shadow inside the rounded tile
        off.putalpha(Image.composite(off.split()[3], Image.new("L", off.size, 0), base.split()[3]))
    out = Image.alpha_composite(base, off)
    return Image.alpha_composite(out, mark)

def icon_svg():
    s = 0.64
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>' + grad_defs() +
            '</defs><rect width="1024" height="1024" rx="230" fill="url(#bg)"/>'
            f'<g transform="translate(-309 216) scale({s})" fill="#fff">{LETTERS}</g></svg>')

SPLASH_HTML = None
def _splash_html():
    """The splash's own CSS + markup, copied from index.html, so the launch image and the page are one picture."""
    global SPLASH_HTML
    if SPLASH_HTML is None:
        html = open(os.path.join(OUT, "..", "index.html"), encoding="utf8").read()
        css = [m for m in re.findall(r"<style>(.*?)</style>", html, re.S) if "#yb-splash{" in m][0]
        body = re.search(r'<div id="yb-splash".*?\n    </div>\n    <script>', html, re.S).group(0)[: -len("\n    <script>")]
        SPLASH_HTML = (css, body)
    return SPLASH_HTML

def launch(w, h, r=3):
    """iPhone launch image = the page's first frame, drawn by Chromium from the page's own CSS at this device size.
    v297 (Ravi: "logo comes, then the animation — the logo shows twice"): the first frame is now ONLY the purple
    gradient + glow, with NO word and NO dot. index.html starts the camera intro at once, so "Ybex." appears
    one time only, when the flash becomes its dot."""
    css, body = _splash_html()
    k = min(w * 0.62, 300) / 241.8                     # same rule as the script in index.html
    body = body.replace(" hidden>", ">", 1).replace('role="status"', f'style="--k:{k:.3f}" role="status"', 1)
    pg = _page(w, h, r)
    pg.set_content(f'<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>{css}html,body{{margin:0}}</style></head><body>{body}</body></html>')
    png = pg.screenshot(type="png"); pg.close()
    return Image.open(io.BytesIO(png)).convert("RGB")

# (css width, css height, pixel ratio) — portrait only (manifest orientation: portrait)
DEVICES = [
    (440, 956, 3), (402, 874, 3), (430, 932, 3), (393, 852, 3), (428, 926, 3), (390, 844, 3),
    (375, 812, 3), (360, 780, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2), (320, 568, 2),
    (1024, 1366, 2), (834, 1194, 2), (820, 1180, 2), (834, 1112, 2), (810, 1080, 2), (768, 1024, 2), (744, 1133, 2),
]

def only_launch():
    os.makedirs(f"{OUT}/splash", exist_ok=True)
    links = []
    for w, h, r in DEVICES:
        name = f"launch-{w * r}x{h * r}.png"
        launch(w, h, r).save(f"{OUT}/splash/{name}", optimize=True)
        links.append(
            f'<link rel="apple-touch-startup-image" href="/splash/{name}" media="(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)" />')
    open(os.path.join(os.path.dirname(__file__), "startup-links.html"), "w").write("\n".join(links) + "\n")
    print("ok", len(links), "launch images (no word)")

if __name__ == "__main__":
    import sys
    if "--launch-only" in sys.argv:
        only_launch(); sys.exit(0)
    icon(512, rounded=True).save(f"{OUT}/pwa-512x512.png", optimize=True)
    icon(192, rounded=True).save(f"{OUT}/pwa-192x192.png", optimize=True)
    # maskable: full bleed, wordmark inside the 80 % safe circle
    icon(512, wm_scale=0.58).save(f"{OUT}/pwa-maskable-512x512.png", optimize=True)
    # iOS rounds the corners itself → full-bleed square, no transparency
    icon(180).convert("RGB").save(f"{OUT}/apple-touch-icon.png", optimize=True)
    fav = icon(256, rounded=True)
    fav.save(f"{OUT}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    open(f"{OUT}/icon.svg", "w").write(icon_svg())
    # Android launch / notification icon: white wordmark on transparent, 78 % of the width (Bubblewrap iconUrl)
    ts = 0.78 * 512 / 1313
    tmark = render('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(%.2f %.2f) scale(%.4f)" fill="#fff">%s</g></svg>'
                   % (256 - (626 + 1313 / 2) * ts, 256 - (286 + 347 / 2) * ts, ts, LETTERS), 512)
    # Session 57 (Ravi: "mujhe direct apna animation lana hai"): the wordmark is now only the notification
    # icon (twa-manifest monochromeIconUrl). The Android launch screen is plain #7E00DC with nothing on it,
    # so the app's own splash animation is the first thing people see.
    tmark.save(f"{OUT}/notification-icon-512.png", optimize=True)
    Image.new("RGBA", (512, 512), (0x7E, 0x00, 0xDC, 255)).save(f"{OUT}/twa-splash-512.png", optimize=True)
    os.makedirs(f"{OUT}/splash", exist_ok=True)
    links = []
    for w, h, r in DEVICES:
        name = f"launch-{w * r}x{h * r}.png"
        launch(w, h, r).save(f"{OUT}/splash/{name}", optimize=True)
        links.append(
            f'<link rel="apple-touch-startup-image" href="/splash/{name}" media="(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)" />')
    open(os.path.join(os.path.dirname(__file__), "startup-links.html"), "w").write("\n".join(links) + "\n")
    print("ok", len(links), "launch images")
