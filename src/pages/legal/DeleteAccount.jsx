import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AccountPanel from "../../components/account/AccountPanel";

// Public page linked from the Play Console "Data deletion" field. Explains how to delete a Ybex
// account, what is removed and what is kept. Logged-in users can delete right here; others sign in
// first (deletion is also in the app at Settings → Account → Delete account).
export default function DeleteAccount() {
  const { user, logout } = useAuth();
  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className="text-2xl font-extrabold text-slate-900">Delete your Ybex account</h1>
      <p className="mt-2 text-[14px] text-slate-600 leading-relaxed">
        You can permanently delete your Ybex account and personal data at any time — from this page, or
        in the app at <span className="font-semibold">Settings → Account → Delete account</span>.
      </p>

      {/* v334 (Google Play "Delete account URL" / App Store 5.1.1(v)): the three ways, step by step, readable logged out */}
      <div className="mt-6 rounded-2xl border border-slate-200 p-5" data-testid="delete-account-steps">
        <h2 className="text-[15px] font-bold text-slate-900">How to delete your account</h2>
        <ol className="mt-2 list-decimal pl-5 space-y-2 text-[14px] text-slate-600 leading-relaxed">
          <li><span className="font-semibold text-slate-800">In the Ybex app:</span> open <span className="font-semibold">Profile</span> (creators) or <span className="font-semibold">Brand</span> (brands) at the bottom → <span className="font-semibold">Account</span> → <span className="font-semibold">Delete account</span>. On a computer: <span className="font-semibold">Settings → Account → Delete account</span>. We email you a code to confirm.</li>
          <li><span className="font-semibold text-slate-800">On this website:</span> log in below and press Delete account.</li>
          <li><span className="font-semibold text-slate-800">Can't log in?</span> Email <a href="mailto:privacy@ybexmedia.in?subject=Delete%20my%20Ybex%20account" className="font-semibold text-[#7C3AED]">privacy@ybexmedia.in</a> from the email address on your account with the subject "Delete my Ybex account". We reply to confirm it is you, then delete the account.</li>
        </ol>
        <p className="mt-3 text-[13px] text-slate-500">If money is still on hold in a deal (payment hold, payout or refund in progress), that deal is finished first — then the account can be deleted.</p>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <h2 className="text-[15px] font-bold text-slate-900">What is removed</h2>
        <p className="mt-1 text-[14px] text-slate-600 leading-relaxed">
          Your profile, photos, portfolio, chats, social links and saved bank / UPI details.
        </p>
        <h2 className="mt-4 text-[15px] font-bold text-slate-900">What is kept</h2>
        <p className="mt-1 text-[14px] text-slate-600 leading-relaxed">
          Payment and invoice records, which the law requires us to retain for tax and accounting. Your
          name is removed from them.
        </p>
        <h2 className="mt-4 text-[15px] font-bold text-slate-900">When</h2>
        <p className="mt-1 text-[14px] text-slate-600 leading-relaxed">
          Your account is hidden and you are signed out everywhere straight away. You have 30 days to change
          your mind by writing to support; after 30 days the account and the data above are removed for good.
        </p>
      </div>

      {user ? (
        <div className="mt-6 rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 pt-4 text-[13px] font-bold text-slate-500">Delete this account</div>
          <AccountPanel onOpen={() => {}} onDeleted={() => logout?.()} />
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-5">
          <p className="text-[14px] text-slate-700">To delete your account, first sign in, then open Delete account.</p>
          {/* v332: comes back to this page after login (it dropped people on Home) */}
          <Link to="/login?next=%2Fdelete-account" className="inline-flex mt-3 h-11 items-center px-5 rounded-xl text-white text-[14px] font-bold" style={{ background: "linear-gradient(135deg,#9B00FF,#5A00C8)" }}>
            Log in to delete
          </Link>
          <p className="mt-4 text-[13px] text-slate-500">
            Need help? Email <a href="mailto:support@ybexmedia.in" className="font-semibold text-[#7C3AED]">support@ybexmedia.in</a>.
          </p>
        </div>
      )}
    </div>
  );
}
