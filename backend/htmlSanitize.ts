// Session 58: blog HTML is cleaned before it is saved (a post with <img onerror=…> ran script for every reader —
// login tokens live in browser storage). Same rules as src/utils/sanitizeHtml.js (the reader cleans it again).
// v388 (QA: `<img/src=x/onerror=…>` and `&#106;avascript:` links slipped through the old regex cleaner): now a real HTML parser
// (sanitize-html) with an ALLOW-list of article tags / attributes / link schemes. Anything else is dropped.
import sanitizeHtmlLib from "sanitize-html";

const TAGS = ["p", "br", "hr", "b", "strong", "i", "em", "u", "s", "small", "sub", "sup", "mark", "code", "pre", "kbd", "blockquote", "q", "cite",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "a", "img", "figure", "figcaption", "table", "thead", "tbody", "tfoot",
  "tr", "th", "td", "caption", "span", "div", "section", "article", "details", "summary", "time", "abbr", "del", "ins"];

export function sanitizeHtml(input: any): string {
  return sanitizeHtmlLib(String(input ?? ""), {
    allowedTags: TAGS,
    allowedAttributes: {
      "*": ["id", "class", "title", "lang", "dir", "align"],
      a: ["href", "target", "rel", "title"],
      img: ["src", "srcset", "alt", "title", "width", "height", "loading", "decoding"],
      th: ["colspan", "rowspan", "scope"], td: ["colspan", "rowspan"],
      time: ["datetime"], details: ["open"], ol: ["start", "reversed"], blockquote: ["cite"], q: ["cite"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => {
        const out = { ...attribs };
        if (out.target === "_blank") out.rel = "noopener noreferrer";
        return { tagName, attribs: out };
      },
    },
    disallowedTagsMode: "discard",
  });
}
