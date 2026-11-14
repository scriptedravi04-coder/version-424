import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import TicketForm from "../../components/help/TicketForm";
import { Search, ChevronLeft, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown } from "lucide-react";

import { Presence } from "../../components/common/Popup";
import { OfflineAware } from "../../components/common/OfflineState"; // v334

// v334 (offline app): help articles are the same for everyone — the last list of each category is kept on the
// phone, so Help opens offline too.
const helpKey = (role, category, query) => `ybex_help:${role}:${category || ""}:${query || ""}`;
const saveHelp = (key, list) => { try { const t = JSON.stringify(list || []); if (t.length < 200 * 1024) localStorage.setItem(key, t); } catch { /* storage full / blocked */ } };
const readHelp = (key) => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return Array.isArray(v) ? v : null; } catch { return null; } };
export default function HelpCategory() {
  const { category } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const query = searchParams.get("q");
  
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [articles, setArticles] = useState([]);
  const [expandedId, setExpandedId] = useState(location.state?.expandedId || null);
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(query || "");
  // v332: "No articles found" flashed before the list loaded, and showed when loading failed.
  const [loadState, setLoadState] = useState("loading"); // loading | ok | error

  // v415: the Help Center tab you came from decides creator/brand articles (fallback: your account type)
  const accountRole = ["brand", "agency", "talent_manager"].includes(String(user?.role || "")) ? "brand" : "creator";
  const viewRole = location.state?.role === "brand" || location.state?.role === "creator" ? location.state.role : accountRole;
  const categoryNames = {
    payments: viewRole === "brand" ? "Payments & Billing" : "Payments & Earnings",
    campaigns: "Campaigns & Deals",
    kyc: "Profile & KYC",
    trust_safety: "Trust & Safety",
    search: "Search Results"
  };

  const currentCategoryName = categoryNames[category] || categoryNames.search;

  useEffect(() => {
    fetchArticles();
  }, [category, query, viewRole]);

  const fetchArticles = async () => {
    setLoadState("loading");
    const role = viewRole; // v332: agencies saw no articles; v415: follows the Help Center tab
    let q = supabase
      .from("faq_articles")
      .select("*")
      .eq("is_active", true);
      
    // Always filter by role unless it's a global search where we might want both
    q = q.in("target_role", [role, "both"]);
      
    if (category === "search" && query) {
      q = q.ilike("title", `%${query}%`);
    } else {
      q = q.eq("category", category);
    }
    
    try {
      const { data, error } = await q.order("view_count", { ascending: false });
      if (error) throw error;
      setArticles(data || []);
      setLoadState("ok");
      saveHelp(helpKey(role, category, query), data); // v334
    } catch {
      const saved = readHelp(helpKey(role, category, query)); // v334: offline → the saved articles
      setArticles(saved || []);
      setLoadState(saved ? "ok" : "error");
    }
  };

  const handleHelpful = async (id, currentCount, helped = true) => {
    // Optimistic update
    setArticles(prev => prev?.map(a => a.id === id ? { ...a, voted: true } : a));
    if (!helped) return; // v415: "No" no longer counted as a helpful vote
    try {
      await supabase
        .from("faq_articles")
        .update({ view_count: currentCount + 1 })
        .eq("id", id);
    } catch { /* the thank-you stays; the count is best-effort */ }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const q = searchQuery.trim(); // v415
    if (q) {
      navigate(`/help/category/search?q=${encodeURIComponent(q)}`, { state: { role: viewRole } });
    }
  };

  return (
    <div className="w-full max-w-none px-4 md:px-8 py-10">
      <Link to="/help" className="inline-flex items-center min-h-[40px] text-gray-600 hover:text-[#7C3AED] mb-6 font-medium transition-colors">
        <ChevronLeft className="w-4 h-4 mr-1" />
        Back to Help Center
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <h1 className="text-2xl font-bold break-words">{category === "search" && query ? `Results for “${query}”` : currentCategoryName}</h1>
        
        <form role="search" onSubmit={handleSearch} className="relative w-full md:w-64">
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Search help articles"
            placeholder="Search help articles"
            className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-300 focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] text-base sm:text-sm" /* v332: 16px on phones (no iPhone zoom) */
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 pointer-events-none" aria-hidden="true" />
        </form>
      </div>

      <div className="space-y-4">
        {loadState === "loading" ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : loadState === "error" ? (
          <OfflineAware onRetry={fetchArticles}>{/* v334: offline → OfflineState */}
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-gray-600 font-medium">Couldn't load help articles.</p>
            <button type="button" onClick={fetchArticles} className="mt-3 px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-semibold text-[#7C3AED] min-h-[40px]">Try again</button>
          </div>
          </OfflineAware>
        ) : articles.length === 0 ? (
          // v415: empty state with a next step
          <div className="text-center py-12 px-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-gray-700 font-medium">{category === "search" ? "No articles match your search." : "No articles in this topic yet."}</p>
            <p className="text-sm text-gray-500 mt-1">Our support team can help you directly.</p>
            <button type="button" onClick={() => setIsTicketFormOpen(true)} className="mt-4 min-h-[40px] px-5 rounded-lg bg-[#7C3AED] text-white text-sm font-semibold hover:bg-[#6D28D9] transition-colors">Contact support</button>
          </div>
        ) : (
          articles?.map((article, articleIdx) => {
            const isExpanded = expandedId === article.id;
            return (
              <div key={article.id || articleIdx} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : article.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="font-semibold text-gray-900 pr-4">{article.title}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  )}
                </button>
                
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                    <div className="prose max-w-none text-gray-700 whitespace-pre-wrap mb-6 text-sm leading-relaxed">
                      {article.content}
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-600 font-medium">Was this helpful?</span>
                        {!article.voted ? (
                          <>
                            <button
                              onClick={() => handleHelpful(article.id, article.view_count || 0)}
                              aria-label="Yes, this helped" /* v332 */
                              className="p-2.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleHelpful(article.id, article.view_count || 0, false)}
                              aria-label="No, this didn't help" /* v332 */
                              className="p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-sm text-emerald-600 font-medium">Thanks for your feedback!</span>
                        )}
                      </div>
                      
                      <button
                        onClick={() => setIsTicketFormOpen(true)}
                        className="text-sm text-[#7C3AED] hover:text-[#6D28D9] font-medium"
                      >
                        Still need help? Contact support
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Presence>{isTicketFormOpen && (
        <TicketForm key="ticketform" 
          onClose={() => setIsTicketFormOpen(false)} 
          initialCategory={category !== 'search' ? categoryNames[category] : ''} 
        />
      )}</Presence>
    </div>
  );
}
