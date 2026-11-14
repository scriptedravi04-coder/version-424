/** v425 (dev fixes B3): one read-time rule for the blog list and the post page — 200 words a minute. Pure. */
export function readTime(html) {
  const words = String(html || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}
