import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import { Lock, Mail, Eye, EyeOff, LogOut, ArrowRight, ArrowLeft, ShieldAlert } from "lucide-react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { user, login, logout, loading: authLoading } = useAuth();
  const { isBusy, begin, end } = useBusy();
  const navigate = useNavigate();

  const isAdmin = user && (user.role === "admin" || user.team_role === "sub_admin");

  // Redirect if already logged in as admin
  useEffect(() => {
    if (!authLoading && isAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [isAdmin, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please enter both email and password.");
      return;
    }

    begin("admin-login");
    try {
      const loggedInUser = await login(email.trim(), password);
      if (loggedInUser?.role === "admin" || loggedInUser?.team_role === "sub_admin") {
        toast.success("Authentication successful. Welcome to Admin Portal.");
        navigate("/admin", { replace: true });
      } else {
        toast.error("This account is not an admin account."); // v332: plain words
        await logout();
      }
    } catch (err) {
      console.error("[AdminLogin] Authentication error:", err);
      // v332: never show raw tech text ("Request failed with status code 401" / "Network Error").
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.detail || err?.response?.data?.error;
      toast.error(
        typeof serverMsg === "string" && serverMsg && serverMsg.length < 140 ? serverMsg
          : !err?.response ? "Couldn't reach the server. Please check your internet and try again."
          : status === 401 || status === 400 ? "Wrong email or password."
          : "Couldn't sign in right now. Please try again."
      );
    } finally {
      end("admin-login");
    }
  };

  const handleLogoutExisting = async () => {
    begin("logout");
    try {
      await logout();
      toast.success("Signed out. You can now sign in with an admin account.");
    } catch { // v332: failed logout no longer silent
      toast.error("Couldn't sign out. Please try again.");
    } finally {
      end("logout");
    }
  };

  // Session 30: layout from Ravi's "Admin Login" design (Claude Design). Same login logic as before.
  const inputBox = "flex items-center gap-3 h-14 px-4 border border-[#E5E7EB] rounded-[14px] bg-white focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#7C3AED]/15 transition";
  return (
    <div
      className="min-h-screen box-border px-5 py-12 flex items-center justify-center text-[#0A0A0A]"
      style={{ background: "radial-gradient(700px 420px at 50% 30%, #EEE7FF 0%, rgba(244,243,248,0) 70%), #F4F3F8", fontFamily: "'DM Sans', sans-serif" }}
    >
      <div className="w-full max-w-[500px] flex flex-col items-center gap-9">
        <div className="flex flex-col items-center gap-5 text-center">
          <Link to="/" className="text-[40px] font-bold tracking-[-0.04em] text-[#0F0D1A]">Ybex</Link>
          <div className="flex flex-col gap-2.5">
            <h1 className="m-0 text-[32px] sm:text-[36px] font-bold tracking-[-0.02em] leading-[1.15]">Admin sign in</h1>
            <p className="m-0 text-[17px] text-[#6B7280]">Authorized staff only.</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full box-border bg-white border border-[#ECEAF2] rounded-3xl p-6 sm:p-9 flex flex-col gap-[22px]"
          style={{ boxShadow: "0 1px 2px rgba(16,12,40,.04), 0 16px 40px -14px rgba(76,29,149,.16)" }}
        >
          {user && !isAdmin && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm min-w-0">
                <p className="font-semibold truncate">Signed in as {user.email}</p>
                <p className="mt-1 text-xs">This account is not an admin account.</p>
                <button
                  type="button"
                  onClick={handleLogoutExisting}
                  disabled={isBusy("logout")}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-60"
                >
                  {isBusy("logout") && <ButtonSpinner />}
                  <LogOut className="w-3.5 h-3.5" /> Sign out and switch
                </button>
              </div>
            </div>
          )}

          <label className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold text-[#374151]">Email</span>
            <div className={inputBox}>
              <Mail className="w-5 h-5 text-[#6B7280] shrink-0" strokeWidth={1.8} />
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@ybex.io"
                className="flex-1 min-w-0 border-none outline-none bg-transparent text-base text-[#0A0A0A] placeholder-[#9CA3AF]"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold text-[#374151]">Password</span>
            <div className={`${inputBox} pr-2`}>
              <Lock className="w-5 h-5 text-[#6B7280] shrink-0" strokeWidth={1.8} />
              <input
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="flex-1 min-w-0 border-none outline-none bg-transparent text-base text-[#0A0A0A] placeholder-[#9CA3AF]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="w-11 h-11 rounded-[10px] flex items-center justify-center text-[#6B7280] hover:bg-[#F5F0FF] transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-5 h-5" strokeWidth={1.8} /> : <Eye className="w-5 h-5" strokeWidth={1.8} />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={isBusy("admin-login")}
            className="mt-2 h-[58px] w-full rounded-2xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[17px] font-semibold flex items-center justify-center gap-2.5 whitespace-nowrap transition disabled:opacity-70 cursor-pointer"
            style={{ boxShadow: "0 10px 24px -10px rgba(124,58,237,.6)" }}
          >
            {isBusy("admin-login") ? <ButtonSpinner /> : null}
            Sign in
            <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.2} />
          </button>
        </form>

        <Link to="/login" className="inline-flex items-center gap-2 min-h-11 text-[15px] font-medium text-[#6B7280] hover:text-[#0A0A0A] transition">
          <ArrowLeft className="w-4 h-4" /> Back to standard login
        </Link>
      </div>
    </div>
  );
}
