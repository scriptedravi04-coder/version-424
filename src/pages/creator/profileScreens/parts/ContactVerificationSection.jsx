import React from "react";
import { toast } from "sonner";
import { api } from "../../../../lib/api";


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ContactVerificationSection(props) {
  const { editForm, saveProfileChanges, setEditForm, setProfile } = props;
  const [busy, setBusy] = React.useState(""); // v330: "phone" | "email" while saving — no double submit
  return (
    <div className="space-y-4 pt-3 border-t border-slate-100">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Contact & Notifications
            </span>{/* v332: inputs are 16px so iPhone doesn't zoom */}

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Phone Number
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="e.g. +91 98765 43210"
                  className="flex-1 min-w-0 h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
                />
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    if (busy) return;
                    setBusy("phone");
                    try { // v330: a failed save showed nothing
                    if (saveProfileChanges) {
                      if ((await saveProfileChanges({ phone: editForm.phone }, { silent: true })) === false) return; // Session 53
                    } else {
                      await api.patch("creators/me", { phone: editForm.phone });
                      setProfile(p => ({ ...p, phone: editForm.phone }));
                    }
                    toast.success("Phone updated!");
                    } catch (e) {
                      toast.error("Couldn't update your phone number. Please try again."); // v332: calm wording
                    } finally {
                      setBusy("");
                    }
                  }}
                  className="disabled:opacity-60 px-5 h-[52px] bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-2xl transition-all shrink-0 active:scale-95 flex items-center justify-center"
                >
                  {busy === "phone" ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            {/* Business Inquiries Email */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Business Inquiries Email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={editForm.businessEmail}
                  onChange={(e) => setEditForm({ ...editForm, businessEmail: e.target.value })}
                  placeholder="e.g. collabs@yourname.com" /* v332: was a staff-looking address */
                  className="flex-1 min-w-0 h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
                />
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    if (busy) return;
                    if (!editForm.businessEmail.trim()) {
                      toast.error("Please enter a valid email address");
                      return;
                    }
                    setBusy("email");
                    try {
                      if (saveProfileChanges) {
                        if ((await saveProfileChanges({ businessEmail: editForm.businessEmail.trim() }, { silent: true })) === false) return; // Session 53
                      } else {
                        await api.patch("creators/me", { 
                          email: editForm.businessEmail.trim(), 
                          business_email: editForm.businessEmail.trim(),
                          businessEmail: editForm.businessEmail.trim() 
                        });
                        setProfile(p => ({ ...p, businessEmail: editForm.businessEmail.trim() }));
                      }
                      toast.success("Business email updated successfully!");
                    } catch (e) {
                      toast.error("Couldn't update your email. Please try again."); // v332
                    } finally {
                      setBusy("");
                    }
                  }}
                  className="disabled:opacity-60 px-5 h-[52px] bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-2xl transition-all shrink-0 active:scale-95 flex items-center justify-center"
                >
                  {busy === "email" ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
  );
}
