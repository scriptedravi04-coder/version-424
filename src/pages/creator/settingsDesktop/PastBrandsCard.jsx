import React from "react";
import { X, HeartHandshake } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorSettings.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function PastBrandsCard(props) {
  const { handleAddPastBrand, handleRemovePastBrand, newBrandInput, profile, setNewBrandInput } = props;
  return (
    <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <HeartHandshake size={16} className="text-[var(--violet)]" /> Trusted Past Brand Collaborations
                    </h4>
                    <span className="text-[10px] font-bold text-slate-500">
                      {(profile.pastBrands || []).length} {(profile.pastBrands || []).length === 1 ? "Brand" : "Brands"} Listed{/* v332: "1 Brands" */}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(profile.pastBrands || []).map((brand, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-800 rounded-xl text-xs font-extrabold shadow-2xs group hover:border-red-200 transition-all"
                      >
                        {brand}
                        <button 
                          onClick={() => handleRemovePastBrand(brand)}
                          aria-label={`Remove ${brand}`} /* v332: icon-only button */
                          className="text-slate-500 hover:text-red-500 p-1.5 -m-1 rounded-md transition-colors"
                          title="Remove brand"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {(profile.pastBrands || []).length === 0 && (
                      <p className="text-xs text-slate-500 italic">No past brand tags added yet.</p>
                    )}
                  </div>

                  {/* Add brand input */}
                  <div className="flex items-center gap-2 max-w-md pt-1">
                    <input
                      type="text"
                      placeholder="Enter brand name (e.g. Nykaa, Mamaearth, Puma)"
                      value={newBrandInput}
                      onChange={(e) => setNewBrandInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddPastBrand();
                        }
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-[var(--violet)] shadow-2xs"
                    />
                    <button
                      onClick={handleAddPastBrand}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors shadow-2xs"
                    >
                      Add Tag
                    </button>
                  </div>
                </div>
  );
}
