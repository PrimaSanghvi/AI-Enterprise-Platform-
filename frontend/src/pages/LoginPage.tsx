import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { GOOGLE_CLIENT_ID } from "../auth/authClient";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

type OTPStep = "email" | "code";

export default function LoginPage() {
  const { loginWithGoogle, sendOTP, loginWithOTP, notice, setNotice } = useAuth();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<OTPStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showGoogle = Boolean(GOOGLE_CLIENT_ID);

  // Initialise the Google button whenever GOOGLE_CLIENT_ID is available.
  useEffect(() => {
    if (!showGoogle) return;
    let cancelled = false;

    const tryInit = () => {
      if (cancelled) return;
      if (!window.google || !googleButtonRef.current) {
        window.setTimeout(tryInit, 150);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        use_fedcm_for_prompt: true,
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
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        width: 280,
      });
    };
    tryInit();
    return () => { cancelled = true; };
  }, [loginWithGoogle, showGoogle]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await sendOTP(email.trim());
      if ("whitelisted" in result && result.whitelisted) {
        // Auth state already updated inside sendOTP — AuthGate will redirect.
        return;
      }
      setInfo(`A 6-digit code was sent to ${email.trim()}.`);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await loginWithOTP(email.trim(), code.trim());
      // Auth state updated — AuthGate will redirect to the dashboard.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleBackToEmail() {
    setStep("email");
    setCode("");
    setError(null);
    setInfo(null);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-page)] transition-colors duration-200">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 shadow-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            AI Enterprise Platform
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {step === "email"
              ? "Sign in to continue."
              : `Enter the code sent to ${email}`}
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

        {info && (
          <div
            className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700"
            role="status"
          >
            {info}
          </div>
        )}

        {/* ── Google button (hidden when no client ID configured) ── */}
        {showGoogle && step === "email" && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div ref={googleButtonRef} />
              {busy && (
                <p className="text-sm text-[var(--text-secondary)]">Signing you in…</p>
              )}
            </div>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border-subtle)]" />
              <span className="text-xs text-[var(--text-secondary)]">or sign in with email</span>
              <div className="h-px flex-1 bg-[var(--border-subtle)]" />
            </div>
          </>
        )}

        {/* ── Email input (step 1) ── */}
        {step === "email" && (
          <form onSubmit={handleSendCode} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="w-full rounded-full bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send Code"}
            </button>
          </form>
        )}

        {/* ── Code input (step 2) ── */}
        {step === "code" && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              disabled={busy}
              autoFocus
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] px-4 py-2.5 text-center text-2xl tracking-[0.5em] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="w-full rounded-full bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={handleBackToEmail}
              disabled={busy}
              className="w-full rounded-full border border-[var(--border-subtle)] py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              ← Back
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          Access is granted for a 2-hour window from your first sign-in.
        </p>
      </div>
    </div>
  );
}
