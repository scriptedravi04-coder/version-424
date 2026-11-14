import React, { useState, useEffect, useRef } from 'react';
import { Edit3, Image as ImageIcon, Link as LinkIcon, Plus, X, Trash2 } from 'lucide-react';
import { CustomDatePicker } from '../ui/custom-date-picker';
import { api } from '../../lib/api';
import { toast } from 'sonner';

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import { APP_PAGES, toAppPath, AppPagePicker } from "./AdminPromoPopups"; // v368: same page list as promo popups (incl. Offers)
const BANNER_PAGE_VALUES = new Set(APP_PAGES.flatMap((g) => g.items.map(([, v]) => v)));

// v332: calm error text (never raw "Request failed with status code 500").
const calmError = (err, fallback) => {
  const m = err?.response?.data?.error || err?.response?.data?.detail;
  return typeof m === "string" && m && m.length < 160 ? m : fallback;
};

export default function BannerManager() {
  const [tab, setTab] = useState('Influencer');
  const [banners, setBanners] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  
  const [formData, setFormData] = useState({
    type: 'Influencer',
    placement: 'Dashboard Hero Carousel',
    link: '',
    status: 'Live',
    imgUrl: '',
    start_date: null,
    end_date: null
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [bannerToDelete, setBannerToDelete] = useState(null);
  const fileInputRef = useRef(null);
  const [loadState, setLoadState] = useState("loading"); // v332: "loading" | "ok" | "error"

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const { data } = await api.get('admin/banners', { bypassCache: true });
      setBanners(Array.isArray(data) ? data : []); // v332: removed a debug console.log
      setLoadState("ok");
    } catch (e) {
      console.warn("Failed to fetch banners", e);
      setLoadState((s) => (s === "ok" ? s : "error")); // v332: a failed load read "No active banners"
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleEditClick = (banner) => {
    setEditingBanner(banner);
    setFormData({
      type: banner.type || 'Influencer',
      placement: banner.placement || 'Dashboard Hero Carousel',
      link: banner.link || '',
      status: banner.status || 'Live',
      imgUrl: banner.imgUrl || '',
      start_date: banner.start_date || null,
      end_date: banner.end_date || null
    });
    setPreview(banner.imgUrl);
    setShowUploadModal(true);
  };

  const handleCloseModal = () => {
    setShowUploadModal(false);
    setEditingBanner(null);
    setFile(null);
    setPreview(null);
    setFormData({ 
      type: tab, 
      placement: 'Dashboard Hero Carousel', 
      link: '', 
      status: 'Live',
      imgUrl: '',
      start_date: null,
      end_date: null
    });
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Resize if too large (e.g. max 1200px width for banners)
        const MAX_WIDTH = 1200;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.8 quality to keep it well under 1MB
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(reader.result); // Fallback
    };
    reader.onerror = error => reject(error);
  });

  const handleUpload = async () => {
    if (!file && !formData.imgUrl) {
      toast.error("Please select an image");
      return;
    }
    
    // Enforce 5 banners max for Dashboard Hero Carousel per audience
    const existingCarouselBanners = banners.filter(b => b.placement === 'Dashboard Hero Carousel' && b.type === formData.type);
    if (!editingBanner && formData.placement === 'Dashboard Hero Carousel' && existingCarouselBanners.length >= 5) {
      toast.error(`Maximum 5 carousel banners allowed for ${formData.type}s. Please delete an existing one first.`);
      return;
    }

    try {
      setLoading(true);
      
      const submitData = {
        type: formData.type,
        placement: formData.placement,
        link: formData.link,
        status: formData.status,
      };

      if (formData.start_date) submitData.start_date = formData.start_date;
      if (formData.end_date) submitData.end_date = formData.end_date;
      
      if (file) {
        const base64 = await fileToBase64(file);
        submitData.imgUrl = base64;
      } else if (formData.imgUrl) {
        submitData.imgUrl = formData.imgUrl;
      }

      if (editingBanner) {
        await api.put(`/admin/banners/${editingBanner.id}`, submitData);
        toast.success("Banner updated successfully!");
      } else {
        await api.post('admin/banners', submitData);
        toast.success("Banner uploaded successfully!");
      }
      
      handleCloseModal();
      fetchBanners();
    } catch (err) {
      console.error(err);
      toast.error(calmError(err, editingBanner ? "Couldn't update the banner. Please try again." : "Couldn't upload the banner. Please try again.")); // v332
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (banner) => {
    const newStatus = banner.status === 'Live' ? 'Inactive' : 'Live';
    try {
      await api.put(`/admin/banners/${banner.id}`, { status: newStatus });
      toast.success(`Banner status updated to ${newStatus}`);
      fetchBanners();
    } catch (e) {
      toast.error(calmError(e, "Couldn't change the banner. Please try again.")); // v332
    }
  };

  const confirmDelete = (bannerOrId) => setBannerToDelete(bannerOrId);
  const handleDelete = async () => {
    const bannerOrId = bannerToDelete;
    setBannerToDelete(null);
    const bannerId = typeof bannerOrId === 'object' ? (bannerOrId?.id || bannerOrId?._id || bannerOrId?.banner_id) : bannerOrId;
    if (!bannerId) {
      toast.error("Couldn't find this banner. Please refresh and try again."); // v332
      return;
    }


    // Optimistically update UI so banner card disappears immediately
    setBanners(prev => prev.filter(b => (b.id !== bannerId && b._id !== bannerId && b.banner_id !== bannerId)));

    try {
      await api.delete(`/admin/banners/${bannerId}`);
      toast.success("Banner deleted successfully!");
      fetchBanners();
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error(calmError(e, "Couldn't delete the banner. Please try again.")); // v332
      fetchBanners(); // restore on error
    }
  };

  const filtered = banners.filter(b => b.type === tab);

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-default)] w-full md:w-auto">
             {['Common', 'Influencer', 'Brand'].map(t => (
                <button 
                  key={t}
                  onClick={() => {
                    setTab(t);
                    setFormData(prev => ({...prev, type: t}));
                  }}
                  className={`flex-1 md:flex-none px-2 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${tab === t ? 'bg-[#9D7CFF] text-[var(--text-primary)] shadow-md' : 'text-[var(--text-primary)]/60 hover:text-[var(--text-primary)]'}`}
                >
                  {t}<span className="hidden sm:inline"> Banners</span>{/* v332: fits a 320px phone */}
                </button>
             ))}
          </div>
          <button onClick={() => setShowUploadModal(true)} className="w-full md:w-auto px-4 py-2 bg-[var(--text-primary)] text-[var(--bg-base)] font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors hover:bg-[var(--bg-elevated)]">
             <Plus size={16}/> Upload New Banner
          </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((b, idx) => (
             <div key={`banner-${b.id || b.imgUrl || idx}`} className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl overflow-hidden group relative">
                <div className="relative aspect-[3/1] bg-[var(--bg-elevated)]">
                   {b.imgUrl ? <img src={b.imgUrl} alt="Banner" className="w-full h-full object-cover" /> : null}{/* v332: no broken image */}
                   <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur border border-[var(--border-default)] rounded-md text-[10px] font-bold uppercase text-[var(--text-primary)] tracking-widest">
                      {b.placement}
                   </div>
                   {b.status === 'Live' && (
                      <div className="absolute top-3 right-3 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse"></div>
                   )}
                </div>
                <div className="p-4 bg-[var(--bg-card)] flex items-center justify-between">
                   <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold flex items-center gap-2">
                         Status: <span className={b.status === 'Live' ? 'text-green-400' : 'text-amber-400'}>{b.status}</span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-1 truncate max-w-[160px]" title={b.link}>
                        {b.link ? b.link : "No redirect link"}
                      </div>
                   </div>
                   <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => handleToggleStatus(b)} 
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors ${b.status === 'Live' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'}`}
                        title={b.status === 'Live' ? 'Pause Banner' : 'Publish Live'}
                      >
                        {b.status === 'Live' ? 'Pause' : 'Activate'}
                      </button>
                      <button 
                        onClick={() => handleEditClick(b)} 
                        className="text-blue-400 hover:text-blue-300 transition-colors p-2 bg-blue-400/10 rounded-lg"
                        title="Edit Banner"
                        aria-label="Edit banner" /* v332 */
                      >
                        <Edit3 size={16}/>
                      </button>
                      <button 
                        onClick={() => confirmDelete(b)} 
                        className="text-red-400 hover:text-red-300 transition-colors p-2 bg-red-400/10 rounded-lg"
                        title="Delete Banner"
                        aria-label="Delete banner" /* v332 */
                      >
                        <Trash2 size={16}/>
                      </button>
                   </div>
                </div>
             </div>
          ))}
          {filtered.length === 0 && (
             <div className="col-span-full py-12 text-center text-[var(--text-tertiary)] border border-dashed border-[var(--border-default)] rounded-2xl">
                {/* v332: loading / failed load are not "no banners" */}
                {loadState === "loading" ? "Loading banners…" : loadState === "error" ? <span className="text-red-600">Couldn't load banners. <button type="button" onClick={fetchBanners} className="underline font-semibold">Try again</button></span> : "No banners in this category yet."}
             </div>
          )}
       </div>

       <Presence>{bannerToDelete && (
          <PopupBackdrop className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-6 text-center">
                <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Trash2 size={24} />
                </div>
                <h3 className="text-lg font-bold mb-2">Delete Banner?</h3>
                <p className="text-[var(--text-secondary)] text-sm mb-6">Are you sure you want to delete this banner? This action cannot be undone.</p>
                <div className="flex gap-3">
                   <button onClick={() => setBannerToDelete(null)} className="flex-1 py-2 rounded-xl font-medium bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-default)] transition-colors">Cancel</button>
                   <button onClick={handleDelete} className="flex-1 py-2 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
                </div>
             </PopupPanel>
          </PopupBackdrop>
       )}</Presence>

       <Presence>{showUploadModal && (
          <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-lg rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
                <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center">
                   <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                      <ImageIcon size={18}/> {editingBanner ? 'Edit Banner' : 'Upload Banner'}
                   </h3>
                   <button onClick={handleCloseModal} aria-label="Close" className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20}/></button>{/* v332 */}
                </div>
                <div className="p-5 space-y-4">
                   <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                   
                   <div 
                     onClick={() => fileInputRef.current?.click()}
                     className="border-2 border-dashed border-[var(--border-default)] rounded-xl p-8 text-center flex flex-col items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] relative overflow-hidden"
                     style={{ minHeight: '140px' }}
                   >
                      {preview ? (
                        <img src={preview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <>
                          <ImageIcon size={32} className="mb-2 opacity-50" />
                          <div className="text-sm font-semibold">Click to upload image</div>
                          <div className="text-xs mt-1 text-[var(--text-secondary)]">Size: 1200 x 400 pixels (3:1 aspect ratio)</div>
                          <div className="text-[11px] text-[#A78BFA] mt-0.5 font-medium">Fits edge-to-edge on mobile and desktop with zero cutoff</div>
                        </>
                      )}
                   </div>

                   <div>
                      <div>
                         <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">Target Audience</label>
                         <select 
                           value={formData.type}
                           onChange={(e) => setFormData({...formData, type: e.target.value})}
                           className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-[16px] sm:text-sm focus:outline-none focus:border-[#9D7CFF]" /* v332: no iOS zoom */
                         >
                            <option value="Common">Common (New Users)</option>
                            <option value="Influencer">Influencers</option>
                            <option value="Brand">Brands</option>
                         </select>
                      </div>
                   </div>

                   <div>
                      <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">Click-Through URL</label>
                      {/* v368: pick an app page (incl. the Offer page) instead of typing a web link — a full https://ybexapp… link opened a browser tab inside the app */}
                      {/* v378: same picker as Promo popups / Push — search + page list + "Other link" */}
                      <AppPagePicker value={formData.link || ""} onChange={(v) => setFormData((fd) => ({ ...fd, link: v }))} testId="banner-page-picker"
                        otherInput={(box) => <input className={box} value={formData.link || ""} onChange={(e) => setFormData((fd) => ({ ...fd, link: toAppPath(e.target.value) }))} placeholder="https://…  or an app page like /refer" />} />
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">Start Date</label>
                         <CustomDatePicker 
                           date={formData.start_date} 
                           setDate={(d) => setFormData(prev => ({ ...prev, start_date: d }))} 
                           className="w-full bg-[var(--bg-elevated)] border-[var(--border-default)] px-3 py-2 h-auto text-xs" 
                           placeholder="Start date"
                         />
                      </div>
                      <div>
                         <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">End Date</label>
                         <CustomDatePicker 
                           date={formData.end_date} 
                           setDate={(d) => setFormData(prev => ({ ...prev, end_date: d }))} 
                           className="w-full bg-[var(--bg-elevated)] border-[var(--border-default)] px-3 py-2 h-auto text-xs" 
                           placeholder="End date"
                         />
                      </div>
                   </div>
                </div>
                <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-card)] flex justify-end gap-3">
                   <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-[var(--text-primary)]/60 hover:text-[var(--text-primary)]">Cancel</button>
                   <button 
                     onClick={handleUpload} 
                     disabled={loading}
                     className="px-5 py-2 bg-[#9D7CFF] hover:bg-[#8B6BE0] text-[var(--text-primary)] text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                   >
                     {loading ? 'Processing...' : (editingBanner ? 'Update Banner' : 'Save & Publish')}
                   </button>
                </div>
             </PopupPanel>
          </PopupBackdrop>
       )}</Presence>
    </div>
  );
}
