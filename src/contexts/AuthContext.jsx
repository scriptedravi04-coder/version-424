import React, { createContext, useContext, useEffect, useState } from "react";
import { safeJsonParse } from "../utils/safeFormat";
import { api } from "../lib/api";
import { toast } from "sonner";
import { safeStorage } from "../utils/storage";
import { rememberMediaKey, forgetMediaKey } from "../lib/mediaKey";
import { clearSnapshots } from "../lib/apiSnapshot";
import { useLiveRefresh } from "../lib/liveRefresh";
import { sendSignupSource } from "../lib/signupSource";
import { releasePushOnLogout } from "../lib/push";
import { isOffline } from "../lib/offline";
import { isServerDown } from "../lib/serverStatus"; // v364
import { clearOutbox } from "../lib/outbox"; // v364
import { clearUserDrafts } from "../lib/userDraft"; // v423 (S9)

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kycStatus, setKycStatus] = useState(null);
  const [kycLoading, setKycLoading] = useState(false);

  const isKycApproved = Boolean(
    kycStatus?.status === "approved" ||
    kycStatus?.status === "APPROVED" ||
    user?.kyc_verified === true ||
    user?.kyc_status === "approved" ||
    user?.kyc_status === "APPROVED"
  );

  const fetchKycStatus = async (currentUser) => {
    const targetUser = currentUser || user;
    if (!targetUser || targetUser.role === 'admin' || targetUser.team_role === 'sub_admin') {
      setKycStatus(null);
      return null;
    }
    try {
      setKycLoading(true);
      const { data } = await api.get("verifications/me").catch(() => ({ data: null }));
      setKycStatus(data);
      return data;
    } catch {
      setKycStatus(null);
      return null;
    } finally {
      setKycLoading(false);
    }
  };

  // Session 58: tell the server where a brand-new account came from (Growth page). Once, never blocks anything.
  useEffect(() => {
    if (user?.user_id) sendSignupSource(api, user);
  }, [user?.user_id]);

  useEffect(() => {
    if (user?.user_id) {
      fetchKycStatus(user);
    } else {
      setKycStatus(null);
    }
  }, [user?.user_id]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = safeStorage.getItem("ybex_token");
        if (!token) {
          setUser(null);
          setLoading(false);
          return;
        }

        // v334 (offline app): no internet → open at once with the saved login (no waiting for the check to fail).
        // The login is checked again when the app opens online; a logged-out answer still logs out.
        // v364: same while the Ybex server is updating (phone online, server not answering).
        if (isOffline() || isServerDown()) {
          const saved = safeJsonParse(safeStorage.getItem("ybex_user"), null);
          if (saved && (saved.user_id || saved.id)) {
            setUser(saved);
            fetchKycStatus(saved);
            return; // finally → setLoading(false)
          }
        }

        const meRes = await api.get("auth/me");
        const { data } = meRes;
        // v364: server updating (HTML page / no real answer) is NOT "logged out" — keep the saved login.
        if (meRes?.serverDown || Array.isArray(data) || (isServerDown() && !(data && (data.user || data.user_id)))) {
          const saved = safeJsonParse(safeStorage.getItem("ybex_user"), null);
          setUser(saved && (saved.user_id || saved.id) ? saved : null);
          if (saved && (saved.user_id || saved.id)) fetchKycStatus(saved);
          return;
        }
        rememberMediaKey(data);
        if (data && data.user) {
          // v344: keep the same object when nothing changed
          setUser(prev => (JSON.stringify(prev) === JSON.stringify(data.user) ? prev : data.user));
          safeStorage.setItem("ybex_user", JSON.stringify(data.user));
          fetchKycStatus(data.user);
        } else if (data && data.user_id) {
          setUser(prev => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
          safeStorage.setItem("ybex_user", JSON.stringify(data));
          fetchKycStatus(data);
        } else {
          // Token is invalid/expired
          setUser(null);
          safeStorage.removeItem("ybex_token");
          forgetMediaKey(); clearSnapshots(); clearOutbox();
          safeStorage.removeItem("ybex_user");
        }
      } catch (err) {
        console.error("Error fetching session from backend:", err);
        if (err.response?.status === 403 || err.response?.status === 401) {
          setUser(null);
          safeStorage.removeItem("ybex_token");
          forgetMediaKey(); clearSnapshots(); clearOutbox();
          safeStorage.removeItem("ybex_user");
          if (err.response?.data?.detail) {
             toast.error(err.response.data.detail, { duration: 8000 });
          }
          setLoading(false);
          return;
        }
        const savedUser = safeStorage.getItem("ybex_user");
        if (savedUser) {
          try {
            const parsed = JSON.parse(savedUser);
            setUser(parsed);
            fetchKycStatus(parsed);
          } catch (e) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (email, password, appRole = undefined) => {
    try {
      setLoading(true);
      const res = await api.post("auth/login", { email: (email || '').trim(), password, ...(appRole ? { app_role: appRole } : {}) });
      const data = res?.data;
      
      if (data && data.requiresVerification) {
         return data;
      }
      
      if (data && data.token) {
        safeStorage.setItem("ybex_token", data.token);
        safeStorage.setItem("ybex_user", JSON.stringify(data.user));
        setUser(data.user);
        // v344: store media_key right after login (login reply may not carry it → ask auth/me); never blocks login
        rememberMediaKey(data);
        Promise.resolve().then(() => refreshUser()).catch(() => {});
        return data.user;
      }
      if (data && (data.detail || data.error || data.message)) {
        const customErr = new Error(data.detail || data.error || data.message || "Login failed");
        customErr.response = res;
        throw customErr;
      }
      throw new Error("Invalid response from server");
    } catch (error) {
      console.error("Error signing in:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (name, email, password, role = "creator", phone = "", referralCode = "", consent = {}) => {
    try {
      setLoading(true);
      const res = await api.post("auth/signup", {
        name,
        email: (email || '').trim(),
        password,
        role,
        phone,
        referral_code: referralCode || null,
      });
      const data = res?.data;
      
      if (data && data.requiresVerification) {
         return data;
      }

      if (data && data.token) {
        safeStorage.setItem("ybex_token", data.token);
        safeStorage.setItem("ybex_user", JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
      }
      if (data && (data.detail || data.error || data.message)) {
        const customErr = new Error(data.detail || data.error || data.message || "Signup failed");
        customErr.response = res;
        throw customErr;
      }
      throw new Error("Invalid response from server");
    } catch (error) {
      console.error("Error signing up:", error);
      const errorMessage = error.response?.data?.detail || error.response?.data?.error || error.message || "Signup failed";
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await releasePushOnLogout(); // Session 58: before the token is gone (the server needs to know whose phone it is)
      await api.post("auth/logout").catch(() => {});
    } finally {
      try { clearUserDrafts(); } catch { /* storage blocked */ } // v423 (S9): before ybex_user is gone (the keys carry its id)
      safeStorage.removeItem("ybex_token");
          forgetMediaKey(); clearSnapshots(); clearOutbox();
      safeStorage.removeItem("ybex_user");
      // v419 (Eva review M6): the open Eva chat must not stay for the next person on this phone.
      try { Object.keys(sessionStorage).filter((k) => k.startsWith("yb_eva_sess_")).forEach((k) => sessionStorage.removeItem(k)); } catch { /* blocked */ }
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const { data } = await api.get("auth/me");
        rememberMediaKey(data);
      if (data && (data.user || data.user_id)) {
        const u = data.user || data;
        // v344: keep the same object when nothing changed so [user] effects don't refetch every 60 s
        setUser(prev => (JSON.stringify(prev) === JSON.stringify(u) ? prev : u));
        safeStorage.setItem("ybex_user", JSON.stringify(u));
        fetchKycStatus(u).catch(() => {});
        return u;
      }
    } catch (err) {
      console.error("Error refreshing user:", err);
      if (err.response?.status === 403 || err.response?.status === 401) {
          setUser(null);
          safeStorage.removeItem("ybex_token");
          forgetMediaKey(); clearSnapshots(); clearOutbox();
          safeStorage.removeItem("ybex_user");
          if (err.response?.data?.detail) {
             toast.error(err.response.data.detail, { duration: 8000 });
          }
          return null;
      }
    }
    const local = safeStorage.getItem("ybex_user");
    // Corrupt localStorage here used to throw during auth bootstrap — above the router, so
    // no page boundary could catch it and the app simply would not start. A bad cached
    // user now reads as logged-out, which the app already knows how to handle.
    return safeJsonParse(local, null);
  };

  // Session 28: KYC approved/rejected while the site is open → the badge, the Launch button and
  // every KYC gate update without a page refresh. Until approved, also re-checked every minute.
  const isStaffUser = user?.role === 'admin' || user?.team_role === 'sub_admin';
  useLiveRefresh(() => refreshUser(), {
    types: ["kyc", "verification", "profile_approved"],
    intervalMs: isKycApproved ? 0 : 60000,
    focusMinGapMs: 60000,
    enabled: Boolean(user?.user_id) && !isStaffUser,
  });

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signup, 
      login, 
      logout, 
      refreshUser, 
      setUser,
      kycStatus,
      setKycStatus,
      isKycApproved,
      kycLoading,
      refreshKycStatus: () => fetchKycStatus(user)
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      loading: true,
      signup: async () => {},
      login: async () => {},
      logout: async () => {},
      refreshUser: async () => null,
      setUser: () => {},
      kycStatus: null,
      setKycStatus: () => {},
      isKycApproved: false,
      kycLoading: false,
      refreshKycStatus: async () => null,
    };
  }
  return context;
};
