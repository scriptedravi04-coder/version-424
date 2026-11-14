import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, BookOpen, ArrowRight, ChevronRight, ChevronLeft, Mail } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { readTime as readTimeOf } from "../../utils/readTime"; // v425 (B3)

/** v425 (dev fixes B6): first, last, current ±1, with "…" for gaps — 12+ pages no longer overflow a phone. Pure. */
export function pageList(page, total) {
  const nums = [...new Set([1, page - 1, page, page + 1, total])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

// v334: the newsletter form is hidden until it saves emails somewhere (store review: no placeholder features).
const SHOW_NEWSLETTER = false;

/** v397: Ybex's own 1200 x 630 cover for posts without one (was an Unsplash beach photo). */
const DEFAULT_BLOG_COVER = "/og-image.jpg";

export default function BlogIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get("category") || "all";
  const searchQuery = searchParams.get("search") || "";

  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  // Auto-carousel state for top big featured hero
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [isHeroHovered, setIsHeroHovered] = useState(false);

  // Founders corner carousel/pagination index
  const [foundersPage, setFoundersPage] = useState(0);

  // Set document title
  useEffect(() => {
    document.title = "YBEX Journal — Creator Economy & Influencer Marketing";
  }, []);

  // Fetch categories
  useEffect(() => {
    api
      .get("/blog/categories")
      .then((res) => {
        if (Array.isArray(res.data)) {
          setCategories(res.data);
        }
      })
      .catch((err) => console.warn("[BlogIndex categories]", err));
  }, []);

  // Fetch Posts
  // v332: a failed load said "No articles found"; now it says so and offers Try again.
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    setLoading(true);
    setLoadFailed(false);
    const params = {
      page,
      limit: 15
    };
    if (activeCategory !== "all") params.category = activeCategory;
    if (searchQuery) params.search = searchQuery;

    api
      .get("/blog/posts", { params })
      .then((res) => {
        if (res.data?.posts) {
          setPosts(res.data.posts);
          setTotalPages(res.data.totalPages || 1);
        }
      })
      .catch((err) => {
        console.error("[BlogIndex posts error]", err);
        setLoadFailed(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeCategory, searchQuery, page, reloadKey]);

  // Featured hero posts (featured ones or top 5)
  // v425 (dev fixes B2): every list is built from what the one above left — a post shows once per page, not 3–4 times
  const { featuredPosts, latestPosts, foundersPosts, explorePosts } = React.useMemo(() => {
    const list = Array.isArray(posts) ? posts : [];
    const used = new Set();
    const take = (src, n) => { const out = src.filter((p) => !used.has(p.id)).slice(0, n); out.forEach((p) => used.add(p.id)); return out; };
    const featured = take(list.some((p) => p.is_featured) ? list.filter((p) => p.is_featured) : list, 5);
    const latest = take(list, 5);
    const founders = take(list, 6);
    return { featuredPosts: featured, latestPosts: latest, foundersPosts: founders, explorePosts: list.filter((p) => !used.has(p.id)) };
  }, [posts]);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const heroTouchTimer = React.useRef(null);

  // Auto-slide effect for big hero post (5 seconds per slide)
  useEffect(() => {
    // v425 (B4): no auto-slide with reduced motion, or while a finger is on it (phones have no hover), or in a hidden tab
    if (reduceMotion || featuredPosts.length <= 1 || isHeroHovered) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setCurrentHeroIndex((prev) => (prev + 1) % featuredPosts.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredPosts.length, isHeroHovered, reduceMotion]);
  useEffect(() => () => clearTimeout(heroTouchTimer.current), []);


  const handleCategoryClick = (catName) => {
    setPage(1);
    if (catName === "all" || catName === "All") {
      searchParams.delete("category");
    } else {
      searchParams.set("category", catName);
    }
    setSearchParams(searchParams);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const val = form.elements.search.value.trim();
    setPage(1);
    if (val) {
      searchParams.set("search", val);
    } else {
      searchParams.delete("search");
    }
    setSearchParams(searchParams);
  };

  // v332: no made-up "Aug 10" for posts without a date; Indian format in IST.
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" });
  };

  const calculateReadTime = (content) => readTimeOf(content); // v425 (B3): shared with the post page

  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    // v333: nothing stores this email yet, so the page no longer says "Subscribed!" (softened, honest).
    toast("The newsletter starts soon — we'll announce it on the Ybex Instagram.");
  };

  return (
    <div className="min-h-screen bg-white text-[var(--text-primary)] w-full">
      {/* Editorial Header Section */}
      <div className="pt-3 sm:pt-4 pb-4 px-4 sm:px-6 lg:px-8 border-b border-[#F0F0F0] bg-white">
        <div className="max-w-none space-y-3.5">
          {/* Top Title & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0A0A0A] tracking-tight">
                Our Latest Blog Posts
              </h1>
              <p className="text-xs sm:text-sm text-[#6B7280] max-w-xl">
                Tactics, verified creator benchmarks, and strategic playbooks for modern brands and creators.
              </p>
            </div>

            {/* Quick Search */}
            <form onSubmit={handleSearch} className="relative w-full md:w-80">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
              <input
                key={searchQuery}
                name="search"
                type="text"
                defaultValue={searchQuery}
                placeholder="Search articles, topics..." /* v332: 16px on phones (no iPhone zoom) */
                className="w-full pl-9 pr-11 py-2 rounded-2xl border border-[#E5E5EA] bg-[#F9F9FB] text-base sm:text-xs text-[#0A0A0A] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]/20 transition-all"
              />
              {searchQuery && ( /* v425 (B8): clear the search in one tap */
                <button type="button" aria-label="Clear search" data-testid="blog-search-clear"
                  onClick={() => { setPage(1); searchParams.delete("search"); setSearchParams(searchParams); }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-[#6B7280] hover:text-[#0A0A0A] cursor-pointer">×</button>
              )}
            </form>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar pt-1">
            <button
              onClick={() => handleCategoryClick("all")}
              className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeCategory === "all"
                  ? "bg-[#7C3AED] text-white shadow-xs"
                  : "bg-[#F9F9FB] border border-[#E5E5EA] text-[#0A0A0A] hover:bg-[#F2F2F7]"
              }`}
            >
              All Topics
            </button>
            {categories.map((cat) => {
              const isSelected = activeCategory === cat.name;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.name)}
                  className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-[#7C3AED] text-white shadow-xs"
                      : "bg-[#F9F9FB] border border-[#E5E5EA] text-[#0A0A0A] hover:bg-[#F2F2F7]"
                  }`}
                >
                  <span>{cat.name}</span>
                  {cat.post_count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected ? "bg-white/20 text-white" : "bg-black/5 text-[#6B7280]"
                      }`}
                    >
                      {cat.post_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-10">
        {loading ? (
          <div className="py-24 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-9 h-9 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-[#6B7280]">Loading articles...</p>
            </div>
          </div>
        ) : loadFailed && posts.length === 0 ? (
          <div className="text-center py-20 bg-[#F9F9FB] rounded-3xl border border-[#E5E5EA] space-y-3">
            <BookOpen size={32} className="mx-auto text-[#6B7280]" />
            <h3 className="text-base font-bold text-[#0A0A0A]">Couldn't load articles</h3>
            <p className="text-xs text-[#6B7280]">Please check your connection and try again.</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 rounded-xl bg-[#7C3AED] text-white text-xs font-bold hover:bg-[#6D28D9] transition-colors min-h-[40px]"
            >
              Try again
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 bg-[#F9F9FB] rounded-3xl border border-[#E5E5EA] space-y-3">
            <BookOpen size={32} className="mx-auto text-[#6B7280]" />
            <h3 className="text-base font-bold text-[#0A0A0A]">No articles found</h3>
            <p className="text-xs text-[#6B7280]">Try clearing your search query or selecting another topic.</p>
            <button
              onClick={() => handleCategoryClick("all")}
              className="px-4 py-2 rounded-xl bg-[#7C3AED] text-white text-xs font-bold hover:bg-[#6D28D9] transition-colors"
            >
              View All Articles
            </button>
          </div>
        ) : (
          <>
            {/* SECTION 1: TOP HERO SECTION (Auto-scrolling Large Post on Left + "Latest post" on Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* LEFT: BIG FEATURED POST (Auto-scrolling Carousel Banner)
                  v397 (Ravi): covers are 1200 x 630 — the image sits in a 40:21 box (nothing cut off) and the title is
                  BELOW the image, not on top of it (the cover's own text and the title used to collide). */}
              <div
                className="lg:col-span-8 rounded-3xl overflow-hidden shadow-xs border border-[#DDD6FE] bg-white flex flex-col group"
                data-testid="blog-hero"
                onMouseEnter={() => setIsHeroHovered(true)}
                onMouseLeave={() => setIsHeroHovered(false)}
                onTouchStart={() => { clearTimeout(heroTouchTimer.current); setIsHeroHovered(true); }}
                onTouchEnd={() => { clearTimeout(heroTouchTimer.current); heroTouchTimer.current = setTimeout(() => setIsHeroHovered(false), 8000); }}
              >
                {featuredPosts.length > 0 && (
                  <>
                    <Link to={`/blog/${featuredPosts[currentHeroIndex]?.slug}`} className="block relative aspect-[40/21] w-full overflow-hidden bg-[#F5F0FF]">
                      <AnimatePresence mode="wait">
                        <motion.img
                          key={featuredPosts[currentHeroIndex]?.id || currentHeroIndex}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45 }}
                          src={featuredPosts[currentHeroIndex]?.cover_image_url || DEFAULT_BLOG_COVER}
                          alt={featuredPosts[currentHeroIndex]?.title}
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      </AnimatePresence>
                    </Link>

                    <div className="p-5 sm:p-6 space-y-2">
                      <Link to={`/blog/${featuredPosts[currentHeroIndex]?.slug}`}>
                        <h2 className="text-xl sm:text-2xl md:text-[26px] font-extrabold text-[#0A0A0A] hover:text-[#7C3AED] transition-colors leading-tight line-clamp-2">
                          {featuredPosts[currentHeroIndex]?.title}
                        </h2>
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-[#6B7280] font-medium">
                        <span>{formatDate(featuredPosts[currentHeroIndex]?.published_at)}</span>
                        <span>•</span>
                        <span>{calculateReadTime(featuredPosts[currentHeroIndex]?.content)}</span>
                      </div>
                      {featuredPosts.length > 1 && ( /* v425 (B4): dots — more slides exist, tap to jump */
                        <div className="flex items-center -ml-3" data-testid="blog-hero-dots">
                          {featuredPosts.map((p, i) => (
                            <button key={p.id || i} type="button" aria-label={`Show post ${i + 1}`} aria-current={i === currentHeroIndex}
                              onClick={() => setCurrentHeroIndex(i)} className="w-11 h-11 flex items-center justify-center cursor-pointer">
                              <span className={`block rounded-full transition-all ${i === currentHeroIndex ? "w-2.5 h-2.5 bg-[#7C3AED]" : "w-2 h-2 bg-[#DDD6FE]"}`} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* RIGHT: "LATEST POST" COMPACT STACK */}
              <div className="lg:col-span-4 rounded-3xl bg-white border border-[#E5E5EA] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-[#0A0A0A] tracking-tight pb-2.5 mb-1 border-b border-[#F0F0F0] flex items-center justify-between">
                    <span>Latest Posts</span>
                    <span className="text-[10px] font-bold text-[#7C3AED] bg-[#F5F0FF] px-2 py-0.5 rounded-full border border-[#DDD6FE]">
                      Fresh Releases
                    </span>
                  </h3>

                  <div className="divide-y divide-[#F5F5F7]">
                    {latestPosts.map((post) => (
                      <Link
                        key={post.id}
                        to={`/blog/${post.slug}`}
                        className="group flex items-start gap-3 py-2.5 first:pt-1 last:pb-1 transition-all"
                      >
                        {/* v397: landscape thumbnail in the covers' own 1200 x 630 shape (a square showed only the middle) */}
                        <div className="w-28 aspect-[40/21] rounded-lg bg-[#F9F9FB] border border-[#E5E5EA] overflow-hidden flex-shrink-0 relative">
                          {post.cover_image_url ? (
                            <img
                              src={post.cover_image_url}
                              alt={post.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#F5F0FF] text-[#7C3AED]">
                              <BookOpen size={16} className="opacity-40" />
                            </div>
                          )}
                        </div>

                        {/* Text Information */}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <h4 className="text-xs font-bold text-[#0A0A0A] group-hover:text-[#7C3AED] transition-colors leading-snug line-clamp-2">
                            {post.title}
                          </h4>
                          <div className="text-[10px] text-[#8E8E93] flex items-center gap-1 font-medium">
                            <span>{formatDate(post.published_at)}</span>
                            <span>•</span>
                            <span className="text-[#7C3AED] font-semibold">{post.category || "General"}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#F0F0F0]">
                  <Link
                    to="/blog"
                    onClick={() => {
                      searchParams.delete("category");
                      searchParams.delete("search");
                      setSearchParams(searchParams);
                    }}
                    className="w-full py-2 rounded-xl bg-[#F5F0FF] hover:bg-[#EDE9FE] text-[#7C3AED] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-[#DDD6FE]"
                  >
                    View All Archives <ArrowRight size={13} />
                  </Link>
                </div>
              </div>

            </div>

            {/* SECTION 2: FOUNDERS CORNER */}
            <div className={`space-y-4 pt-2 ${foundersPosts.length ? "" : "hidden"}`}>{/* v425: empty after de-dup → hidden */}
              {/* Section Header with Left/Right Arrows */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                    Founders corner
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Curated playbooks and strategic essays for scaling creator partnerships.
                  </p>
                </div>

                {/* Left/Right Pagination Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFoundersPage((prev) => Math.max(0, prev - 1))}
                    disabled={foundersPage === 0}
                    aria-label="Previous articles"
                    className="w-11 h-11 rounded-full border border-[#E5E5EA] bg-white hover:bg-[#F5F0FF] hover:text-[#7C3AED] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-[#0A0A0A] transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() =>
                      setFoundersPage((prev) =>
                        prev + 3 < foundersPosts.length ? prev + 1 : prev
                      )
                    }
                    disabled={foundersPage + 3 >= foundersPosts.length}
                    aria-label="Next articles"
                    className="w-11 h-11 rounded-full border border-[#E5E5EA] bg-white hover:bg-[#F5F0FF] hover:text-[#7C3AED] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-[#0A0A0A] transition-colors cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* 3-Column Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {foundersPosts
                  .slice(foundersPage * 3, foundersPage * 3 + 3)
                  .map((post) => (
                    <Link
                      key={post.id}
                      to={`/blog/${post.slug}`}
                      className="group flex flex-col justify-between bg-white rounded-2xl border border-[#E5E5EA] overflow-hidden hover:border-[#DDD6FE] hover:shadow-xs transition-all duration-300 p-4 space-y-3"
                    >
                      {/* Image Frame */}
                      <div className="aspect-[40/21] w-full rounded-xl overflow-hidden bg-[#F9F9FB] border border-[#F0F0F0] relative">
                        {post.cover_image_url ? (
                          <img
                            src={post.cover_image_url}
                            alt={post.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#F5F0FF] text-[#7C3AED]">
                            <BookOpen size={24} className="opacity-40" />
                          </div>
                        )}
                      </div>

                      {/* Content Section */}
                      <div className="space-y-2 flex-1 flex flex-col justify-between">
                        <div className="space-y-1.5">
                          {/* Category with Color Dot */}
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[#7C3AED]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]" />
                            <span>{post.category || "Strategy"}</span>
                          </div>

                          {/* Post Title */}
                          <h4 className="text-sm sm:text-base font-bold text-[#0A0A0A] group-hover:text-[#7C3AED] transition-colors leading-snug line-clamp-2">
                            {post.title}
                          </h4>

                          {/* Excerpt */}
                          {post.excerpt && (
                            <p className="text-xs text-[#6B7280] leading-relaxed line-clamp-2">
                              {post.excerpt}
                            </p>
                          )}
                        </div>

                        {/* Date & Read Time */}
                        <div className="pt-2 border-t border-[#F5F5F7] text-[11px] text-[#8E8E93] flex items-center gap-1.5 font-medium">
                          <span>{formatDate(post.published_at)}</span>
                          <span>•</span>
                          <span>{calculateReadTime(post.content)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>

            {/* SECTION 3: ALL ARTICLES CATALOGUE */}
            <div className={`space-y-4 pt-4 border-t border-[#F0F0F0] ${explorePosts.length ? "" : "hidden"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-extrabold text-[#0A0A0A] tracking-tight">
                    Explore All Articles
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Browse our full library of playbooks, guides, and creator insights.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {explorePosts.map((post) => ( /* v425 (B2): only posts not shown above */
                  <Link
                    key={post.id}
                    to={`/blog/${post.slug}`}
                    className="group bg-white rounded-2xl border border-[#E5E5EA] p-4 flex flex-col justify-between hover:border-[#DDD6FE] hover:shadow-xs transition-all"
                  >
                    <div className="space-y-2.5">
                      <div className="aspect-[40/21] w-full rounded-xl overflow-hidden bg-[#F9F9FB] border border-[#F0F0F0]">
                        {post.cover_image_url ? (
                          <img
                            src={post.cover_image_url}
                            alt={post.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#F5F0FF] text-[#7C3AED]">
                            <BookOpen size={24} className="opacity-40" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#7C3AED]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]" />
                          <span>{post.category || "General"}</span>
                        </div>
                        <h4 className="text-sm font-bold text-[#0A0A0A] group-hover:text-[#7C3AED] transition-colors leading-snug line-clamp-2">
                          {post.title}
                        </h4>
                        {post.excerpt && (
                          <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
                            {post.excerpt}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-2.5 mt-2.5 border-t border-[#F5F5F7] text-[10px] text-[#8E8E93] flex items-center justify-between font-medium">
                      <span>{formatDate(post.published_at)}</span>
                      <span>{calculateReadTime(post.content)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* SECTION 4: PAGINATION CONTROLS */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4 pb-2">
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="w-11 h-11 rounded-full border border-[#E5E5EA] bg-white hover:bg-[#F5F0FF] hover:text-[#7C3AED] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xs font-bold text-[#0A0A0A] cursor-pointer"
                >
                  <ChevronLeft size={14} />
                </button>

                {pageList(page, totalPages).map((pageNum, i) => pageNum === "…" ? (
                  <span key={`gap-${i}`} className="w-6 text-center text-xs font-bold text-[#9CA3AF]">…</span>
                ) : (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-11 h-11 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      pageNum === page
                        ? "bg-[#7C3AED] text-white shadow-xs"
                        : "bg-white border border-transparent hover:border-[#DDD6FE] text-[#0A0A0A]"
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  className="w-11 h-11 rounded-full border border-[#E5E5EA] bg-white hover:bg-[#F5F0FF] hover:text-[#7C3AED] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-xs font-bold text-[#0A0A0A] cursor-pointer"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* SECTION 5: YBEX BRAND NEWSLETTER SUBSCRIPTION BANNER
                v334 (App Store 2.1 — no placeholder features): hidden until the newsletter really exists (the form
                saved nothing and only said "starts soon"). Set SHOW_NEWSLETTER = true when it is wired up. */}
            {SHOW_NEWSLETTER && <div className="rounded-3xl bg-gradient-to-br from-[#F5F0FF] via-white to-[#F5F0FF] border border-[#DDD6FE] text-[#0A0A0A] p-7 sm:p-9 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
              <div className="space-y-2 max-w-lg">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EDE9FE] text-[#7C3AED] text-xs font-bold border border-[#DDD6FE]">
                  <Mail size={12} /> YBEX Weekly Digest
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0A0A0A]">
                  Get high-ROI creator strategies delivered to your inbox
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Join marketing leaders, founders and creators reading our teardowns of viral campaigns, payout benchmarks, and creator economy trends.
                </p>
              </div>

              <form onSubmit={handleNewsletterSubmit} className="w-full md:w-auto flex flex-col sm:flex-row gap-2.5">
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Enter your work email..."
                  required
                  className="px-4 py-2.5 rounded-xl bg-white border border-[#DDD6FE] text-base sm:text-xs text-[#0A0A0A] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]/30 min-w-0 sm:min-w-[240px] shadow-xs" /* v332: 16px on phones, no 240px overflow */
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                >
                  <span>Subscribe Free</span> <ArrowRight size={13} />
                </button>
              </form>
            </div>}
          </>
        )}
      </div>
    </div>
  );
}
