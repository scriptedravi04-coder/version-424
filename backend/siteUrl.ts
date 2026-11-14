// v388 (QA: "Har email ka button/link ybexapp.ai.studio par jata hai, ybexmedia.in nahi"): the live APP_URL is the hosting address
// (ybexapp.ai.studio / *.run.app). Every email, push link and SEO page must use the public domain instead. One helper, used everywhere.
// SITE_URL wins; APP_URL is used only when it is a real public address (not AI Studio / Cloud Run / localhost); else ybexmedia.in.
const HOSTING = /(^|\/\/|\.)(ai\.studio|run\.app|localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;
export const PUBLIC_SITE = "https://ybexmedia.in";

export function publicSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const clean = (v: any) => String(v || "").trim().replace(/\/+$/, "");
  const site = clean(env.SITE_URL);
  if (site && !HOSTING.test(site)) return site;
  const app = clean(env.APP_URL);
  if (app && !HOSTING.test(app)) return app;
  return PUBLIC_SITE;
}
