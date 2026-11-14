import React, { useState, useEffect, useMemo } from 'react';
import AdminPromoPopups from './AdminPromoPopups';
import AdminReferralProgram from "./AdminReferralProgram";
import { formatAmount, safeLower, safeUpper } from "../../utils/safeFormat";
import { Wrench, RadioReceiver, Ticket, Share2, DollarSign, Image as ImageIcon, Search, Plus, X, Trash2, Clock, AlertTriangle, ChevronRight, Megaphone, Users } from 'lucide-react';
import FollowerLimitCard from './FollowerLimitCard'; // v397: Creator sign-up tab
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { allowedSettingsTabs } from '../../lib/adminPermissions';
import { toast } from 'sonner';
import BannerManager from './BannerManager';
import LandingContentManager from './LandingContentManager';
import SpeedReport from './SpeedReport';
import WhatsNewManager, { HiwVideosManager } from './WhatsNewManager';

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import BroadcastEmailCard from "./platformTools/BroadcastEmailCard";
import CouponList from "./platformTools/CouponList";
import FeesSettingsCard from "./platformTools/FeesSettingsCard";
import MaintenanceCard from "./platformTools/MaintenanceCard";

// v332: calm error text (never raw "Request failed with status code 500").
const calmError = (err, fallback) => {
  const m = err?.response?.data?.error || err?.response?.data?.detail;
  return typeof m === "string" && m && m.length < 160 ? m : fallback;
};

export default function PlatformTools({ forcedView, embedded = false } = {}) { // v419: embedded = one tool inside a hub page (no own header / search / tab bar)
  // v294 (Ravi): a sub-admin sees only the Platform Settings tabs the super admin ticked.
  const { user: authUser } = useAuth() || {};
  const allowedTabs = allowedSettingsTabs(authUser);
  // Session 38: the dashboard To-do card opens Referrals directly (/admin?tab=settings&view=referrals).
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const v = forcedView || new URLSearchParams(window.location.search).get('view');
      if (v === 'messages') return 'whats-new'; // old links
      if (v === 'hiw-videos' && authUser?.role === 'admin' && authUser?.team_role !== 'sub_admin') return 'hiw-videos'; // v436: full admins (Developer)
      const want = ['broadcast', 'maintenance', 'fees', 'coupons', 'referrals', 'whats-new', 'promos', 'banners', 'landing', 'speed', 'signup'].includes(v) ? v : 'maintenance'; // v396: every tab can be linked (admin search); v397 + signup
      return allowedTabs.includes(want) ? want : (allowedTabs[0] || want);
    } catch { return 'maintenance'; }
  }); // 'maintenance' | 'fees' | 'coupons' | 'referrals' | 'messages' | 'banners'
  const [searchQuery, setSearchQuery] = useState('');

  // Maintenance State
  const [maintenanceCreator, setMaintenanceCreator] = useState(false);
  const [maintenanceBrand, setMaintenanceBrand] = useState(false);
  const [autoOffCreator, setAutoOffCreator] = useState('');
  const [autoOffBrand, setAutoOffBrand] = useState('');
  const [typedMessage, setTypedMessage] = useState('');
  const [enabledBy, setEnabledBy] = useState('');
  const [enabledAt, setEnabledAt] = useState('');
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [confirmData, setConfirmData] = useState({ type: null, currentVal: false, autoOffHours: '' });

  // Fees & Risk Controls State
  const [feeConfig, setFeeConfig] = useState({
    threshold_amount: 20000,
    below_threshold_rate: 15.0,
    above_threshold_rate: 5.0,
    gst_rate: 18.0,
    platform_gst_registered: false,
    platform_gstin: '',
    ugc_commission_pct: 10.0,
    min_withdrawal_amount: 1000,
    withdrawal_fee_rate: 0,
    payout_freeze_all: false,
    dispute_refund_window_days: 7,
    min_campaign_budget: 500,
    max_campaign_budget: 1000000,
    fee_model: 'split', creator_fee_pct: 0, brand_fee_pct: 8, // v364
  });
  const [originalFeeConfig, setOriginalFeeConfig] = useState({});
  const [savingFees, setSavingFees] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);

  // Coupons State
  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [couponForm, setCouponForm] = useState({
    code: '',
    type: 'zero_fee', // 'zero_fee' | 'flat_discount'
    discount_amount: 200,
    applies_to: 'creator', // 'creator' | 'brand'
    usage_limit: 100,
    per_user_limit: '', // v366: empty = no limit
    valid_from: new Date().toISOString().slice(0, 10),
    valid_until: '',
    min_campaign_value: 1000,
    status: 'active'
  });
  const [viewRedemptionsModal, setViewRedemptionsModal] = useState(null);
  const [couponRedemptions, setCouponRedemptions] = useState([]);
  const [deleteConfirmCoupon, setDeleteConfirmCoupon] = useState(null);
  const [deletingCoupon, setDeletingCoupon] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false); // v332: no double "Save Coupon"

  // Referrals State
  const [referralConfig, setReferralConfig] = useState({
    creator_referral_reward: 500,
    brand_referral_reward: 1000,
    referral_trigger_action: 'first_completed_collab',
    referral_monthly_cap: 10,
    referral_enabled: true
  });
  const [referralsActivity, setReferralsActivity] = useState([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [savingReferralConfig, setSavingReferralConfig] = useState(false);

  // Resend Broadcast Email State
  const [broadcastAudience, setBroadcastAudience] = useState('all');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastHeading, setBroadcastHeading] = useState('');
  const [broadcastBodyText, setBroadcastBodyText] = useState('');
  const [broadcastCtaLabel, setBroadcastCtaLabel] = useState('Explore Ybex Dashboard');
  const [broadcastCtaUrl, setBroadcastCtaUrl] = useState('/');
  const [broadcastReportKey, setBroadcastReportKey] = useState(0);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Load All Initial Data
  const loadSystemStatus = async () => {
    try {
      const { data } = await api.get("system-status");
      if (data) {
        setMaintenanceCreator(!!data.maintenance_mode_creator);
        setMaintenanceBrand(!!data.maintenance_mode_brand);
        setTypedMessage(data.message || '');
        setEnabledBy(data.enabled_by || '');
        setEnabledAt(data.enabled_at || '');
      }
    } catch (e) {
      console.warn("Failed to fetch system status:", e);
    }
  };

  const loadFeeConfig = async () => {
    try {
      const { data } = await api.get("admin/fee-config");
      if (data) {
        const loaded = {
          threshold_amount: data.threshold_amount ?? 20000,
          below_threshold_rate: data.below_threshold_rate ?? 15.0,
          above_threshold_rate: data.above_threshold_rate ?? 5.0,
          gst_rate: data.gst_rate ?? 18.0,
          platform_gst_registered: !!data.platform_gst_registered,
          platform_gstin: data.platform_gstin || '',
          ugc_commission_pct: data.ugc_commission_pct ?? 10.0,
          min_withdrawal_amount: data.min_withdrawal_amount ?? 1000,
          withdrawal_fee_rate: data.withdrawal_fee_rate ?? 0,
          payout_freeze_all: !!data.payout_freeze_all,
          dispute_refund_window_days: data.dispute_refund_window_days ?? 7,
          min_campaign_budget: data.min_campaign_budget ?? 500,
          max_campaign_budget: data.max_campaign_budget ?? 1000000,
          // v364: split fee
          fee_model: data.fee_model === 'split' ? 'split' : 'legacy',
          creator_fee_pct: data.creator_fee_pct ?? 0,
          brand_fee_pct: data.brand_fee_pct ?? 0,
        };
        setFeeConfig(loaded);
        setOriginalFeeConfig(loaded);
      }
    } catch (e) {
      console.warn("Failed to fetch fee config:", e);
    }
  };

  const loadCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const { data } = await api.get("admin/coupons");
      setCoupons(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("Failed to fetch coupons:", e);
    } finally {
      setLoadingCoupons(false);
    }
  };

  const loadReferrals = async () => {
    setLoadingReferrals(true);
    try {
      const { data } = await api.get("admin/referrals");
      if (data) {
        if (data.config) {
          setReferralConfig({
            creator_referral_reward: data.config.creator_referral_reward ?? 500,
            brand_referral_reward: data.config.brand_referral_reward ?? 1000,
            referral_trigger_action: data.config.referral_trigger_action || 'first_completed_collab',
            referral_monthly_cap: data.config.referral_monthly_cap ?? 10,
            referral_enabled: data.config.referral_enabled !== false
          });
        }
        setReferralsActivity(Array.isArray(data.activity) ? data.activity : []);
      }
    } catch (e) {
      console.warn("Failed to fetch referrals:", e);
    } finally {
      setLoadingReferrals(false);
    }
  };

  useEffect(() => {
    // v294: only ask the server for what this person may open (a designer with Banners only gets no 403s).
    if (allowedTabs.includes('maintenance')) loadSystemStatus();
    if (allowedTabs.includes('fees')) loadFeeConfig();
    if (allowedTabs.includes('coupons')) loadCoupons();
    if (allowedTabs.includes('referrals')) loadReferrals();
    // Session 43: version drafts are no longer shown (What's new replaced them).
  }, [allowedTabs.join(',')]);

  // v294: if the open tab is not allowed (link, search, late login load), move to the first allowed one.
  useEffect(() => {
    if (allowedTabs.length && !allowedTabs.includes(activeTab) && activeTab !== 'hiw-videos') setActiveTab(allowedTabs[0]); // v436: How it works is checked on its own (full admins)
  }, [allowedTabs.join(','), activeTab]);

  // Universal Search Index Definitions
  const searchIndex = useMemo(() => [
    { tab: 'signup', title: 'Minimum followers to join', desc: 'New creators below this see the work-link page (0 = no limit)' }, // v397
    { tab: 'maintenance', title: 'Creator Maintenance Mode', desc: 'Toggle platform access lock for Creator users' },
    { tab: 'maintenance', title: 'Brand Maintenance Mode', desc: 'Toggle platform access lock for Brand users' },
    { tab: 'maintenance', title: 'Maintenance Custom Message', desc: 'Message displayed during scheduled maintenance' },
    { tab: 'fees', title: 'Fee Threshold Amount', desc: 'Deal size where the lower fee rate starts' }, // v332: had made-up "₹50,000 / 10% / 8%"
    { tab: 'fees', title: 'Below Threshold Fee Rate (%)', desc: 'Creator platform deduction rate for deals under threshold' },
    { tab: 'fees', title: 'Above Threshold Fee Rate (%)', desc: 'Creator platform deduction rate for deals over threshold' },
    { tab: 'fees', title: 'GST Taxation Rate (%)', desc: 'GST percentage applied on platform fee deduction' },
    { tab: 'fees', title: 'Platform GSTIN Registration', desc: 'GST registration status and GSTIN number' },
    { tab: 'fees', title: 'UGC Order Commission (%)', desc: 'Commission charged on UGC brand brief orders' },
    { tab: 'fees', title: 'Minimum Payout/Withdrawal Amount', desc: 'Floor amount required for creator wallet payout request' },
    { tab: 'fees', title: 'Global Payout Freeze Switch', desc: 'Emergency freeze all escrow/wallet disbursements' },
    { tab: 'fees', title: 'Dispute & Refund Window', desc: 'Grace period (days) brands have to contest content delivery' },
    { tab: 'fees', title: 'Min & Max Campaign Budget', desc: 'Floor and ceiling limits for brand campaign budgets' },
    { tab: 'coupons', title: 'Create Coupon Code', desc: 'Generate Zero Fee or Flat Discount promotional coupons' },
    { tab: 'coupons', title: 'Zero Platform Fee Coupon', desc: 'Waive creator platform deduction fee for N redemptions' },
    { tab: 'coupons', title: 'Flat Discount Coupon', desc: 'Flat ₹ amount discount on brand campaign budget' },
    { tab: 'referrals', title: 'Creator Referral Reward', desc: 'Flat bonus awarded for referring new creators' },
    { tab: 'referrals', title: 'Brand Referral Reward', desc: 'Flat bonus awarded for referring new brands' },
    { tab: 'referrals', title: 'Referral Trigger Condition', desc: 'Action required before referral reward is triggered' },
    { tab: 'referrals', title: 'Referral Monthly Cap', desc: 'Maximum paid referrals allowed per user per month' },
    { tab: 'whats-new', title: "What's new", desc: 'Show users a popup about new features' },
    { tab: 'promos', title: 'Promo popups', desc: 'Full-screen / card / bottom-sheet poster when the app opens' },
    { tab: 'banners', title: 'Banner Management', desc: 'Manage Common, Creator, and Brand hero banners' }
  ], []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return searchIndex.filter(item => 
      allowedTabs.includes(item.tab) && (safeLower(item.title).includes(q) || safeLower(item.desc).includes(q))
    );
  }, [searchQuery, searchIndex, allowedTabs.join(',')]);

  // Tab definitions
  const tabs = [
    { id: 'broadcast', label: 'Resend Email Broadcast', icon: RadioReceiver },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'fees', label: 'Fees & Risk Controls', icon: DollarSign },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'referrals', label: 'Referrals', icon: Share2 },
    // Session 43 (Ravi): the version-update tab was saved but never shown to anyone — replaced by What's new.
    { id: 'whats-new', label: "What's new", icon: Megaphone },
    { id: 'promos', label: 'Promo popups', icon: ImageIcon },
    { id: 'banners', label: 'Banners', icon: ImageIcon },
    { id: 'landing', label: 'Landing Page', icon: ImageIcon },
    { id: 'speed', label: 'Speed report', icon: Clock },
    { id: 'signup', label: 'Creator sign-up', icon: Users } // v397 (Ravi): minimum followers to join (was on the Waitlist page)
  ].filter((t) => allowedTabs.includes(t.id));

  // Resend Promotional Broadcast Handler
  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastSubject.trim() || !broadcastBodyText.trim()) {
      toast.error("Subject and Email Body are required!");
      return;
    }
    if (sendingBroadcast) return; // v330
    // v330: a broadcast emails every matching user and cannot be called back — ask first
    if (!window.confirm(`Send "${broadcastSubject.trim()}" to ${({ all: 'everyone', creators: 'all creators', brands: 'all brands', agencies: 'all agencies', unclaimed_creators: 'all unclaimed creators' })[broadcastAudience] || 'the selected audience'}? This cannot be undone.`)) return;
    setSendingBroadcast(true);
    try {
      const { data } = await api.post("admin/broadcast-email", {
        targetAudience: broadcastAudience,
        subject: broadcastSubject,
        heading: broadcastHeading,
        bodyText: broadcastBodyText,
        ctaLabel: broadcastCtaLabel,
        ctaUrl: broadcastCtaUrl
      });
      toast.success(data.message || "Broadcast queued.");
      setBroadcastReportKey((k) => k + 1);
      setBroadcastSubject('');
      setBroadcastHeading('');
      setBroadcastBodyText('');
    } catch (err) {
      toast.error(calmError(err, "Couldn't send the broadcast. Please try again.")); // v332
    } finally {
      setSendingBroadcast(false);
    }
  };

  // Maintenance Handlers
  const handleSaveMaintenanceMessage = async () => {
    try {
      await api.post("admin/maintenance", {
        type: 'creator',
        maintenance: maintenanceCreator,
        message: typedMessage
      });
      toast.success("Maintenance message updated successfully!");
    } catch (err) {
      toast.error(calmError(err, "Couldn't save the message. Please try again.")); // v332
    }
  };

  const triggerToggleConfirm = (type, currentVal, autoOffHours) => {
    setConfirmData({ type, currentVal, autoOffHours });
    setShowMaintenanceModal(true);
  };

  const handleConfirmMaintenanceToggle = async () => {
    setShowMaintenanceModal(false);
    const { type, currentVal, autoOffHours } = confirmData;
    const newVal = !currentVal;

    if (type === 'creator') setMaintenanceCreator(newVal);
    if (type === 'brand') setMaintenanceBrand(newVal);

    try {
      await api.post("admin/maintenance", {
        type,
        maintenance: newVal,
        autoOffHours: newVal && autoOffHours ? Number(autoOffHours) : null,
        message: typedMessage
      });
      toast.success(`${type === 'creator' ? 'Creator' : 'Brand'} maintenance mode ${newVal ? 'enabled' : 'disabled'}`);
      loadSystemStatus();
    } catch (err) {
      if (type === 'creator') setMaintenanceCreator(!newVal);
      if (type === 'brand') setMaintenanceBrand(!newVal);
      toast.error(calmError(err, "Couldn't change maintenance mode. Please try again.")); // v332
    }
  };

  // Fees Handlers
  const handleSaveFees = async () => {
    setSavingFees(true);
    setShowFeeModal(false);
    try {
      const { data } = await api.put("admin/fee-config", feeConfig);
      toast.success("Fee settings saved. They apply from now on."); // v332: no tech words
      if (data) {
        setFeeConfig(data);
        setOriginalFeeConfig(data);
      }
    } catch (err) {
      toast.error(calmError(err, "Couldn't save fee settings. Nothing was changed — please try again.")); // v332
    } finally {
      setSavingFees(false);
    }
  };

  // Coupon Handlers
  const handleSaveCoupon = async (e) => {
    e.preventDefault();
    if (!couponForm.code.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }
    if (savingCoupon) return; // v332
    setSavingCoupon(true);
    try {
      if (editingCoupon) {
        await api.put(`admin/coupons/${editingCoupon.id}`, couponForm);
        toast.success("Coupon updated successfully!");
      } else {
        await api.post("admin/coupons", couponForm);
        toast.success("New coupon created successfully!");
      }
      setShowCouponModal(false);
      setEditingCoupon(null);
      loadCoupons();
    } catch (err) {
      toast.error(calmError(err, "Couldn't save the coupon. Please try again.")); // v332
    } finally {
      setSavingCoupon(false);
    }
  };

  const handleEditCoupon = (coupon) => {
    setEditingCoupon(coupon);
    setCouponForm({
      code: coupon.code || '',
      type: coupon.type || 'zero_fee',
      discount_amount: coupon.discount_amount ?? 200,
      override_fee_rate: coupon.override_fee_rate ?? 5,
      applies_to_first_n_payouts: coupon.applies_to_first_n_payouts ?? 1,
      auto_apply: coupon.auto_apply === true,
      applies_to: coupon.applies_to || 'creator',
      usage_limit: coupon.usage_limit ?? 100,
      per_user_limit: Number(coupon.per_user_limit) > 0 ? Number(coupon.per_user_limit) : '', // v366: 0 = no limit → empty box
      valid_from: coupon.valid_from ? coupon.valid_from.slice(0, 10) : new Date().toISOString().slice(0, 10),
      valid_until: coupon.valid_until ? coupon.valid_until.slice(0, 10) : '',
      min_campaign_value: coupon.min_campaign_value ?? 1000,
      status: coupon.status || 'active'
    });
    setShowCouponModal(true);
  };

  const handleToggleCouponStatus = async (coupon) => {
    const nextStatus = coupon.status === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`admin/coupons/${coupon.id}/status`, { status: nextStatus });
      toast.success(`Coupon ${coupon.code} status set to ${nextStatus}`);
      loadCoupons();
    } catch (err) {
      toast.error(calmError(err, "Couldn't change the coupon status. Please try again.")); // v332
    }
  };

  const handleConfirmDeleteCoupon = async () => {
    if (!deleteConfirmCoupon) return;
    setDeletingCoupon(true);
    try {
      await api.delete(`admin/coupons/${deleteConfirmCoupon.id}`);
      toast.success(`Coupon ${deleteConfirmCoupon.code} deleted successfully`);
      setDeleteConfirmCoupon(null);
      loadCoupons();
    } catch (err) {
      toast.error(calmError(err, "Couldn't delete the coupon. Please try again.")); // v332
    } finally {
      setDeletingCoupon(false);
    }
  };

  const handleViewRedemptions = async (coupon) => {
    setViewRedemptionsModal(coupon);
    try {
      const { data } = await api.get(`admin/coupons/${coupon.id}/redemptions`);
      setCouponRedemptions(Array.isArray(data) ? data : []);
    } catch (e) {
      setCouponRedemptions([]);
    }
  };

  // Referral Handlers
  const handleSaveReferrals = async () => {
    setSavingReferralConfig(true);
    try {
      await api.post("admin/fee-config", referralConfig);
      toast.success("Referral program configuration updated!");
      loadReferrals();
    } catch (err) {
      toast.error(calmError(err, "Couldn't save referral settings. Please try again.")); // v332
    } finally {
      setSavingReferralConfig(false);
    }
  };

  // v419 admin cleanup: the old unused version-message draft/publish code was removed (What's new uses WhatsNewManager).

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      
      {!embedded && (<>
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Platform Settings & Tools</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Configure maintenance modes, fees, coupons, and rules.</p>
        </div>
      </div>

      {/* Universal Search Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search size={18} className="absolute left-4 text-[var(--text-tertiary)]" />
          <input 
            type="text" 
            placeholder="Search platform settings, fee rules, coupons, referrals, or maintenance controls..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl pl-12 pr-10 py-3.5 text-[16px] sm:text-sm font-medium focus:outline-none focus:border-[#9D7CFF] transition-all shadow-sm"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')} 
              aria-label="Clear search" /* v332 */
              className="absolute right-3.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Live Search Dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl p-2 z-[100] max-h-80 overflow-y-auto divide-y divide-[var(--border-default)]">
            {searchResults.map((item, idx) => (
              <div 
                key={`search-${item.tab}-${item.title}-${idx}`}
                onClick={() => {
                  setActiveTab(item.tab);
                  setSearchQuery('');
                }}
                className="p-3 hover:bg-[var(--bg-elevated)] rounded-xl cursor-pointer transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[#9D7CFF] flex items-center gap-2">
                    {item.title}
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#9D7CFF]/10 text-[#9D7CFF]">
                      {({ 'whats-new': "What's new", fees: 'Fees', promos: 'Promo popups' })[item.tab] || item.tab}{/* v332: no raw tab id */}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">{item.desc}</div>
                </div>
                <ChevronRight size={16} className="text-[var(--text-tertiary)] group-hover:text-[#9D7CFF]" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Horizontal Pill Navigation Shell */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-[var(--border-default)] pt-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={`tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive 
                  ? 'bg-[#9D7CFF] text-white shadow-md shadow-[#9D7CFF]/20' 
                  : 'bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#9D7CFF]/40'
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      </>)}
      {tabs.length === 0 && (
        <div className="p-6 rounded-2xl border border-[var(--border-default)] text-sm text-[var(--text-secondary)]">
          No Platform Settings tab is turned on for your account. Ask the super admin to enable the ones you need.
        </div>
      )}

      {/* TAB: RESEND PROMOTIONAL BROADCAST EMAIL */}
      {activeTab === 'broadcast' && (
        <div className="space-y-6">
          <BroadcastEmailCard broadcastAudience={broadcastAudience} broadcastBodyText={broadcastBodyText} broadcastCtaLabel={broadcastCtaLabel} broadcastCtaUrl={broadcastCtaUrl} broadcastHeading={broadcastHeading} broadcastReportKey={broadcastReportKey} broadcastSubject={broadcastSubject} handleSendBroadcast={handleSendBroadcast} sendingBroadcast={sendingBroadcast} setBroadcastAudience={setBroadcastAudience} setBroadcastBodyText={setBroadcastBodyText} setBroadcastCtaLabel={setBroadcastCtaLabel} setBroadcastCtaUrl={setBroadcastCtaUrl} setBroadcastHeading={setBroadcastHeading} setBroadcastSubject={setBroadcastSubject} />
        </div>
      )}

      {/* v397 (Ravi): TAB: CREATOR SIGN-UP — minimum Instagram followers to join */}
      {activeTab === 'signup' && (
        <div className="space-y-6">
          <FollowerLimitCard />
        </div>
      )}

      {/* TAB 1: MAINTENANCE */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          <MaintenanceCard autoOffBrand={autoOffBrand} autoOffCreator={autoOffCreator} enabledAt={enabledAt} enabledBy={enabledBy} handleSaveMaintenanceMessage={handleSaveMaintenanceMessage} maintenanceBrand={maintenanceBrand} maintenanceCreator={maintenanceCreator} setAutoOffBrand={setAutoOffBrand} setAutoOffCreator={setAutoOffCreator} setTypedMessage={setTypedMessage} triggerToggleConfirm={triggerToggleConfirm} typedMessage={typedMessage} />
        </div>
      )}

      {/* TAB 2: FEES & MONEY RISK CONTROLS */}
      {activeTab === 'fees' && (
        <div className="space-y-6">
          
          {/* Main Fees Configuration Form */}
          <FeesSettingsCard feeConfig={feeConfig} setFeeConfig={setFeeConfig} setShowFeeModal={setShowFeeModal} />
        </div>
      )}

      {/* TAB 3: COUPONS */}
      {activeTab === 'coupons' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">{/* v332: wraps on phones */}
            <div>
              <h3 className="font-display text-lg font-bold flex items-center gap-2">
                <Ticket size={18} className="text-[#9D7CFF]"/> Coupon Management
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Issue Zero Platform Fee, Partial Fee Waiver (%), or Flat Discount coupons for creators and brands.
              </p>
            </div>
            <button 
              onClick={() => {
                setEditingCoupon(null);
                setCouponForm({
                  code: '',
                  type: 'zero_fee',
                  discount_amount: 200,
                  override_fee_rate: 5,
                  applies_to_first_n_payouts: 1,
                  applies_to: 'creator',
                  usage_limit: 100,
                  per_user_limit: '', // v366: empty = no limit
                  valid_from: new Date().toISOString().slice(0, 10),
                  valid_until: '',
                  min_campaign_value: 1000,
                  status: 'active'
                });
                setShowCouponModal(true);
              }}
              className="px-4 py-2.5 bg-[#9D7CFF] hover:bg-[#8B6BE0] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              <Plus size={16} /> Create New Coupon
            </button>
          </div>

          {/* Coupon Cards List */}
          <CouponList coupons={coupons} handleEditCoupon={handleEditCoupon} handleToggleCouponStatus={handleToggleCouponStatus} handleViewRedemptions={handleViewRedemptions} loadingCoupons={loadingCoupons} setDeleteConfirmCoupon={setDeleteConfirmCoupon} />
        </div>
      )}

      {/* TAB 4: REFERRALS */}
      {activeTab === 'referrals' && (
        <div className="space-y-6">
          {/* Session 36: the creator referral programme (rewards, numbers, withdrawals). The old
              cash-reward settings below are kept for brands / older referrals. */}
          <AdminReferralProgram />
          {/* Session 53: the old ReferralSettingsCard was removed from here — it saved into the same settings
              row as the programme above and could reset its monthly cap / on-off switch, and its ₹ reward
              fields were never paid out by anything. */}
        </div>
      )}

      {activeTab === 'hiw-videos' && (
        <div className="mt-6">
          <HiwVideosManager />
        </div>
      )}

      {activeTab === 'whats-new' && (
        <div className="mt-6">
          <WhatsNewManager />
        </div>
      )}

      {/* TAB 6: BANNERS */}
      {activeTab === 'landing' && (
        <div className="mt-6">
          <LandingContentManager />
        </div>
      )}

      {activeTab === 'promos' && <AdminPromoPopups />}

      {activeTab === 'banners' && (
        <BannerManager />
      )}

      {activeTab === 'speed' && <SpeedReport />}

      {/* MODAL: Maintenance Confirmation */}
      <Presence>{showMaintenanceModal && (
        <PopupBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] max-w-md w-full rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
            <h3 className="font-display font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
              <AlertTriangle className="text-amber-400" size={18} /> Confirm Maintenance Lock Toggle
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              You are about to {confirmData.currentVal ? 'disable' : 'enable'} maintenance lock for {confirmData.type} users.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setShowMaintenanceModal(false)}
                className="px-4 py-2 border border-[var(--border-default)] text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmMaintenanceToggle}
                className="px-4 py-2 bg-[#9D7CFF] text-white text-xs font-bold rounded-xl"
              >
                Confirm Toggle
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* MODAL: Fee Review Confirmation */}
      <Presence>{showFeeModal && (
        <PopupBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] max-w-xl w-full rounded-2xl p-6 space-y-5 shadow-2xl max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
            <h3 className="font-display font-bold text-lg text-[var(--text-primary)] flex items-center gap-2">
              <AlertTriangle className="text-amber-400" size={20} /> Review Live Platform Fee Changes
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              New payments use these values at once. Deals that are already paid keep the fee they were paid with.
            </p>

            <div className="space-y-2 text-xs font-mono bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-default)]">
              {/* v364: split fee */}
              <div className="flex justify-between">
                <span>Fee model:</span>
                <span className="font-bold">{feeConfig.fee_model === 'split' ? 'Split (creator % + brand %)' : 'Old tiered fee'}</span>
              </div>
              {feeConfig.fee_model === 'split' && (<>
                <div className="flex justify-between"><span>Creator fee:</span><span className="font-bold">{feeConfig.creator_fee_pct}%</span></div>
                <div className="flex justify-between"><span>Brand fee:</span><span className="font-bold">{feeConfig.brand_fee_pct}%</span></div>
              </>)}
              <div className="flex justify-between">
                <span>Threshold Limit:</span>
                <span className="font-bold">₹{formatAmount(feeConfig.threshold_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Below Threshold Rate:</span>
                <span className="font-bold">{feeConfig.below_threshold_rate}%</span>
              </div>
              <div className="flex justify-between">
                <span>Above Threshold Rate:</span>
                <span className="font-bold">{feeConfig.above_threshold_rate}%</span>
              </div>
              <div className="flex justify-between">
                <span>GST Rate:</span>
                <span className="font-bold">{feeConfig.gst_rate}%</span>
              </div>
              <div className="flex justify-between">
                <span>Payout Freeze:</span>
                <span className={`font-bold ${feeConfig.payout_freeze_all ? 'text-red-400' : 'text-[#027A48]'}`}>
                  {feeConfig.payout_freeze_all ? 'FROZEN' : 'Normal'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setShowFeeModal(false)}
                className="px-4 py-2.5 border border-[var(--border-default)] text-xs font-bold rounded-xl"
              >
                Cancel & Revise
              </button>
              <button 
                onClick={handleSaveFees}
                disabled={savingFees}
                className="px-5 py-2.5 bg-[#9D7CFF] text-white text-xs font-bold rounded-xl shadow-md"
              >
                {savingFees ? 'Saving...' : 'Confirm & Apply Live'}
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* MODAL: Create / Edit Coupon */}
      <Presence>{showCouponModal && (
        <PopupBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] max-w-lg w-full rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-default)]">
              <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
                {editingCoupon ? 'Edit Coupon' : 'Create Promotional Coupon'}
              </h3>
              <button onClick={() => setShowCouponModal(false)} aria-label="Close" className="p-1">{/* v332 */}<X size={18} /></button>
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[var(--text-secondary)] block mb-1">Coupon Code</label>
                <input 
                  type="text" 
                  placeholder="e.g. NEW40" 
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({...couponForm, code: safeUpper(e.target.value)})}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold text-sm focus:outline-none focus:border-[#9D7CFF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-secondary)] block mb-1">Coupon Type</label>
                  <select 
                    value={couponForm.type}
                    onChange={(e) => setCouponForm({...couponForm, type: e.target.value})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-[#9D7CFF]"
                  >
                    {couponForm.applies_to === 'brand_fee' ? (<>{/* v364: brand-fee coupon options */}
                      <option value="fee_rate_override">New brand fee (%)</option>
                      <option value="flat_discount">₹ off the brand fee</option>
                      <option value="zero_fee">Brand fee 0%</option>
                    </>) : (<>
                    <option value="zero_fee">Zero Platform Fee</option>
                    <option value="fee_rate_override">Partial Fee Waiver (%)</option>
                    <option value="flat_discount">Flat Discount (₹)</option>
                    </>)}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[var(--text-secondary)] block mb-1">Applies To</label>
                  <select 
                    value={couponForm.applies_to}
                    onChange={(e) => { const v = e.target.value; setCouponForm(v === 'brand_fee' ? { ...couponForm, applies_to: v, type: 'fee_rate_override', override_fee_rate: couponForm.override_fee_rate ?? 4, auto_apply: false, min_campaign_value: 0, usage_limit: couponForm.usage_limit ?? 0 } : { ...couponForm, applies_to: v }); }}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-[#9D7CFF]"
                  >
                    <option value="creator">Creator Accounts</option>
                    <option value="brand">Brand Accounts</option>
                    <option value="brand_fee">Brand fee (brand pays less — all brands)</option>{/* v364 */}
                  </select>
                </div>
              </div>

              {/* v364 (Ravi: "coupon lagane pe brand fee 8% → 4% — naam main khud rakhunga"): brand-fee coupon settings */}
              {couponForm.applies_to === 'brand_fee' && (
                <div className="space-y-3 p-3 rounded-xl border border-[#9D7CFF]/40 bg-[#F7F3FF]" data-testid="brand-fee-coupon">
                  <div className="text-[11px] text-[#5B21B6] font-semibold">The brand types this code in "Review &amp; pay". It lowers only the brand's service fee — the creator's payout never changes.</div>
                  <div className="grid grid-cols-2 gap-3">
                    {couponForm.type === 'fee_rate_override' && (
                      <div>
                        <label className="font-bold text-[var(--text-secondary)] block mb-1">New brand fee (%)</label>
                        <input type="number" step="0.5" min="0" value={couponForm.override_fee_rate ?? 4} onChange={(e) => setCouponForm({ ...couponForm, override_fee_rate: Number(e.target.value) })}
                          className="w-full bg-white border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold" />
                      </div>
                    )}
                    {couponForm.type === 'flat_discount' && (
                      <div>
                        <label className="font-bold text-[var(--text-secondary)] block mb-1">₹ off the brand fee</label>
                        <input type="number" min="0" value={couponForm.discount_amount ?? 0} onChange={(e) => setCouponForm({ ...couponForm, discount_amount: Number(e.target.value) })}
                          className="w-full bg-white border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold" />
                      </div>
                    )}
                    <div>
                      <label className="font-bold text-[var(--text-secondary)] block mb-1">Min deal value (₹)</label>
                      <input type="number" min="0" value={couponForm.min_campaign_value ?? 0} onChange={(e) => setCouponForm({ ...couponForm, min_campaign_value: Number(e.target.value) })}
                        className="w-full bg-white border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold" />
                    </div>
                    <div>
                      <label className="font-bold text-[var(--text-secondary)] block mb-1">Starts</label>
                      <input type="date" value={String(couponForm.valid_from || '').slice(0, 10)} onChange={(e) => setCouponForm({ ...couponForm, valid_from: e.target.value })}
                        className="w-full bg-white border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono" />
                    </div>
                    <div>
                      <label className="font-bold text-[var(--text-secondary)] block mb-1">Ends (optional)</label>
                      <input type="date" value={String(couponForm.valid_until || '').slice(0, 10)} onChange={(e) => setCouponForm({ ...couponForm, valid_until: e.target.value })}
                        className="w-full bg-white border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                    <input type="checkbox" checked={couponForm.status === 'active'} onChange={(e) => setCouponForm({ ...couponForm, status: e.target.checked ? 'active' : 'paused' })} /> Active
                  </label>
                  <div className="text-[11px] text-[var(--text-tertiary)]">Usage limit = total uses across all brands (0 = no limit). Per user limit = uses per brand.</div>
                </div>
              )}

              {couponForm.applies_to !== 'brand_fee' && couponForm.type === 'fee_rate_override' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-[var(--text-secondary)] block mb-1">Override Fee Rate (%)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      placeholder="e.g. 5"
                      value={couponForm.override_fee_rate ?? 5}
                      onChange={(e) => setCouponForm({...couponForm, override_fee_rate: Number(e.target.value)})}
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-[var(--text-secondary)] block mb-1">Applies to First N Payouts</label>
                    <input 
                      type="number" 
                      min="1"
                      value={couponForm.applies_to_first_n_payouts ?? 1}
                      onChange={(e) => setCouponForm({...couponForm, applies_to_first_n_payouts: Number(e.target.value)})}
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                    />
                  </div>
                </div>
              )}

              {couponForm.applies_to !== 'brand_fee' && couponForm.type === 'zero_fee' && (
                <div>
                  <label className="font-bold text-[var(--text-secondary)] block mb-1">Applies to First N Payouts</label>
                  <input 
                    type="number" 
                    min="1"
                    value={couponForm.applies_to_first_n_payouts ?? 1}
                    onChange={(e) => setCouponForm({...couponForm, applies_to_first_n_payouts: Number(e.target.value)})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                  />
                </div>
              )}

              {/* Session 36: launch offer — applied to creators automatically, no code needed */}
              {couponForm.applies_to !== 'brand_fee' && (
              <label className="flex items-start gap-2 p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] cursor-pointer" data-testid="coupon-auto-apply">
                <input type="checkbox" className="mt-0.5" checked={Boolean(couponForm.auto_apply)} onChange={(e) => setCouponForm({ ...couponForm, auto_apply: e.target.checked })} />
                <span>
                  <span className="font-bold text-[var(--text-primary)] block">Apply automatically (launch offer, no code)</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">Creators get it on their first N funded deals while it is active. Set how many people can use it (usage limit below) before turning it on.</span>{/* v332: pointed to date fields that are not on this form */}
                </span>
              </label>
              )}

              {couponForm.applies_to !== 'brand_fee' && couponForm.type === 'flat_discount' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-[var(--text-secondary)] block mb-1">Flat Discount Amount (₹)</label>
                    <input 
                      type="number" 
                      value={couponForm.discount_amount}
                      onChange={(e) => setCouponForm({...couponForm, discount_amount: Number(e.target.value)})}
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-[var(--text-secondary)] block mb-1">Min Campaign Budget (₹)</label>
                    <input 
                      type="number" 
                      value={couponForm.min_campaign_value ?? 1000}
                      onChange={(e) => setCouponForm({...couponForm, min_campaign_value: Number(e.target.value)})}
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-secondary)] block mb-1">Usage Limit (Total)</label>
                  <input 
                    type="number" 
                    value={couponForm.usage_limit}
                    onChange={(e) => setCouponForm({...couponForm, usage_limit: Number(e.target.value)})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[var(--text-secondary)] block mb-1">Per User Limit</label>
                  <input 
                    type="number" 
                    min="0"
                    data-testid="coupon-per-user-limit"
                    placeholder="No limit"
                    value={couponForm.per_user_limit}
                    onChange={(e) => setCouponForm({...couponForm, per_user_limit: e.target.value === '' ? '' : Number(e.target.value)})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                  />
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Leave empty for no limit</p>{/* v366 */}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setShowCouponModal(false)}
                  className="px-4 py-2 border border-[var(--border-default)] text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={savingCoupon} /* v332 */
                  className="px-5 py-2 bg-[#9D7CFF] text-white text-xs font-bold rounded-xl disabled:opacity-60"
                >
                  {savingCoupon ? "Saving…" : "Save Coupon"}
                </button>
              </div>
            </form>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* MODAL: View Coupon Redemptions Audit Log */}
      <Presence>{viewRedemptionsModal && (
        <PopupBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] max-w-lg w-full rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-default)]">
              <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
                Redemptions: {viewRedemptionsModal.code}
              </h3>
              <button onClick={() => setViewRedemptionsModal(null)} aria-label="Close" className="p-1">{/* v332 */}<X size={18} /></button>
            </div>

            {couponRedemptions.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">
                No redemptions logged for this coupon code yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {couponRedemptions.map((r, idx) => (
                  <div key={`redemption-${r.id || r.user_id || idx}`} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs flex justify-between items-center">
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{r.user_name || r.user_id}</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">{r.user_email || 'N/A'} • <span className="capitalize">{r.user_role || 'user'}</span></div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{r.redeemed_at ? new Date(r.redeemed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) /* v330 */ : 'N/A'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400">
                        {r.discount_applied ? `-₹${(Number(r.discount_applied) || 0).toLocaleString('en-IN')}` : 'Applied'}{/* v332: en-IN */}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* MODAL: Delete Coupon Confirmation */}
      <Presence>{deleteConfirmCoupon && (
        <PopupBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <PopupPanel kind="modal"
            className="bg-[var(--bg-card)] border border-[var(--border-default)] max-w-md w-full rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2 text-red-400 font-bold text-base">
                <Trash2 size={20} />
                <span>Delete Coupon?</span>
              </div>
              <button 
                type="button"
                onClick={() => setDeleteConfirmCoupon(null)}
                aria-label="Close" /* v332 */
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
                disabled={deletingCoupon}
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Are you sure you want to permanently delete coupon code <strong className="font-mono text-base text-[var(--text-primary)]">{deleteConfirmCoupon.code}</strong>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-default)]">
              <button
                type="button"
                onClick={() => setDeleteConfirmCoupon(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                disabled={deletingCoupon}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCoupon}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition-colors flex items-center gap-2 shadow-lg shadow-red-500/20 cursor-pointer"
                disabled={deletingCoupon}
              >
                {deletingCoupon ? 'Deleting...' : 'Yes, Delete Coupon'}
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

    </div>
  );
}
