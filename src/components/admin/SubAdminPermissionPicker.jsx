import React from 'react';
import { PERMISSION_GROUPS, FULL_SETTINGS_KEY } from '../../lib/adminPermissions';

// v294 (Ravi): same picker in "create sub-admin" and User → Permissions.
// v419 (Ravi): grouped like the admin menu (Daily work · Users · Money · Orders & leads · Marketing · Developer).
// Each group has "All of <group>" and its own small ticks, so e.g. a designer gets only Banners + Promo popups.
export default function SubAdminPermissionPicker({ permissions, onChange }) {
  const set = (patch) => onChange({ ...permissions, ...patch });
  const fullSettings = !!permissions[FULL_SETTINGS_KEY];
  const on = (row) => !!permissions[row.key] || (fullSettings && String(row.key).startsWith('settings_'));

  return (
    <div className="space-y-3" data-testid="sub-admin-permission-picker">
      {PERMISSION_GROUPS.map((g) => {
        const all = g.rows.every(on);
        const some = !all && g.rows.some(on);
        return (
          <div key={g.id} className="border border-gray-100 rounded-2xl p-3 bg-gray-50/40" data-testid={`perm-group-${g.id}`}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some; }}
                onChange={(e) => set(Object.fromEntries(g.rows.map((r) => [r.key, e.target.checked])))}
                className="w-4 h-4 text-[#A855F7] rounded border-gray-300 focus:ring-[#A855F7]" />
              <span className="text-sm font-extrabold text-gray-900">{g.label}</span>
              <span className="text-[11px] text-gray-400 font-semibold">{g.rows.filter(on).length}/{g.rows.length}</span>
            </label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
              {g.rows.map((r) => (
                <label key={r.key} title={r.desc} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-semibold ${on(r) ? 'bg-purple-50 text-gray-900' : 'text-gray-600 hover:bg-white'}`}>
                  <input type="checkbox" checked={on(r)} disabled={fullSettings && String(r.key).startsWith('settings_')}
                    onChange={(e) => set({ [r.key]: e.target.checked })} className="w-3.5 h-3.5 text-[#A855F7] rounded border-gray-300" />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <label className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-100 cursor-pointer text-xs font-semibold text-gray-700">
        <input type="checkbox" checked={fullSettings} onChange={(e) => set({ [FULL_SETTINGS_KEY]: e.target.checked })} className="w-3.5 h-3.5" />
        All settings (every Money / Marketing / Developer setting, now and future)
      </label>
    </div>
  );
}
