import { sanitizeHtml } from "./htmlSanitize"; // Session 58: also unquoted on*= and javascript: links
// v295 (Ravi): "agar app live hai aur blogs likhna shuru karein, to kya Google crawl karega? organic reach milegi?"
// Audit finding: the app is a React single-page app. Every URL (/blog, /blog/<slug>) returned the SAME empty
// index.html, so Google, WhatsApp, LinkedIn and X saw one generic title/description for every article, there was
// no robots.txt, no main sitemap, the blog sitemap used a different domain than the rest of the app, and a wrong
// /blog/<anything> answered "200 OK" (a soft 404).
// This file fixes that on the server, with NO database change and NO change to the React pages:
//   • GET /robots.txt, GET /sitemap.xml (home + blog + every published post)
//   • GET /blog        → index.html with the blog's own title / description / canonical / JSON-LD + a plain list of articles
//   • GET /blog/:slug  → index.html with THAT post's title, description, canonical, Open Graph / Twitter card,
//                        Article + Breadcrumb JSON-LD and the article text (for crawlers that do not run JavaScript)
//   • unknown or unpublished slug → HTTP 404 + noindex (never a soft 404, never a draft)
// The React app still loads on top exactly as before.
import express from "express";
import fs from "fs";
import path from "path";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text: string, max: number): string {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** The public address the pages are served on. SITE_URL if set; APP_URL only when it is a real domain; else the
 *  request's address. v376 (live test): APP_URL = https://ybexapp.ai.studio made robots.txt, sitemap.xml and every
 *  blog canonical point Google at the AI Studio address instead of ybexmedia.in. The hosting addresses
 *  (*.ai.studio, *.run.app) are never the public site — ybexmedia.in is. */
const HOSTING_ADDRESS = /(\.ai\.studio|\.run\.app)(\/|$)/i;
export function siteUrlFor(req?: express.Request): string {
  const site = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (site) return site;
  const app = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (app && !HOSTING_ADDRESS.test(app)) return app;
  if (app) return "https://ybexmedia.in";
  if (req) {
    const proto = String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
    const host = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
    if (host) return `${proto}://${host}`;
  }
  return "https://ybexmedia.in";
}

const NOINDEX_ALL = () => process.env.SEO_NOINDEX === "1";

export type PageMeta = {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
  jsonLd?: unknown[];
  bodyHtml?: string; // shown only when JavaScript is off (<noscript>)
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
};

const ldScript = (obj: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "")}</script>`;

/** Put one page's own SEO tags into the built index.html (replaces the generic ones, adds canonical + JSON-LD). */
export function injectMeta(indexHtml: string, m: PageMeta): string {
  let html = String(indexHtml || "");
  const strip = (rx: RegExp) => { html = html.replace(rx, ""); };
  strip(/<meta\s+name=["']description["'][^>]*>\s*/gi);
  strip(/<meta\s+name=["']robots["'][^>]*>\s*/gi);
  strip(/<link\s+rel=["']canonical["'][^>]*>\s*/gi);
  strip(/<meta\s+property=["']og:(title|description|url|image|image:secure_url|image:type|image:width|image:height|image:alt|type)["'][^>]*>\s*/gi);
  strip(/<meta\s+name=["']twitter:(title|description|image|card)["'][^>]*>\s*/gi);
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(m.title)}</title>`);

  const tags: string[] = [
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${esc(m.canonical)}" />`,
    m.noindex || NOINDEX_ALL() ? `<meta name="robots" content="noindex, nofollow" />` : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:site_name" content="Ybex" />`,
    `<meta property="og:type" content="${m.type || "website"}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${esc(m.canonical)}" />`,
  ];
  if (m.image) tags.push(`<meta property="og:image" content="${esc(m.image)}" />`, `<meta property="og:image:alt" content="${esc(m.title)}" />`);
  if (m.type === "article") {
    if (m.publishedTime) tags.push(`<meta property="article:published_time" content="${esc(m.publishedTime)}" />`);
    if (m.modifiedTime) tags.push(`<meta property="article:modified_time" content="${esc(m.modifiedTime)}" />`);
    if (m.section) tags.push(`<meta property="article:section" content="${esc(m.section)}" />`);
    for (const t of (m.tags || []).slice(0, 8)) tags.push(`<meta property="article:tag" content="${esc(t)}" />`);
  }
  tags.push(
    `<meta name="twitter:card" content="${m.image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
  );
  if (m.image) tags.push(`<meta name="twitter:image" content="${esc(m.image)}" />`);
  for (const j of m.jsonLd || []) tags.push(ldScript(j));

  html = html.replace(/<\/head>/i, `    ${tags.join("\n    ")}\n  </head>`);
  if (m.bodyHtml) html = html.replace(/(<div id="root"><\/div>)/i, `$1\n    <noscript>${m.bodyHtml}</noscript>`);
  return html;
}

const authorOf = (tags: any): string => {
  const t = Array.isArray(tags) ? tags.find((x: string) => String(x).startsWith("__author_name:")) : null;
  return t ? String(t).replace("__author_name:", "").trim() || "YBEX Team" : "YBEX Team";
};
const publicTags = (tags: any): string[] => (Array.isArray(tags) ? tags.filter((t: string) => !String(t).startsWith("__")) : []);
const absUrl = (base: string, u?: string | null) => {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
};

export function postMeta(post: any, base: string): PageMeta {
  const url = `${base}/blog/${post.slug}`;
  const text = stripHtml(post.content || "");
  const description = truncate(String(post.meta_description || post.excerpt || text).trim(), 160);
  const title = truncate(`${post.meta_title || post.title} — YBEX`, 70);
  const image = absUrl(base, post.cover_image_url) || `${base}/og-image.jpg`;
  const published = post.published_at ? new Date(post.published_at).toISOString() : undefined;
  const modified = post.updated_at ? new Date(post.updated_at).toISOString() : published;
  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: truncate(String(post.title || ""), 110),
    description,
    image: [image],
    datePublished: published,
    dateModified: modified,
    articleSection: post.category || undefined,
    keywords: publicTags(post.tags).join(", ") || undefined,
    wordCount: text ? text.split(" ").length : undefined,
    author: { "@type": "Person", name: authorOf(post.tags) },
    publisher: { "@type": "Organization", name: "YBEX", logo: { "@type": "ImageObject", url: `${base}/pwa-512x512.png` } },
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "YBEX", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: "Journal", item: `${base}/blog` },
      { "@type": "ListItem", position: 3, name: String(post.title || ""), item: url },
    ],
  };
  return {
    title, description, canonical: url, image, type: "article", publishedTime: published, modifiedTime: modified,
    section: post.category || undefined, tags: publicTags(post.tags), jsonLd: [article, crumbs],
    bodyHtml: `<article><h1>${esc(post.title)}</h1>${post.excerpt ? `<p>${esc(post.excerpt)}</p>` : ""}${sanitizeHtml(post.content)}</article><p><a href="${esc(base)}/blog">All articles</a></p>`,
  };
}

export function blogIndexMeta(posts: any[], base: string): PageMeta {
  const url = `${base}/blog`;
  const description = "Guides, playbooks and updates on influencer marketing, UGC and the creator economy in India — from the YBEX team.";
  return {
    title: "YBEX Journal — Creator Economy & Influencer Marketing",
    description, canonical: url, image: `${base}/og-image.jpg`,
    jsonLd: [{
      "@context": "https://schema.org", "@type": "Blog", name: "YBEX Journal", url, description,
      blogPost: posts.slice(0, 20).map((p) => ({ "@type": "BlogPosting", headline: p.title, url: `${base}/blog/${p.slug}`, datePublished: p.published_at || undefined })),
    }],
    bodyHtml: `<h1>YBEX Journal</h1><p>${esc(description)}</p><ul>${posts.map((p) => `<li><a href="${esc(base)}/blog/${esc(p.slug)}">${esc(p.title)}</a>${p.excerpt ? ` — ${esc(truncate(p.excerpt, 140))}` : ""}</li>`).join("")}</ul>`,
  };
}

export function robotsTxt(base: string): string {
  if (NOINDEX_ALL()) return "User-agent: *\nDisallow: /\n";
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin",
    // v388 (QA: the old "Disallow: /creator/" + "/brand/" also hid the PUBLIC profile pages /creator/<id> and /brand/<id> from Google):
    // only the private app screens are blocked now.
    "Disallow: /creator/dashboard", "Disallow: /creator/refer", "Disallow: /creator/profile", "Disallow: /creator/settings",
    "Disallow: /creator/inbox", "Disallow: /creator/notifications", "Disallow: /creator/kyc", "Disallow: /creator/ugc", "Disallow: /creator/deals",
    "Disallow: /brand/ugc", "Disallow: /brand/profile", "Disallow: /brand/settings", "Disallow: /brand/account", "Disallow: /brand/dashboard",
    "Disallow: /brand/discover", "Disallow: /brand/campaigns", "Disallow: /brand/inbox", "Disallow: /brand/notifications",
    "Disallow: /brand/payments", "Disallow: /brand/kyc",
    "Disallow: /chat",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

// Public pages that need no login (apart from the blog, which is added from the database).
const STATIC_PAGES: Array<[string, string, string]> = [
  ["/", "weekly", "1.0"], ["/blog", "daily", "0.9"], ["/offer", "daily", "0.9"], ["/challenge", "daily", "0.8"], // v367 · v388: /offer added, old /apply-creator form dropped
  ["/explore", "daily", "0.8"], ["/campaigns", "daily", "0.7"], ["/ugc", "weekly", "0.6"],
  ["/help", "monthly", "0.5"], ["/terms", "yearly", "0.3"], ["/privacy-policy", "yearly", "0.3"],
];

export function sitemapXml(base: string, posts: Array<{ slug: string; updated_at?: string; published_at?: string }>): string {
  const day = (d?: string) => { try { return d ? new Date(d).toISOString().split("T")[0] : ""; } catch { return ""; } };
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const [p, freq, pr] of STATIC_PAGES) xml += `  <url>\n    <loc>${esc(base + p)}</loc>\n    <changefreq>${freq}</changefreq>\n    <priority>${pr}</priority>\n  </url>\n`;
  for (const p of posts) {
    const lm = day(p.updated_at || p.published_at);
    xml += `  <url>\n    <loc>${esc(`${base}/blog/${p.slug}`)}</loc>\n${lm ? `    <lastmod>${lm}</lastmod>\n` : ""}    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  }
  return `${xml}</urlset>\n`;
}

/** Register the SEO routes. Call in production BEFORE the catch-all that serves index.html. */
export function setupBlogSeoRoutes(app: express.Application, opts: { getClient: () => any; distPath: string }) {
  let cached: { mtime: number; html: string } | null = null;
  const shell = (): string => {
    const file = path.join(opts.distPath, "index.html");
    const mtime = fs.statSync(file).mtimeMs;
    if (!cached || cached.mtime !== mtime) cached = { mtime, html: fs.readFileSync(file, "utf8") };
    return cached.html;
  };
  const publishedList = async (limit = 1000) => {
    const { data, error } = await opts.getClient()
      .from("blog_posts").select("slug, title, excerpt, updated_at, published_at")
      .eq("status", "published").order("published_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []) as any[];
  };
  const sendHtml = (res: express.Response, html: string, status = 200) => {
    res.status(status).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }).send(html);
  };

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(robotsTxt(siteUrlFor(req)));
  });

  app.get("/sitemap.xml", async (req, res) => {
    let posts: any[] = [];
    try { posts = await publishedList(); } catch (e) { console.error("[Sitemap] posts failed — serving pages only:", (e as any)?.message || e); }
    res.type("application/xml").set("Cache-Control", "public, max-age=900").send(sitemapXml(siteUrlFor(req), posts));
  });

  app.get("/blog", async (req, res, next) => {
    try {
      let posts: any[] = [];
      try { posts = await publishedList(100); } catch { /* the page still loads — the React app fetches its own list */ }
      sendHtml(res, injectMeta(shell(), blogIndexMeta(posts, siteUrlFor(req))));
    } catch (e) { next(e); }
  });

  app.get("/blog/:slug", async (req, res, next) => {
    try {
      const slug = String(req.params.slug || "");
      const base = siteUrlFor(req);
      let post: any = null;
      try {
        const { data, error } = await opts.getClient().from("blog_posts").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
        if (error) throw error;
        post = data;
      } catch (e) {
        // The database is unreachable: do NOT tell Google the article is gone — answer 503 so it comes back later.
        console.error("[Blog SEO] lookup failed:", (e as any)?.message || e);
        return sendHtml(res, injectMeta(shell(), { title: "YBEX Journal", description: "Temporarily unavailable.", canonical: `${base}/blog/${slug}`, noindex: true }), 503);
      }
      if (!post) {
        return sendHtml(res, injectMeta(shell(), { title: "Article not found — YBEX Journal", description: "This article does not exist or is no longer published.", canonical: `${base}/blog`, noindex: true }), 404);
      }
      sendHtml(res, injectMeta(shell(), postMeta(post, base)));
    } catch (e) { next(e); }
  });
}
