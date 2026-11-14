import React, { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { Plus, Trash2, Image as ImageIcon, MessageSquare, Briefcase, CheckCircle2 } from "lucide-react";
import { shrinkImageFile } from "../../lib/shrinkImage";

export default function LandingContentManager() {
  const [brands, setBrands] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("brands");
  const [loadError, setLoadError] = useState(false); // v332: a failed load read "No brands added yet."
  const [saving, setSaving] = useState(false); // v332: no double "Add"

  const [newBrand, setNewBrand] = useState({ name: "", logo_url: "" });
  const [newReview, setNewReview] = useState({
    author_name: "", author_role: "", author_image: "", content: "",
    category: "", highlight_text: "", highlight_color: "purple", type: "creator", rating: 5
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const [brandsRes, reviewsRes] = await Promise.all([
        api.get("/admin/landing-brands", { bypassCache: true }),
        api.get("/admin/landing-reviews", { bypassCache: true })
      ]);
      setBrands(Array.isArray(brandsRes.data) ? brandsRes.data : []);
      setReviews(Array.isArray(reviewsRes.data) ? reviewsRes.data : []);
    } catch (err) {
      setLoadError(true); // v332
      toast.error("Couldn't load the landing page content. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fileInputRef = useRef(null);

  const brandFileInputRef = useRef(null);
  
  const uploadToStorage = async (picked, folder) => {
    const file = await shrinkImageFile(picked); // Session 31: small WebP before upload
    const ext = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    
    // Upload to brand-logos bucket
    const { data, error } = await supabase.storage
      .from('brand-logos')
      .upload(fileName, file, { upsert: false });
      
    if (error) {
      throw error;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('brand-logos')
      .getPublicUrl(fileName);
      
    return publicUrl;
  };

  const handleBrandFileChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // v332: picking the same file again works
    if (file) {
      const toastId = toast.loading("Uploading logo...");
      try {
        const url = await uploadToStorage(file, 'landing');
        setNewBrand((b) => ({ ...b, logo_url: url }));
        toast.success("Logo uploaded!", { id: toastId });
      } catch (err) {
        console.error(err);
        toast.error("Couldn't upload the image. Please try again.", { id: toastId }); // v332: the "Uploading…" toast used to spin forever
      }
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // v332
    if (file) {
      const toastId = toast.loading("Uploading avatar...");
      try {
        const url = await uploadToStorage(file, 'landing');
        setNewReview((r) => ({ ...r, author_image: url }));
        toast.success("Avatar uploaded!", { id: toastId });
      } catch (err) {
        console.error(err);
        toast.error("Couldn't upload the image. Please try again.", { id: toastId }); // v332
      }
    }
  };

  const handleAddBrand = async (e) => {
    e.preventDefault();
    if (!newBrand.name || !newBrand.logo_url) {
      toast.error("Please add a brand name and a logo.");
      return;
    }
    if (saving) return; // v332
    setSaving(true);
    try {
      await api.post("/admin/landing-brands", newBrand);
      toast.success("Brand added!");
      setNewBrand({ name: "", logo_url: "" });
      fetchData();
    } catch (err) {
      const m = err?.response?.data?.detail || err?.response?.data?.error;
      toast.error(typeof m === "string" && m && m.length < 160 ? m : "Couldn't add the brand. Please try again."); console.error(err); // v332: no raw tech text
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBrand = async (id) => {
    if (!window.confirm("Remove this brand from the landing page?")) return; // v332: one tap used to delete
    try {
      await api.delete(`/admin/landing-brands/${id}`);
      toast.success("Brand deleted!");
      fetchData();
    } catch (err) {
      toast.error("Couldn't delete the brand. Please try again.");
    }
  };

  const handleAddReview = async (e) => {
    e.preventDefault();
    if (!newReview.author_name || !newReview.content) {
      toast.error("Please fill at least author name and content");
      return;
    }
    if (saving) return; // v332
    setSaving(true);
    try {
      // Session 31: the server answers with an error when the database save fails — show it.
      const { data } = await api.post("/admin/landing-reviews", newReview);
      if (data?.warning) toast.warning(data.warning, { duration: 10000 });
      else toast.success("Review added!");
      setNewReview({
        author_name: "", author_role: "", author_image: "", content: "",
        category: "", highlight_text: "", highlight_color: "purple", type: "creator", rating: 5
      });
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.error || "The review was NOT saved. Please try again.", { duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReview = async (id) => {
    if (!window.confirm("Remove this review from the landing page?")) return; // v332
    try {
      await api.delete(`/admin/landing-reviews/${id}`);
      toast.success("Review deleted!");
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.error || "The review was NOT deleted. Please try again.", { duration: 10000 });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-gray-200 overflow-x-auto">{/* v332: no overflow on phones */}
        <button
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "brands" ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setActiveTab("brands")}
        >
          <div className="flex items-center gap-2"><Briefcase size={16} /> Marquee Brands</div>
        </button>
        <button
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "reviews" ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setActiveTab("reviews")}
        >
          <div className="flex items-center gap-2"><MessageSquare size={16} /> Testimonials & Reviews</div>
        </button>
      </div>

      {activeTab === "brands" && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm h-fit">
            <h3 className="font-semibold text-gray-900 mb-4">Add New Brand</h3>
            <form onSubmit={handleAddBrand} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                <input
                  type="text"
                  value={newBrand.name}
                  onChange={e => setNewBrand({ ...newBrand, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  placeholder="e.g. Nykaa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo (URL or Upload)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBrand.logo_url}
                    onChange={e => setNewBrand({ ...newBrand, logo_url: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    placeholder="https://..."
                  />
                  <input
                    type="file"
                    accept="image/*"
                    ref={brandFileInputRef}
                    onChange={handleBrandFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => brandFileInputRef.current?.click()}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-2"
                  >
                    <ImageIcon size={16} />
                    Upload
                  </button>
                </div>
                {newBrand.logo_url && newBrand.logo_url && (newBrand.logo_url.startsWith('http') || newBrand.logo_url.startsWith('data:image')) && (
                  <div className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                     <CheckCircle2 size={12} /> Image ready{/* v332: also shows for a typed link, so not "uploaded" */}
                  </div>
                )}
              </div>
              <button type="submit" disabled={saving} className="disabled:opacity-60 w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded-lg flex justify-center items-center gap-2">
                <Plus size={18} /> Add Brand
              </button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-4">
            <h3 className="font-semibold text-gray-900">Active Brands ({brands.length})</h3>
            {loading ? <p className="text-gray-500">Loading...</p> : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
                {brands.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">{loadError ? <span className="text-red-600">Couldn't load brands. <button type="button" onClick={fetchData} className="underline font-semibold">Try again</button></span> : "No brands added yet."}</div>
                ) : brands.map(brand => (
                  <div key={brand.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full border border-gray-100 overflow-hidden flex items-center justify-center bg-gray-50">
                        {brand.logo_url ? <img src={brand.logo_url} className="w-8 h-8 object-contain" alt={brand.name} /> : <ImageIcon className="text-gray-300" />}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{brand.name}</p>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteBrand(brand.id)} aria-label={`Delete ${brand.name || "brand"}`} /* v332 */ className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "reviews" && (
        <div className="grid xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm h-fit">
            <h3 className="font-semibold text-gray-900 mb-4">Add New Review</h3>
            <form onSubmit={handleAddReview} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Author Name</label>
                  <input
                    type="text"
                    value={newReview.author_name}
                    onChange={e => setNewReview({ ...newReview, author_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={newReview.type}
                    onChange={e => setNewReview({ ...newReview, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="creator">Creator</option>
                    <option value="brand">Brand</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Star rating</label>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={newReview.rating === n}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      onClick={() => setNewReview({ ...newReview, rating: n })}
                      className={`text-2xl leading-none px-0.5 ${n <= (newReview.rating || 5) ? "text-amber-400" : "text-gray-300"}`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="ml-2 text-xs text-gray-500">{newReview.rating || 5} / 5</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Author Role/Handle</label>
                <input
                  type="text"
                  value={newReview.author_role}
                  onChange={e => setNewReview({ ...newReview, author_role: e.target.value })}
                  placeholder="@handle • City"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Author Avatar (URL or Upload)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newReview.author_image}
                    onChange={e => setNewReview({ ...newReview, author_image: e.target.value })}
                    placeholder="Enter URL or upload image"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-2"
                  >
                    <ImageIcon size={16} />
                    Upload
                  </button>
                </div>
                {newReview.author_image && newReview.author_image && (newReview.author_image.startsWith('http') || newReview.author_image.startsWith('data:image')) && (
                  <div className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                     <CheckCircle2 size={12} /> Image ready
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Review Content</label>
                <textarea
                  value={newReview.content}
                  onChange={e => setNewReview({ ...newReview, content: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Niche/Category Label</label>
                <input
                  type="text"
                  value={newReview.category}
                  onChange={e => setNewReview({ ...newReview, category: e.target.value })}
                  placeholder="e.g. Beauty & Fashion"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Highlight Text</label>
                  <input
                    type="text"
                    value={newReview.highlight_text}
                    onChange={e => setNewReview({ ...newReview, highlight_text: e.target.value })}
                    placeholder="e.g. ₹50k Earned"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Highlight Color</label>
                  <select
                    value={newReview.highlight_color}
                    onChange={e => setNewReview({ ...newReview, highlight_color: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="purple">Purple</option>
                    <option value="green">Green</option>
                    <option value="blue">Blue</option>
                  </select>
                </div>
              </div>

              <button type="submit" disabled={saving} className="disabled:opacity-60 w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded-lg flex justify-center items-center gap-2">
                <Plus size={18} /> Add Review
              </button>
            </form>
          </div>

          <div className="xl:col-span-2 space-y-4">
            <h3 className="font-semibold text-gray-900">Active Reviews ({reviews.length})</h3>
            {loading ? <p className="text-gray-500">Loading...</p> : (
              <div className="grid md:grid-cols-2 gap-4">
                {reviews.length === 0 ? (
                  <div className="col-span-2 p-6 text-center bg-white rounded-2xl border border-gray-100 text-gray-500">{loadError ? <span className="text-red-600">Couldn't load reviews. <button type="button" onClick={fetchData} className="underline font-semibold">Try again</button></span> : "No reviews added yet."}</div>
                ) : reviews.map(review => (
                  <div key={review.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col relative">
                    <button onClick={() => handleDeleteReview(review.id)} aria-label="Delete review" /* v332 */ className="absolute top-4 right-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                    <div className="flex items-center gap-3 mb-4">
                      <img src={review.author_image || "https://ui-avatars.com/api/?name="+encodeURIComponent(review.author_name)} className="w-10 h-10 rounded-full bg-gray-100 object-cover" alt="" />
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{review.author_name}</p>
                        <p className="text-xs text-gray-500">{review.author_role}</p>
                      </div>
                    </div>
                    {(() => { const r = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 5))); return ( /* v332: a rating above 5 crashed this list ("★".repeat of a negative) */
                    <p className="text-amber-400 text-sm mb-1" aria-label={`${r} out of 5 stars`}>{"★".repeat(r)}<span className="text-gray-300">{"★".repeat(5 - r)}</span></p>
                    ); })()}
                    <p className="text-gray-700 text-sm italic mb-4 flex-1">"{review.content}"</p>
                    <div className="flex items-center justify-between border-t border-gray-50 pt-3 mt-auto">
                      <span className="text-xs font-medium text-gray-500 truncate max-w-[120px]">{review.category}</span>
                      {review.highlight_text && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                          review.highlight_color === 'green' ? 'bg-emerald-50 text-emerald-700' :
                          review.highlight_color === 'blue' ? 'bg-blue-50 text-blue-700' :
                          'bg-purple-50 text-purple-700'
                        }`}>
                          {review.highlight_text}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
