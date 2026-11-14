import React from "react";
import { Edit3, Plus, Trash2, Video, ExternalLink } from "lucide-react";
import VideoEmbedPreview from "../../../components/shared/VideoEmbedPreview";
import { parseItem, groupByBrand, groupLine } from "../../../components/portfolio/portfolioModel"; // v366
import { Cover, StatChip, BrandInitial } from "../../../components/portfolio/PortfolioParts"; // v366


// Session 49 (clean-up): moved out of CreatorSettings.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
// v366 (Ravi: desktop portfolio still showed the old list without covers): same data as the new phone portfolio —
// items grouped by brand, the saved cover (our own copy) on each card, views / likes chip. Edit / delete still use the
// item's position in profile.portfolio (kept as `idx` while grouping).
export default function PortfolioList(props) {
  const { handleDeletePortfolioItem, handleOpenAddPortfolioModal, handleOpenEditPortfolioModal, profile } = props;
  const raw = profile.portfolio || [];
  const parsed = raw.map((x, idx) => { const it = parseItem(x, idx); return it ? { ...it, _idx: idx, _raw: x } : null; }).filter(Boolean);
  const groups = groupByBrand(parsed);
  return (
    <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      Delivered Videos & Deliverables ({(profile.portfolio || []).length})
                    </h4>
                    {(profile.portfolio || []).length > 0 && (
                      <button
                        onClick={handleOpenAddPortfolioModal}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--violet)] hover:bg-[var(--violet-dark)] text-white text-xs font-extrabold rounded-xl transition-all shadow-xs"
                      >
                        <Plus size={14} /> Add Video / Link
                      </button>
                    )}
                  </div>

                  {parsed.length > 0 ? (
                    <div className="space-y-8" data-testid="desktop-portfolio-groups">
                      {groups.map((g) => (
                        <div key={g.key} className="space-y-3">
                          <div className="flex items-center gap-2.5">
                            <BrandInitial name={g.brand} size={28} />
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold text-slate-900 truncate">{g.brand}</div>
                              <div className="text-[11px] font-semibold text-slate-500">{groupLine(g)}</div>
                            </div>
                          </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {g.items.map((it) => {
                        const idx = it._idx;
                        const item = (it._raw && typeof it._raw === "object") ? { ...it._raw, ...it } : it;
                        const itemUrl = item.content_url || item.url || item.link || "";
                        const itemTitle = item.title || item.brand_name || "Deliverable";
                        return (
                          <div 
                            key={item.id || idx}
                            className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-md hover:border-[#DDD6FE] transition-all flex flex-col justify-between group"
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase bg-[#F5F0FF] text-[var(--violet)] px-2.5 py-1 rounded-md">
                                  {item.brand_name || item.brand || "Sample work"}{/* v332: no invented "Brand Deal" */}
                                </span>
                                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleOpenEditPortfolioModal(idx)}
                                    aria-label="Edit item"
                                    className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"
                                    title="Edit item"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePortfolioItem(idx)}
                                    aria-label="Delete item"
                                    className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                                    title="Delete item"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              {item.title && (
                                <h5 className="font-extrabold text-xs text-slate-900 line-clamp-2">{item.title}</h5>
                              )}

                              {/* v366: saved cover first (Instagram links expire); no cover → the embedded player as before */}
                              {item.cover ? (
                                <Cover src={item.cover} alt={itemTitle} className="w-full aspect-[4/5] rounded-xl">
                                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent flex justify-end">
                                    <StatChip item={item} />
                                  </div>
                                </Cover>
                              ) : (
                                <VideoEmbedPreview url={itemUrl} title={itemTitle} watermark={false} isApproved={true} />
                              )}

                              {item.description && (
                                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            {itemUrl && (
                              <div className="pt-3 border-t border-slate-100 mt-3">
                                <a
                                  href={itemUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-[#F5F0FF] text-slate-700 hover:text-[var(--violet)] text-xs font-bold rounded-xl border border-slate-200/60 transition-colors"
                                >
                                  <ExternalLink size={12} /> Open Original Link
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50/60 border border-dashed border-slate-200 rounded-3xl p-10 text-center space-y-3">
                      <Video size={36} className="text-slate-300 mx-auto" />
                      <h4 className="font-extrabold text-sm text-slate-700">No Portfolio Videos Added Yet</h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                        Add your YouTube links, Instagram Reels, Google Drive videos, or campaign work to stand out to brands!
                      </p>
                      <button
                        onClick={handleOpenAddPortfolioModal}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-dark)] text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                      >
                        <Plus size={16} /> Add First Portfolio Link
                      </button>
                    </div>
                  )}
                </div>
  );
}
