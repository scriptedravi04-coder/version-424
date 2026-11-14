import React from "react";
import BroadcastReport, { EmailQueueCard } from "../BroadcastReport"; // v419: Waiting emails + Send now
import { RadioReceiver } from "lucide-react";

// Session 49 (clean-up): moved out of PlatformTools.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BroadcastEmailCard(props) {
  const { broadcastAudience, broadcastBodyText, broadcastCtaLabel, broadcastCtaUrl, broadcastHeading, broadcastReportKey, broadcastSubject, handleSendBroadcast, sendingBroadcast, setBroadcastAudience, setBroadcastBodyText, setBroadcastCtaLabel, setBroadcastCtaUrl, setBroadcastHeading, setBroadcastSubject } = props;
  return (
    <>
    <EmailQueueCard />{/* v419 */}
    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-[var(--border-default)]">
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2">
                  <RadioReceiver size={20} className="text-[#9D7CFF]"/> Email broadcast{/* v332: no tech words */}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Send announcements and updates by email to your registered users.
                </p>
              </div>
{/* v332: removed an always-on "Resend Active" badge — it was shown without checking anything */}
            </div>

            {/* v332: fields are 16px on phones so iOS doesn't zoom */}
            <form onSubmit={handleSendBroadcast} className="space-y-5 max-w-3xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1.5 block">Target Audience</label>
                  <select
                    value={broadcastAudience}
                    onChange={(e) => setBroadcastAudience(e.target.value)}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-[16px] sm:text-sm font-semibold focus:outline-none focus:border-[#9D7CFF]"
                  >
                    <option value="all">Everyone (creators + brands + unclaimed creators)</option>
                    <option value="creators">Creators only (signed up)</option>
                    <option value="brands">Brands only</option>
                    <option value="agencies">Agencies only</option>
                    <option value="unclaimed_creators">Unclaimed creators only (approved, not signed up yet)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1.5 block">Email Subject Line</label>
                  <input
                    type="text"
                    placeholder="e.g. 🎉 Exciting New Feature on Ybex Media!"
                    value={broadcastSubject}
                    onChange={(e) => setBroadcastSubject(e.target.value)}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-[16px] sm:text-sm font-semibold focus:outline-none focus:border-[#9D7CFF]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] mb-1.5 block">Heading Banner (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Exclusive Update for Ybex Partners"
                  value={broadcastHeading}
                  onChange={(e) => setBroadcastHeading(e.target.value)}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-[16px] sm:text-sm focus:outline-none focus:border-[#9D7CFF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] mb-1.5 block">Email Message Body</label>
                <textarea
                  rows={6}
                  placeholder="Write your email body message here..."
                  value={broadcastBodyText}
                  onChange={(e) => setBroadcastBodyText(e.target.value)}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-4 text-[16px] sm:text-sm focus:outline-none focus:border-[#9D7CFF] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1.5 block">Button Label (CTA)</label>
                  <input
                    type="text"
                    placeholder="e.g. Claim Offer / View Campaign"
                    value={broadcastCtaLabel}
                    onChange={(e) => setBroadcastCtaLabel(e.target.value)}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-[16px] sm:text-sm focus:outline-none focus:border-[#9D7CFF]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1.5 block">Button Target Link (CTA URL)</label>
                  <input
                    type="text"
                    placeholder="e.g. /campaigns or /chat"
                    value={broadcastCtaUrl}
                    onChange={(e) => setBroadcastCtaUrl(e.target.value)}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-[16px] sm:text-sm focus:outline-none focus:border-[#9D7CFF]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="px-6 py-3 bg-[#9D7CFF] hover:bg-[#8B6BE0] text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-[#9D7CFF]/20 flex items-center gap-2 disabled:opacity-60"
                >
                  <RadioReceiver size={18} />
                  {sendingBroadcast ? 'Queuing…' : 'Send broadcast'}
                </button>
              </div>
            </form>
            <p className="text-[11px] text-[var(--text-secondary)] mt-3">
              Never sent to banned or deleted accounts, people who unsubscribed, or people added by CSV import. Every email has an Unsubscribe link.
            </p>
            <BroadcastReport refreshKey={broadcastReportKey} />
          </div>
    </>
  );
}
