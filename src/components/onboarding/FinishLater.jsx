import React, { createContext, useContext, useState } from "react";
import { Check, LogOut } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../common/ButtonSpinner";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 34 (Ravi): once the basic details are saved, every onboarding screen shows "Saved ✓" at
// the top and a "Finish later" button (it replaces "Save & exit"). Finish later opens a sheet:
// "Your progress is saved. Open the app any time to continue." + Log out. Progress itself is
// already on the server (src/lib/onboardingProgress.js), so nothing extra is sent here.

export const OnboardingSaveContext = createContext({ basicsDone: false, openFinishLater: null });
export const useOnboardingSave = () => useContext(OnboardingSaveContext);

export function SavedPill({ compact = false }) {
  return (
    <span
      data-testid="onboarding-saved"
      className={`inline-flex items-center gap-1 rounded-full bg-[#E9F7F0] text-[#15803D] font-semibold whitespace-nowrap ${compact ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs"}`}
    >
      <Check size={compact ? 12 : 13} strokeWidth={3} /> Saved
    </span>
  );
}

export function FinishLaterButton({ onClick, compact = false, label = "Finish later" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={label === "Exit" ? "onboarding-exit" : "onboarding-finish-later"}
      className={`font-semibold text-[#7C3AED] cursor-pointer ${compact ? "text-[12.5px] bg-transparent border-0 px-1.5 min-h-[40px]" /* v332: bigger tap area */ : "text-xs px-3.5 py-2 rounded-xl border border-[#E2D6FF] bg-white hover:bg-[#F5F0FF]"}`}
    >
      {label}
    </button>
  );
}

function FinishLaterSheetBody({ open, onClose, saved = true }) {
  const { logout } = useAuth();
  const { isBusy, anyBusy, run } = useBusy();
  if (!open) return null;
  const doLogout = () => run("logout", async () => {
    try { await logout(); } catch { /* logout clears the session anyway */ }
    window.location.href = "/login";
  });
  return (
    <PopupBackdrop className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose} data-testid="finish-later-sheet">
      <PopupPanel kind="auto" below={640} onClose={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-later-title"
        className="w-full sm:max-w-[400px] bg-white rounded-t-[24px] sm:rounded-[24px] p-6 pb-[calc(24px+env(safe-area-inset-bottom))] box-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden mx-auto mb-4 h-1 w-10 rounded-full bg-[#E5E5EA]" />
        <div className={`w-11 h-11 rounded-full flex items-center justify-center ${saved ? "bg-[#E9F7F0]" : "bg-[#F5F0FF]"}`}>
          {saved ? <Check size={20} className="text-[#15803D]" strokeWidth={3} /> : <LogOut size={19} className="text-[#7C3AED]" />}
        </div>
        {/* v363: before the basics are saved there's no "progress" yet — say what Log out does instead */}
        <h3 id="finish-later-title" className="mt-4 mb-0 text-lg font-bold tracking-[-.4px] text-[#0A0A0A]">{saved ? "Your progress is saved" : "Leave setup?"}</h3>
        <p className="mt-1.5 mb-0 text-sm leading-relaxed text-[#6B7280]">{saved ? "Open the app any time to continue." : "Log out to sign in with a different account. You can finish setting up this one later."}</p>
        {/* docs/code/ARCHITECTURE.md: dismiss left, action right */}
        <div className="mt-6 flex gap-2.5">
          <button type="button" onClick={onClose} disabled={anyBusy} className="flex-1 h-[46px] rounded-[14px] border border-[#E5E5EA] bg-white text-sm font-bold text-[#374151] cursor-pointer disabled:opacity-50">
            Continue now
          </button>
          <button type="button" onClick={doLogout} disabled={anyBusy} className="flex-1 h-[46px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-sm font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
            {isBusy("logout") ? <ButtonSpinner label="Logging out..." /> : <><LogOut size={15} /> Log out</>}
          </button>
        </div>
      </PopupPanel>
    </PopupBackdrop>
  );
}

// Session 37: stays mounted for its closing animation.
export function FinishLaterSheet(props) {
  return <Presence>{props.open && <FinishLaterSheetBody key="finishlatersheet" {...props} />}</Presence>;
}


/** Holds the sheet's open state; children read basicsDone / openFinishLater from context. */
export function OnboardingSaveProvider({ basicsDone, onFinishLater = undefined, children, openRef = undefined }) {
  const [open, setOpen] = useState(false);
  // Session 39 (M8): a flow can handle "Finish later" itself (creator mobile → dashboard);
  // otherwise the saved-progress sheet with Log out opens as before.
  const openFinishLater = typeof onFinishLater === "function" ? onFinishLater : () => setOpen(true);
  if (openRef) openRef.current = () => setOpen(true); // v363: a flow's own Back on its first screen opens this sheet
  return (
    <OnboardingSaveContext.Provider value={{ basicsDone: Boolean(basicsDone), openFinishLater }}>
      {children}
      <FinishLaterSheet open={open} onClose={() => setOpen(false)} saved={Boolean(basicsDone)} />
    </OnboardingSaveContext.Provider>
  );
}
