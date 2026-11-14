// Session 58: clean HTML from the server before showing it with dangerouslySetInnerHTML (blog posts).
// Uses the browser's own parser: drops dangerous tags, every on* handler and javascript:/data: links.
// v378 (QA L1 — a noscript / title polyglot survived and could turn into live HTML on re-parse, "mutation XSS"):
// now an ALLOW-list of normal article tags (anything else is dropped or unwrapped to its text), raw-text tags are
// always removed, and the result must come out the same when parsed again — otherwise only the plain text is shown.
const BAD_TAGS = ["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE", "FORM", "FRAME", "FRAMESET", "SVG", "MATH",
  "NOSCRIPT", "TITLE", "TEMPLATE", "TEXTAREA", "XMP", "NOEMBED", "NOFRAMES", "PLAINTEXT", "SELECT", "OPTION", "INPUT", "BUTTON"];
const OK_TAGS = new Set(["P", "BR", "HR", "B", "STRONG", "I", "EM", "U", "S", "SMALL", "SUB", "SUP", "MARK", "CODE", "PRE", "KBD",
  "BLOCKQUOTE", "Q", "CITE", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "DL", "DT", "DD", "A", "IMG", "PICTURE", "SOURCE",
  "FIGURE", "FIGCAPTION", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "CAPTION", "COLGROUP", "COL", "SPAN", "DIV",
  "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE", "NAV", "MAIN", "DETAILS", "SUMMARY", "VIDEO", "AUDIO", "TIME", "ABBR", "DEL", "INS"]);
const OK_ATTRS = new Set(["href", "src", "srcset", "sizes", "alt", "title", "width", "height", "loading", "decoding", "target", "rel",
  "class", "id", "style", "colspan", "rowspan", "scope", "align", "controls", "poster", "type", "datetime", "cite", "start", "reversed", "open"]);

function cleanOnce(raw) {
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const root = doc.body.firstElementChild || doc.body;
  // deepest first, so unwrapping a parent never skips its children
  Array.from(root.querySelectorAll("*")).reverse().forEach((el) => {
    const tag = el.tagName.toUpperCase();
    if (BAD_TAGS.includes(tag)) { el.remove(); return; }
    if (!OK_TAGS.has(tag)) { el.replaceWith(...Array.from(el.childNodes)); return; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = String(attr.value || "").replace(/[\s\u0000-\u001f]+/g, "").toLowerCase();
      if (name.startsWith("on") || !(OK_ATTRS.has(name) || name.startsWith("data-") || name.startsWith("aria-"))) el.removeAttribute(attr.name);
      else if (/[<>]/.test(attr.value)) el.removeAttribute(attr.name); // markup hidden in an attribute (polyglots)
      else if (["href", "src", "xlink:href", "action", "formaction", "srcset", "poster", "cite"].includes(name) && /^(javascript|vbscript|data):/.test(val) && !/^data:image\//.test(val)) el.removeAttribute(attr.name);
      else if (name === "style" && /expression\(|url\(\s*['"]?javascript:|@import|behavior:/i.test(attr.value)) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A" && el.getAttribute("target") === "_blank") el.setAttribute("rel", "noopener noreferrer");
  });
  // Comments can hide markup that a later parse brings back.
  const walker = doc.createTreeWalker(root, 128 /* SHOW_COMMENT */);
  const comments = []; while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  return root.innerHTML;
}

export function sanitizeHtml(html) {
  const raw = String(html ?? "");
  if (typeof DOMParser === "undefined") return raw.replace(/<[^>]*>/g, "");
  const once = cleanOnce(raw);
  const twice = cleanOnce(once);
  if (twice === once) return once;
  // Changed on a second parse → it was relying on parser tricks. Show only the text.
  const doc = new DOMParser().parseFromString(`<div>${once}</div>`, "text/html");
  return (doc.body.textContent || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}
