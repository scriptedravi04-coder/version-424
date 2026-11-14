import re, json, sys, html
from html.parser import HTMLParser

VOID = {"area","base","br","col","embed","hr","img","input","link","meta","source","track","wbr"}
ATTR_MAP = {"class":"className","for":"htmlFor","tabindex":"tabIndex","readonly":"readOnly","maxlength":"maxLength",
            "autocomplete":"autoComplete","colspan":"colSpan","rowspan":"rowSpan","srcset":"srcSet","crossorigin":"crossOrigin",
            "contenteditable":"contentEditable","spellcheck":"spellCheck","autoplay":"autoPlay","playsinline":"playsInline",
            "frameborder":"frameBorder","allowfullscreen":"allowFullScreen","enterkeyhint":"enterKeyHint","inputmode":"inputMode"}
EXPR = re.compile(r"\{\{\s*(.*?)\s*\}\}")

def camel(s):
    parts = s.split("-")
    return parts[0] + "".join(p[:1].upper()+p[1:] for p in parts[1:])

class Conv(HTMLParser):
    def __init__(self, asset_map, hover_css):
        super().__init__(convert_charrefs=False)
        self.out=[]; self.scope=[]; self.stack=[]; self.asset_map=asset_map; self.hover_css=hover_css; self.hid=0
    def ref(self, e):
        e=e.strip()
        if e in ("true","false","null") or re.match(r"^-?\d",e): return e
        head=re.split(r"[.\[]",e)[0]
        if head in self.scope: return e
        return "v."+e
    def attrval(self, name, val):
        if val is None: return "{true}"
        m=EXPR.fullmatch(val.strip())
        if m: return "{"+self.ref(m.group(1))+"}"
        if EXPR.search(val):
            parts=[]; last=0
            for mm in EXPR.finditer(val):
                parts.append(val[last:mm.start()].replace("`","\\`").replace("${","\\${")); parts.append("${"+self.ref(mm.group(1))+"}"); last=mm.end()
            parts.append(val[last:].replace("`","\\`"))
            return "{`"+"".join(parts)+"`}"
        if name=="src" and val in self.asset_map: return json.dumps(self.asset_map[val])
        return json.dumps(html.unescape(val))
    def style_obj(self, css):
        css=html.unescape(css)
        items=[]
        # split on ; not inside parentheses
        depth=0; cur=""; decls=[]
        for ch in css:
            if ch=="(": depth+=1
            if ch==")": depth-=1
            if ch==";" and depth==0: decls.append(cur); cur=""
            else: cur+=ch
        decls.append(cur)
        for d in decls:
            if ":" not in d: continue
            k,v=d.split(":",1); k=k.strip(); v=v.strip()
            if not k: continue
            if k.startswith("--"): key=json.dumps(k)
            else:
                kk=camel(k)
                if k.startswith("-webkit-"): kk="Webkit"+camel(k[8:])[0].upper()+camel(k[8:])[1:]
                elif k.startswith("-moz-"): kk="Moz"+camel(k[5:])[0].upper()+camel(k[5:])[1:]
                key=kk
            for u,f in self.asset_map.items(): v=v.replace(u,f)
            items.append(f"{key}: {json.dumps(v)}")
        return "{{"+", ".join(items)+"}}"
    def handle_starttag(self, tag, attrs):
        self._start(tag, attrs, False)
    def handle_startendtag(self, tag, attrs):
        self._start(tag, attrs, True)
    def _start(self, tag, attrs, selfclose):
        a=dict(attrs)
        if tag=="sc-if":
            cond=EXPR.fullmatch(a["value"].strip()).group(1)
            self.out.append("{"+self.ref(cond)+" ? (<>")
            self.stack.append(("sc-if",None)); return
        if tag=="sc-for":
            lst=EXPR.fullmatch(a["list"].strip()).group(1); var=a["as"]
            self.out.append("{("+self.ref(lst)+" || []).map(("+var+", __i"+str(len(self.scope))+") => (<React.Fragment key={__i"+str(len(self.scope))+"}>")
            self.scope.append(var); self.stack.append(("sc-for",var)); return
        if tag=="image-slot": tag="div"; a={k:v for k,v in a.items() if k in ("style","id","class")}; a["data-slot"]="image"
        parts=[]; cls=[]
        hov=None; act=None
        for k,v in a.items():
            if k.startswith("hint-"): continue
            if k=="style-hover": hov=v; continue
            if k=="style-active": act=v; continue
            if k=="style":
                m=EXPR.fullmatch((v or "").strip())
                parts.append("style={"+self.ref(m.group(1))+"}" if m else "style="+self.style_obj(v or "")); continue
            if k=="class": cls.append(v); continue
            if k.startswith("sc-camel-"):
                nm=camel(k[len("sc-camel-"):])
            elif k.startswith("aria-") or k.startswith("data-"): nm=k
            else: nm=ATTR_MAP.get(k, camel(k) if "-" in k else k)
            if nm=="ref": nm="ref"
            parts.append(f"{nm}={self.attrval(k, v)}")
        if hov or act:
            self.hid+=1; c=f"dch{self.hid}"; cls.append(c)
            def imp(css): return ";".join(x.strip()+" !important" for x in html.unescape(css).split(";") if x.strip())
            if hov: self.hover_css.append(f".{c}:hover{{{imp(hov)}}}")
            if act: self.hover_css.append(f".{c}:active{{{imp(act)}}}")
        if cls: parts.insert(0,"className="+json.dumps(" ".join(cls)))
        s="<"+tag+(" "+" ".join(parts) if parts else "")
        if tag in VOID or selfclose: self.out.append(s+" />")
        else:
            self.out.append(s+">"); self.stack.append((tag,None))
    def handle_endtag(self, tag):
        if tag in VOID: return
        if not self.stack: return
        t,var=self.stack.pop()
        if t=="sc-if": self.out.append("</>) : null}")
        elif t=="sc-for": self.scope.pop(); self.out.append("</React.Fragment>))}")
        else: self.out.append(f"</{t}>")
    def handle_data(self, d):
        if not d: return
        res=[]; last=0
        for mm in EXPR.finditer(d):
            res.append(self.text(d[last:mm.start()])); res.append("{"+self.ref(mm.group(1))+"}"); last=mm.end()
        res.append(self.text(d[last:]))
        self.out.append("".join(res))
    def text(self, t):
        return t.replace("{","{'{'}").replace("}","{'}'}").replace(">","&gt;").replace("<","&lt;")
    def handle_entityref(self, name): self.out.append(f"&{name};")
    def handle_charref(self, name): self.out.append(f"&#{name};")
    def handle_comment(self, d): pass

def convert(body, asset_map):
    hover=[]
    c=Conv(asset_map, hover); c.feed(body); c.close()
    jsx="".join(c.out)
    jsx=re.sub(r"\n{3,}","\n\n",jsx)
    return jsx, hover
