import React from "react";
import { safeLower } from "../../../utils/safeFormat";
import { LogIn, Briefcase, Handshake, ShieldAlert, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";


// Session 49 (clean-up): moved out of UserEnforcementPanel.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ActivityTimelineCard(props) {
  const { timeline } = props;
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <h3 className="text-lg font-extrabold text-gray-900 mb-4 flex items-center gap-2"><Clock size={18} className="text-[#A855F7]" /> Visual Activity Timeline</h3>
           
           <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              {timeline && timeline.length > 0 ? timeline.map((evt, idx) => {
                 let Icon = LogIn;
                 let iconBg = 'bg-gray-100';
                 let iconColor = 'text-gray-500';
                 let label = 'Logged In';
                 let desc = '';
                 
                 if (evt.event_type === 'campaign_applied') {
                    Icon = Briefcase;
                    iconBg = 'bg-purple-100';
                    iconColor = 'text-purple-600';
                    label = 'Applied to Campaign';
                    desc = evt.detail || '';
                 } else if (evt.event_type === 'deal_created') {
                    Icon = Handshake;
                    if (evt.detail && safeLower(evt.detail).includes('completed')) {
                        iconBg = 'bg-green-100';
                        iconColor = 'text-green-600';
                    } else {
                        iconBg = 'bg-indigo-100';
                        iconColor = 'text-indigo-600';
                    }
                    label = 'Deal Created';
                    desc = evt.detail || '';
                 } else if (evt.event_type === 'blocked_contact_attempt') {
                    Icon = ShieldAlert;
                    iconBg = 'bg-red-100';
                    iconColor = 'text-red-600';
                    label = 'Blocked Contact Attempt';
                    desc = evt.detail || '';
                 }

                 // v332: a missing / bad timestamp used to crash this card (formatDistanceToNow throws on Invalid Date)
                 const at = evt.event_at ? new Date(evt.event_at) : null;
                 const atOk = at && !isNaN(at);
                 return (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active py-3">
                       <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${iconBg} ${iconColor}`}>
                          <Icon size={16} />
                       </div>
                       <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-x-2 mb-1">
                             <div className="font-extrabold text-sm text-gray-900">{label}</div>
                             <div className="text-xs font-bold text-gray-500 group-hover:text-[#A855F7] transition-colors" title={atOk ? at.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : ''}>
                                {atOk ? formatDistanceToNow(at, { addSuffix: true }) : ''}
                             </div>
                          </div>
                          {desc && <div className="text-xs font-medium text-gray-600 mt-1">{desc}</div>}
                       </div>
                    </div>
                 );
              }) : (
                 <div className="text-sm font-semibold text-gray-500 italic text-center py-4">No timeline activity found.</div>
              )}
           </div>
        </div>
  );
}
