import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  exchangeGoogleCredential,
  installFetchInterceptor,
  loadStoredSession,
  sendOTP as sendOTPClient,
  setExpireHandler,
  setToken,
  storeUser,
  verifyOTP as verifyOTPClient,
  type OTPSendResult,
  type SessionUser,
} from "./authClient";

interface AuthContextValue {
  user: SessionUser | null;
  isAuthenticated: boolean;
  /** Message shown on the login page after an expiry/redirect. */
  notice: string | null;
  setNotice: (message: string | null) => void;
  loginWithGoogle: (credential: string) => Promise<void>;
  /** Send OTP to email. Whitelisted domains return a session immediately and update auth state. */
  sendOTP: (email: string) => Promise<OTPSendResult>;
  /** Verify OTP code and log the user in. */
  loginWithOTP: (email: string, code: string) => Promise<void>;
  logout: (message?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isExpired(user: SessionUser | null): boolean {
  if (!user) return true;
  return new Date(user.expires_at).getTime() <= Date.now();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Install the fetch interceptor once and restore any stored session.
  useEffect(() => {
    installFetchInterceptor();
    const { token, user: storedUser } = loadStoredSession();
    if (token && storedUser && !isExpired(storedUser)) {
      setUser(storedUser);
    } else if (token) {
      // token present but past its window: clear it.
      setToken(null);
      storeUser(null);
    }
    setReady(true);
  }, []);

  const logout = useMemo(
    () => (message?: string) => {
      setToken(null);
      storeUser(null);
      setUser(null);
      if (message) setNotice(message);
    },
    [],
  );

  // When the interceptor sees a 401, log out and surface the server's message.
  useEffect(() => {
    setExpireHandler((message: string) => logout(message));
  }, [logout]);

  // Proactively log the user out the moment their 2-hour window elapses.
  useEffect(() => {
    if (!user) return;
    const ms = new Date(user.expires_at).getTime() - Date.now();
    if (ms <= 0) {
      logout("Your credentials have expired. Please log in again.");
      return;
    }
    const timer = setTimeout(
      () => logout("Your credentials have expired. Please log in again."),
      ms,
    );
    return () => clearTimeout(timer);
  }, [user, logout]);

  const loginWithGoogle = useMemo(
    () => async (credential: string) => {
      const newUser = await exchangeGoogleCredential(credential);
      setNotice(null);
      setUser(newUser);
    },
    [],
  );

  const sendOTP = useMemo(
    () => async (email: string): Promise<OTPSendResult> => {
      const result = await sendOTPClient(email);
      // Whitelisted domain: backend issued a session directly.
      if ("token" in result && result.token) {
        setToken(result.token);
        const whitelistedUser: SessionUser = {
          email: result.email,
          name: result.name || email.split("@")[0],
          expires_at: result.expires_at,
        };
        storeUser(whitelistedUser);
        setNotice(null);
        setUser(whitelistedUser);
      }
      return result;
    },
    [],
  );

  const loginWithOTP = useMemo(
    () => async (email: string, code: string) => {
      const newUser = await verifyOTPClient(email, code);
      setNotice(null);
      setUser(newUser);
    },
    [],
  );

  const value: AuthContextValue = {
    user,
    isAuthenticated: ready && !!user && !isExpired(user),
    notice,
    setNotice,
    loginWithGoogle,
    sendOTP,
    loginWithOTP,
    logout,
  };

  // Avoid a login-page flash before the stored session is restored.
  if (!ready) return null;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
