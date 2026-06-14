"""Login module: Google ID-token verification and the 2-hour access-window rule.

Session-token primitives (issue/decode/validate) and the internal MCP credential
live in `backend.security` so `backend/main.py` can reuse them; this module keeps
the Google-specific verification and the login() policy.

Flow:
  1. Browser signs in with Google Identity Services and gets a Google ID token.
  2. POST /auth/google sends that token here. verify_google_token() validates it
     against Google's public keys and returns the email + name.
  3. login() applies the access-window rule against the user_access table and,
     on success, issues a session token whose expiry equals the user's expires_at.
  4. The gateway middleware calls require_active_user() on every protected request.
"""
from __future__ import annotations

from datetime import timedelta

import jwt
from jwt import PyJWKClient

from connectors import user_access
# Re-exported so existing imports (gateway.app) keep working.
from security import (  # noqa: F401
    AuthError,
    EXPIRED_MESSAGE,
    decode_session_token,
    issue_session_token,
    require_active_user,
    verify_mcp_credentials,
    _as_datetime,
)
from gateway.config import ACCESS_WINDOW_HOURS, GOOGLE_CLIENT_ID

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

# Reuse one JWKS client so Google's signing keys are cached between requests.
_jwk_client = PyJWKClient(GOOGLE_CERTS_URL)


def verify_google_token(credential: str) -> dict:
    """Validate a Google ID token and return its claims (email, name, ...)."""
    if not GOOGLE_CLIENT_ID:
        raise AuthError("Google sign-in is not configured (GOOGLE_CLIENT_ID missing).", status=500)
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(credential)
        claims = jwt.decode(
            credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=GOOGLE_CLIENT_ID,
        )
    except jwt.PyJWTError as exc:
        raise AuthError(f"Invalid Google token: {exc}") from None

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise AuthError("Invalid Google token issuer.")
    if not claims.get("email"):
        raise AuthError("Google token has no email.")
    if claims.get("email_verified") is False:
        raise AuthError("Google email is not verified.")
    return claims


def login(credential: str) -> dict:
    """Apply the 2-hour access-window rule. Returns the session payload on success.

    - First ever login for an email: record login_at=now, expires_at=now+2h, allow.
    - Subsequent login while now < expires_at: allowed (window is NOT extended).
    - Any login at/after expires_at: permanently rejected as expired.
    """
    claims = verify_google_token(credential)
    email = claims["email"]
    name = claims.get("name") or claims.get("given_name") or email

    now = user_access.now_utc()
    record = user_access.get_user(email)

    if record is None:
        expires_at = now + timedelta(hours=ACCESS_WINDOW_HOURS)
        record = user_access.create_user(email, name, login_at=now, expires_at=expires_at)
    else:
        expires_at = _as_datetime(record["expires_at"])
        if now >= expires_at:
            raise AuthError(EXPIRED_MESSAGE, status=403, expired=True)

    expires_at = _as_datetime(record["expires_at"])
    token = issue_session_token(email, expires_at)
    return {
        "token": token,
        "email": email,
        "name": record.get("name") or name,
        "role": record.get("role"),
        "expires_at": expires_at.isoformat(),
    }
