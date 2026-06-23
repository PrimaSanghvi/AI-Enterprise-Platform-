// Login module: a single fetch interceptor that (a) attaches the session token
// to every gateway request and (b) detects an expired/invalid session (401) and
// triggers a logout + redirect to the login page. Installed once at app start so
// the many scattered `fetch(${API_BASE}/...)` call sites don't each need editing.

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

// Resolved at RUNTIME from the gateway's GET /auth/config (see loadRuntimeConfig,
// called in main.tsx before render), so it reflects the deployed container's
// GOOGLE_CLIENT_ID env with no build-time value required. A build-time
// VITE_GOOGLE_CLIENT_ID, if present, is used only as a fallback.
// Exported as `let` so consumers (e.g. LoginPage) see the value via the live
// ES-module binding once loadRuntimeConfig() has run.
export let GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/**
 * Fetch browser-side config from the gateway and apply it. Call once at startup
 * (before rendering) so GOOGLE_CLIENT_ID is set before any component reads it.
 */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/auth/config`);
    if (res.ok) {
      const cfg = await res.json();
      if (cfg?.googleClientId) GOOGLE_CLIENT_ID = cfg.googleClientId;
    }
  } catch {
    // Endpoint unreachable — keep any build-time fallback value.
  }
}

const TOKEN_KEY = "rialto.session.token";
const USER_KEY = "rialto.session.user";

export interface SessionUser {
  email: string;
  name: string;
  expires_at: string;
}

let token: string | null = null;
let onExpire: ((message: string) => void) | null = null;
let installed = false;

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function loadStoredSession(): { token: string | null; user: SessionUser | null } {
  const storedToken = localStorage.getItem(TOKEN_KEY);
  const storedUser = localStorage.getItem(USER_KEY);
  token = storedToken;
  let user: SessionUser | null = null;
  try {
    user = storedUser ? JSON.parse(storedUser) : null;
  } catch {
    user = null;
  }
  return { token: storedToken, user };
}

export function storeUser(user: SessionUser | null): void {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function setExpireHandler(fn: (message: string) => void): void {
  onExpire = fn;
}

/** Exchange a Google ID token for a session. Throws Error(message) on rejection. */
export async function exchangeGoogleCredential(credential: string): Promise<SessionUser> {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || "Sign-in failed.");
  }
  setToken(data.token);
  const user: SessionUser = { email: data.email, name: data.name, expires_at: data.expires_at };
  storeUser(user);
  return user;
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

/**
 * Whether a request targets our own API — so we never attach the session token
 * (or react to 401s) for third-party requests. With an absolute API_BASE we
 * prefix-match it; in same-origin mode (API_BASE === "") a relative path counts,
 * and an absolute URL only counts if it matches our own origin.
 */
function isApiRequest(url: string): boolean {
  if (API_BASE) return url.startsWith(API_BASE);
  if (/^https?:\/\//i.test(url)) {
    try {
      return new URL(url).origin === window.location.origin;
    } catch {
      return false;
    }
  }
  return true; // relative URL → same origin
}

export function installFetchInterceptor(): void {
  if (installed) return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = resolveUrl(input);
    const isApi = isApiRequest(url);

    let nextInit = init;
    if (isApi && token) {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      nextInit = { ...init, headers };
    }

    const response = await original(input, nextInit);

    if (isApi && response.status === 401) {
      let message = "Your session has expired. Please log in again.";
      try {
        const data = await response.clone().json();
        if (data?.error) message = data.error;
      } catch {
        /* non-JSON body; keep default message */
      }
      onExpire?.(message);
    }
    return response;
  };
}
