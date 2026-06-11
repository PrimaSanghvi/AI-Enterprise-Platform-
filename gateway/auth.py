"""Login module: Google ID-token verification, the 2-hour access-window rule,
and our own short-lived session tokens.

Flow:
  1. Browser signs in with Google Identity Services and gets a Google ID token.
  2. POST /auth/google sends that token here. verify_google_token() validates it
     against Google's public keys and returns the email + name.
  3. login() applies the access-window rule against the user_access table and,
     on success, issues a session token (issue_session_token) whose expiry equals
     the user's expires_at, so the token dies exactly when the window closes.
  4. The auth middleware calls decode_session_token() on every protected request
     and re-checks the DB expiry (the source of truth).
"""
from __future__ import annotations

from datetime import timedelta

import jwt
from jwt import PyJWKClient

from backend.connectors import user_access
from gateway.config import (
    ACCESS_WINDOW_HOURS,
    GOOGLE_CLIENT_ID,
    SESSION_SECRET,
)

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
SESSION_ALGORITHM = "HS256"
EXPIRED_MESSAGE = "Your credentials have expired. Please log in again."

# Reuse one JWKS client so Google's signing keys are cached between requests.
_jwk_client = PyJWKClient(GOOGLE_CERTS_URL)


class AuthError(Exception):
    """Raised for any login/verification failure. `expired` flags the 2-hour lockout."""

    def __init__(self, message: str, *, status: int = 401, expired: bool = False):
        super().__init__(message)
        self.message = message
        self.status = status
        self.expired = expired


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


def issue_session_token(email: str, expires_at) -> str:
    """Sign a session token that expires exactly when the access window closes."""
    payload = {"sub": email, "email": email, "exp": expires_at}
    return jwt.encode(payload, SESSION_SECRET, algorithm=SESSION_ALGORITHM)


def decode_session_token(token: str) -> dict:
    """Validate our own session token. Raises AuthError(expired=True) once it lapses."""
    try:
        return jwt.decode(token, SESSION_SECRET, algorithms=[SESSION_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise AuthError(EXPIRED_MESSAGE, expired=True) from None
    except jwt.PyJWTError:
        raise AuthError("Invalid session token.") from None


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
        "expires_at": expires_at.isoformat(),
    }


def require_active_user(token: str) -> dict:
    """Used by the middleware: validate the session token AND re-check DB expiry."""
    payload = decode_session_token(token)
    email = payload.get("email") or payload.get("sub")
    record = user_access.get_user(email)
    if record is None:
        raise AuthError("Unknown user.")
    if user_access.now_utc() >= _as_datetime(record["expires_at"]):
        raise AuthError(EXPIRED_MESSAGE, expired=True)
    return {"email": email, "name": record.get("name")}


def _as_datetime(value):
    """user_access timestamps come back as ISO strings (db._normalize) or datetimes."""
    if isinstance(value, str):
        from datetime import datetime

        return datetime.fromisoformat(value)
    return value
