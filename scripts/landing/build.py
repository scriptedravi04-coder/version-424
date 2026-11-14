import re, json, os, shutil, sys
sys.path.insert(0,"/home/claude/landing")
from conv import convert
D="/home/claude/design/export"; R="/home/claude/w/ybex-v296"
PUB=R+"/public/landing"; os.makedirs(PUB+"/fonts",exist_ok=True)
OUT=R+"/src/components/landing/v2"; os.makedirs(OUT,exist_ok=True)
for n in ["Mobile","Desktop"]:
    tpl=open(f"{D}/{n}_tpl.html").read()
    man=json.load(open(f"{D}/{n}_manifest.txt"))
    ext=json.loads(open(f"{D}/{n}_ext_resources.txt").read() or "[]")
    named={e["uuid"]:e["id"] for e in ext}
    amap={}
    for uid,m in man.items():
        mime=m["mime"]; e=mime.split("/")[-1].replace("svg+xml","svg").replace("javascript","js")
        if e=="js": continue
        src=f"{D}/{n}_assets/{uid}.{e}"
        if uid in named and named[uid].startswith("r_"):
            nm=named[uid][2:]; nm=re.sub(r"_(png|webp|svg)$",r".\1",nm)
        else: nm=f"{uid[:8]}.{e}"
        sub="fonts/" if e in ("woff2","woff","ttf") else ""
        dst=f"{PUB}/{sub}{nm}"
        if not os.path.exists(dst): shutil.copy(src,dst)
        amap[uid]=f"/landing/{sub}{nm}"
    # css
    h=tpl[tpl.find('<helmet>'):tpl.find('</helmet>')]
    css="\n".join(re.findall(r'<style[^>]*>(.*?)</style>',h,re.S))
    for u,f in amap.items(): css=css.replace(f'"{u}"',f'"{f}"').replace(u,f)
    css=css.replace("body{margin:0;background:#E9E7EF;font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;color:#0F0B1F}",
                    ".ybl-root{margin:0;background:#E9E7EF;font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;color:#0F0B1F}")
    css=re.sub(r"(^|\})a\{","\\1.ybl-root a{",css); css=css.replace("}a:hover{","}.ybl-root a:hover{").replace("}input[type=range]{","}.ybl-root input[type=range]{")
    css=css.replace("image-slot::part(empty)","[data-slot=image]:empty")
    body=tpl[tpl.find('</helmet>')+len('</helmet>'):tpl.find('<script type="text/x-dc"')]
    body=body.replace("</x-dc>","")
    if n=="Desktop":
        # v333: drop the design tool's "Preview Desktop / Mobile 390" bar, the browser-window frame and the phone frame.
        a=body.find('<div style="position:sticky;top:0;z-index:50'); b=body.find('<div style="padding:24px 16px 60px;display:flex;justify-content:center">')
        assert a>=0 and b>a; body=body[:a]+body[b:]
        body=body.replace('<div style="padding:24px 16px 60px;display:flex;justify-content:center">','<div>',1)
        import re as _re
        body=_re.sub(r'<sc-if value="\{\{ isDesk \}\}".*?</sc-if>','',body,count=1,flags=_re.S)
        body=_re.sub(r'<sc-if value="\{\{ isMobile \}\}".*?</sc-if>','',body,count=1,flags=_re.S)
    jsx,hover=convert(body,amap)
    # v334 (Google Play "Delete account URL" / App Store): footer also links /delete-account, right after Refund policy.
    _m=re.search(r'(<a [^>]*href="/info/refunds"[^>]*>Refund policy</a>)',jsx)
    if _m and 'href="/delete-account"' not in jsx:
        jsx=jsx.replace(_m.group(1),_m.group(1)+_m.group(1).replace('href="/info/refunds"','href="/delete-account"').replace('>Refund policy</a>','>Delete account</a>'),1)
    css+="\n/* hover / active states from the design */\n"+"\n".join(hover)
    css+="""
/* v333: Safari / Firefox have no scroll-driven animations yet — show the content without the reveal */
@supports not (animation-timeline: view()){.ybl-root [style*="animation-timeline"]{animation:none!important;opacity:1!important;transform:none!important;clip-path:none!important}}
/* v333: reduced motion — no infinite loops or marquees */
@media (prefers-reduced-motion: reduce){.ybl-root *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}
"""
    open(f"{OUT}/landing{n}.css","w").write("/* v333: generated from the Claude Design handoff \"Ybex Landing "+n+" (offline).html\" — see README.md */\n"+css)
    logic=open(f"{D}/{n}_logic.js").read()
    logic=re.sub(r"const __R = p => .*?;\n","const __R = (p) => ASSETS[p] || p;\n",logic,count=1)
    # asset table for __R paths
    rmap={}
    for uid,nm in named.items():
        if nm.startswith("r_") and uid in amap:
            rmap[nm[2:]]=amap[uid]
    paths=set(re.findall(r"__R\(['\"]([^'\"]+)['\"]\)",logic))
    assets={}
    for p in paths:
        key=re.sub(r"[^a-z0-9]","_",p,flags=re.I)
        assets[p]=rmap.get(key,"/landing/"+os.path.basename(p))
    if n=="Desktop":
        logic=logic.replace("isMobile: mob, isDesk: !mob, shell: mob ?","isMobile: false, isDesk: false, shell: false ?")
        logic=logic.replace("{ position: 'relative', width: '100%', maxWidth: 1440, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #D6D2E2', boxShadow: '0 60px 120px -50px rgba(20,10,50,.55),0 0 0 6px rgba(255,255,255,.5)' }","{ position: 'relative', width: '100%' }")
        # the page itself scrolls (no inner 100vh-150px window); container queries still measure the full width
        logic=logic.replace("height: mob ? 844 : 'calc(100vh - 150px)', minHeight: mob ? undefined : 560, overflowY: 'auto', maxWidth: mob ? 390 : 1440,","height: mob ? 844 : '100dvh', minHeight: mob ? undefined : 560, overflowY: 'auto', maxWidth: mob ? 390 : 'none',")
    logic=logic.replace("class Component extends DCLogic {",f"class Landing{n}View extends React.Component {{")
    # render
    idx=logic.rindex("}")
    logic=logic[:idx]+"  render() {\n    const v = this.renderVals();\n    return (\n      <div className=\"ybl-root\">\n"+jsx+"\n      </div>\n    );\n  }\n}\n"
    head=("/* eslint-disable */\n// v333 (Ravi: \"now start working on this\" — YBEX_Landing_Page_Design.zip): the landing page from Claude Design,\n"
          f"// rebuilt as a React component. Text, layout and motion are the design's own ({n.lower()} file). Generated by\n"
          "// scripts/landing/ (conv.py) from the handoff HTML — re-run it if the design changes, don't hand-edit the markup.\n"
          "import React from \"react\";\n"f"import \"./landing{n}.css\";\n\n"
          "const ASSETS = "+json.dumps(assets,indent=1)+";\n\n")
    open(f"{OUT}/Landing{n}View.jsx","w").write(head+logic+f"\nexport default Landing{n}View;\n")
    print(n,"ok",len(jsx),len(hover),len(assets), [p for p in assets if not os.path.exists(R+"/public"+assets[p])])
