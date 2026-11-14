import React from "react";
import { Wrench, Save } from "lucide-react";


// Session 49 (clean-up): moved out of PlatformTools.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function MaintenanceCard(props) {
  const { autoOffBrand, autoOffCreator, enabledAt, enabledBy, handleSaveMaintenanceMessage, maintenanceBrand, maintenanceCreator, setAutoOffBrand, setAutoOffCreator, setTypedMessage, triggerToggleConfirm, typedMessage } = props;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-sm">
            <h3 className="font-display text-lg font-bold flex items-center gap-2 mb-2">
              <Wrench size={18} className="text-[#9D7CFF]"/> Global Platform Maintenance Toggles
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-6">
              Lock creator or brand side access independently. Active sessions are automatically presented with the upgrade screen.
            </p>

            {/* v332: timer / message fields are 16px on phones (no iOS zoom); header rows wrap */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Creator Maintenance Card */}
              <div className={`p-5 rounded-xl border transition-all ${maintenanceCreator ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[var(--bg-elevated)] border-[var(--border-default)]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <span className="text-sm font-bold text-[var(--text-primary)]">Creator Side Lock</span>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Applies to all creator accounts</p>
                  </div>
                  <button 
                    onClick={() => triggerToggleConfirm('creator', maintenanceCreator, autoOffCreator)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      maintenanceCreator 
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                        : 'bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-amber-500'
                    }`}
                  >
                    {maintenanceCreator ? '🔒 Locked (Active)' : '🔓 Unlocked (Live)'}
                  </button>
                </div>

                <div className="space-y-2 pt-2 border-t border-[var(--border-default)]">
                  <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block">Auto-Off Timer (Hours)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 2 (Leave empty for manual)" 
                    value={autoOffCreator}
                    onChange={(e) => setAutoOffCreator(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[16px] sm:text-xs focus:outline-none focus:border-[#9D7CFF]"
                  />
                </div>
              </div>

              {/* Brand Maintenance Card */}
              <div className={`p-5 rounded-xl border transition-all ${maintenanceBrand ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[var(--bg-elevated)] border-[var(--border-default)]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <span className="text-sm font-bold text-[var(--text-primary)]">Brand Side Lock</span>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Applies to all brand accounts</p>
                  </div>
                  <button 
                    onClick={() => triggerToggleConfirm('brand', maintenanceBrand, autoOffBrand)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      maintenanceBrand 
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                        : 'bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-amber-500'
                    }`}
                  >
                    {maintenanceBrand ? '🔒 Locked (Active)' : '🔓 Unlocked (Live)'}
                  </button>
                </div>

                <div className="space-y-2 pt-2 border-t border-[var(--border-default)]">
                  <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block">Auto-Off Timer (Hours)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 2 (Leave empty for manual)" 
                    value={autoOffBrand}
                    onChange={(e) => setAutoOffBrand(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[16px] sm:text-xs focus:outline-none focus:border-[#9D7CFF]"
                  />
                </div>
              </div>

            </div>

            {/* Custom Maintenance Message */}
            <div className="mt-6 space-y-3">
              <label className="text-xs font-bold text-[var(--text-primary)] block">Maintenance Overlay Broadcast Message</label>
              <textarea 
                placeholder="Enter custom maintenance note (e.g. We are performing scheduled database upgrades...)" 
                value={typedMessage}
                onChange={(e) => setTypedMessage(e.target.value)}
                className="w-full h-24 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-3 text-[16px] sm:text-xs focus:outline-none focus:border-[#9D7CFF] resize-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {enabledAt ? `Last modified by ${enabledBy || 'Admin'} at ${new Date(enabledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) /* v330 */}` : ''}
                </span>
                <button 
                  onClick={handleSaveMaintenanceMessage}
                  className="px-5 py-2.5 bg-[#9D7CFF] hover:bg-[#8B6BE0] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                >
                  <Save size={14} /> Save Message Notice
                </button>
              </div>
            </div>
          </div>
  );
}
