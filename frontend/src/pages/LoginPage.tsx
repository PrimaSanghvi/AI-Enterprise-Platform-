import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useTenant } from "../contexts/TenantContext";
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

type Tab = "google" | "email";
type OTPStep = "email" | "code";

const SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function LoginPage() {
  const { loginWithGoogle, sendOTP, loginWithOTP, notice, setNotice } = useAuth();
  const tenant = useTenant();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const showGoogle = Boolean(GOOGLE_CLIENT_ID);

  const [tab, setTab] = useState<Tab>(showGoogle ? "google" : "email");
  const [otpStep, setOtpStep] = useState<OTPStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-initialise the Google button every time the Google Auth tab becomes
  // active. The button's container unmounts whenever the user switches to
  // the Email Login tab, so GIS must be told to draw it again into the
  // freshly-mounted node when the user switches back — otherwise the
  // button silently fails to reappear.
  useEffect(() => {
    if (!showGoogle || tab !== "google") return;
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
        shape: "rectangular",
        logo_alignment: "left",
        width: googleButtonRef.current.offsetWidth || 380,
      });
    };
    tryInit();
    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle, showGoogle, tab]);

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
      setOtpStep("code");
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

  async function handleResendCode() {
    if (!email.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      await sendOTP(email.trim());
      setInfo(`A new code was sent to ${email.trim()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resend code.");
    } finally {
      setBusy(false);
    }
  }

  function handleBackToEmail() {
    setOtpStep("email");
    setCode("");
    setError(null);
    setInfo(null);
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setError(null);
    setInfo(null);
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#ebebeb] px-4"
      style={{ fontFamily: SYSTEM_FONT_STACK }}
    >
      <div
        className="w-full max-w-[480px] rounded-[24px] bg-white"
        style={{
          paddingTop: "2.75rem",
          paddingLeft: "2.5rem",
          paddingRight: "2.5rem",
          paddingBottom: "2.25rem",
          boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.08)",
        }}
      >
        <div className="flex flex-col items-center text-center">
          {tenant.logo && (
            <img
              src={tenant.logo}
              alt={tenant.name}
              className="h-20 w-20 rounded-2xl object-cover"
            />
          )}
          <h1 className="mt-4 text-[28px] font-bold text-[#111111]">{tenant.name}</h1>
          <p className="mt-1 text-xs font-semibold tracking-[0.15em] text-gray-400">
            {tenant.subtitle}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="mt-6 flex rounded-lg bg-[#f3f4f6] p-1">
          <button
            type="button"
            onClick={() => switchTab("google")}
            className={`flex-1 rounded-md py-2 text-sm transition-colors ${
              tab === "google"
                ? "bg-white font-bold text-[#111111] shadow-sm"
                : "font-medium text-gray-500"
            }`}
          >
            Google Auth
          </button>
          <button
            type="button"
            onClick={() => switchTab("email")}
            className={`flex-1 rounded-md py-2 text-sm transition-colors ${
              tab === "email"
                ? "bg-white font-bold text-[#111111] shadow-sm"
                : "font-medium text-gray-500"
            }`}
          >
            Email Login
          </button>
        </div>

        {notice && (
          <div
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
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
            className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {info && (
          <div
            className="mt-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700"
            role="status"
          >
            {info}
          </div>
        )}

        {tab === "google" ? (
          <div className="mt-6">
            <p className="text-center text-sm text-gray-500">
              Sign in with your Google account
            </p>
            {showGoogle ? (
              <>
                <div className="mt-4 flex w-full justify-center">
                  <div ref={googleButtonRef} className="w-full" />
                </div>
                {busy && (
                  <p className="mt-3 text-center text-sm text-gray-500">Signing you in…</p>
                )}
              </>
            ) : (
              <p className="mt-4 text-center text-sm text-gray-400">
                Google sign-in is not configured for this environment.
              </p>
            )}
            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <ClockIcon />
              Access is limited to 2 hours from your first sign-in.
            </p>
          </div>
        ) : (
          <div className="mt-6">
            {otpStep === "email" ? (
              <form onSubmit={handleSendCode} className="flex flex-col gap-3">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                  className="w-full rounded-lg border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/70 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send Code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
                <p className="text-center text-sm text-gray-500">
                  Enter the code sent to {email}
                </p>
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
                  className="w-full rounded-lg border border-[#e5e7eb] bg-white px-4 py-2.5 text-center font-mono text-2xl tracking-[0.5em] text-[#111111] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-black/70 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {busy ? "Verifying…" : "Verify Code"}
                </button>
                <div className="flex items-center justify-between px-1 text-sm">
                  <button
                    type="button"
                    onClick={handleBackToEmail}
                    disabled={busy}
                    className="text-gray-500 hover:text-[#111111] disabled:opacity-50"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={busy}
                    className="font-medium text-[#111111] hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}
            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <ClockIcon />
              A 6-digit code will be sent to your email.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
