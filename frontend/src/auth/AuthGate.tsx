import App from "../App";
import LoginPage from "../pages/LoginPage";
import { useAuth } from "./AuthContext";

/**
 * Gates the whole application behind authentication. App (and its data hooks)
 * only mount once the user is authenticated, so no API calls fire pre-login.
 */
export function AuthGate() {
  const { isAuthenticated, user, logout } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute right-4 top-3 z-50 flex items-center gap-3">
        <span className="pointer-events-auto rounded-full bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-secondary)] shadow">
          {user?.email}
        </span>
        <button
          onClick={() => logout()}
          className="pointer-events-auto rounded-full bg-[var(--bg-card)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] shadow hover:opacity-80"
        >
          Sign out
        </button>
      </div>
      <App />
    </div>
  );
}
