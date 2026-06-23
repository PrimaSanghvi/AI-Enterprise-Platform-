import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { GOOGLE_CLIENT_ID } from "../auth/authClient";

// Minimal typings for the Google Identity Services global (loaded in index.html).
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { loginWithGoogle, notice, setNotice } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Google sign-in is not configured (GOOGLE_CLIENT_ID is not set on the server).");
      return;
    }

    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      if (!window.google || !buttonRef.current) {
        // GIS script still loading; retry shortly.
        window.setTimeout(tryInit, 150);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential: string }) => {
          setError(null);
          setBusy(true);
          try {
            await loginWithGoogle(response.credential);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign-in failed.");
          } finally {
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        width: 280,
      });
    };
    tryInit();
    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle]);

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-page)] transition-colors duration-200">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 shadow-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            AI Enterprise Platform
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Sign in with your Google account to continue.
          </p>
        </div>

        {notice && (
          <div
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="alert"
          >
            {notice}
            <button
              onClick={() => setNotice(null)}
              className="float-right font-medium text-amber-700 hover:text-amber-900"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div
            className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <div ref={buttonRef} />
          {busy && (
            <p className="text-sm text-[var(--text-secondary)]">Signing you in…</p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          Access is granted for a 2-hour window from your first sign-in.
        </p>
      </div>
    </div>
  );
}
