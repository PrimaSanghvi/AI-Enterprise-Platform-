"""Shared security primitives: session tokens, the internal service credential,
and the dual-credential check for the MCP mount.

Lives in `backend` (not `gateway`) so both the gateway and `backend/main.py` can
import it without a backend->gateway dependency. Reads its secrets from the
environment directly, the same way `backend/db.py` does.

- Session tokens (HS256, signed with SESSION_SECRET) are issued by the login flow
  in `gateway/auth.py` and validated here on every request.
- A long-lived *service* token (sub=SERVICE_SUBJECT) lets the gateway's own
  in-process MCP client authenticate to the now-protected /mcp mount.
- /mcp requires BOTH a valid internal token (MCP_INTERNAL_TOKEN) AND a valid
  session token (the service token, or a real user's).
"""
from __future__ import annotations

import hmac
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv

from backend.connectors import user_access

# Load the repo-root .env so secrets resolve regardless of which entrypoint
# (gateway or backend/main.py) imported this module. Idempotent.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SESSION_ALGORITHM = "HS256"
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-insecure-session-secret-change-me")
MCP_INTERNAL_TOKEN = os.getenv("MCP_INTERNAL_TOKEN", "")
EXPIRED_MESSAGE = "Your credentials have expired. Please log in again."

# Reserved subject for the gateway's internal MCP client (not a real user).
SERVICE_SUBJECT = "__gateway_service__"


class AuthError(Exception):
    """Raised for any auth failure. `expired` flags the 2-hour lockout."""

    def __init__(self, message: str, *, status: int = 401, expired: bool = False):
        super().__init__(message)
        self.message = message
        self.status = status
        self.expired = expired


def issue_session_token(email: str, expires_at) -> str:
    """Sign a session token that expires exactly when the access window closes."""
    payload = {"sub": email, "email": email, "exp": expires_at}
    return jwt.encode(payload, SESSION_SECRET, algorithm=SESSION_ALGORITHM)


def issue_service_token(ttl_days: int = 365) -> str:
    """Mint a long-lived token for the gateway's internal MCP client."""
    exp = datetime.now(timezone.utc) + timedelta(days=ttl_days)
    payload = {"sub": SERVICE_SUBJECT, "email": SERVICE_SUBJECT, "exp": exp}
    return jwt.encode(payload, SESSION_SECRET, algorithm=SESSION_ALGORITHM)


def decode_session_token(token: str) -> dict:
    """Validate a session token's signature + expiry. Raises AuthError on failure."""
    try:
        return jwt.decode(token, SESSION_SECRET, algorithms=[SESSION_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise AuthError(EXPIRED_MESSAGE, expired=True) from None
    except jwt.PyJWTError:
        raise AuthError("Invalid session token.") from None


def _active_user_from_payload(payload: dict) -> dict:
    """Resolve a decoded token to a live user, re-checking DB expiry (source of truth)."""
    email = payload.get("email") or payload.get("sub")
    record = user_access.get_user(email)
    if record is None:
        raise AuthError("Unknown user.")
    if user_access.now_utc() >= _as_datetime(record["expires_at"]):
        raise AuthError(EXPIRED_MESSAGE, expired=True)
    return {"email": email, "name": record.get("name"), "role": record.get("role")}


def require_active_user(token: str) -> dict:
    """Validate a session token AND re-check DB expiry. Returns {email, name, role}."""
    return _active_user_from_payload(decode_session_token(token))


def verify_internal_token(value: str | None) -> bool:
    """Constant-time check of the internal service token. Empty config => always fail."""
    if not MCP_INTERNAL_TOKEN or not value:
        return False
    return hmac.compare_digest(value, MCP_INTERNAL_TOKEN)


def verify_mcp_credentials(internal_token: str | None, session_token: str | None) -> dict:
    """Require BOTH a valid internal token and a valid session token for /mcp.

    The service principal (sub=SERVICE_SUBJECT) is accepted without a user_access
    lookup; any other subject must be a live, non-expired user.
    """
    if not verify_internal_token(internal_token):
        raise AuthError("Invalid or missing internal MCP credential.")
    if not session_token:
        raise AuthError("Missing session token for MCP.")
    payload = decode_session_token(session_token)
    if payload.get("sub") == SERVICE_SUBJECT:
        return {"email": SERVICE_SUBJECT, "name": "gateway-service", "role": "service"}
    return _active_user_from_payload(payload)


def _as_datetime(value):
    """user_access timestamps come back as ISO strings (db._normalize) or datetimes."""
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    return value
