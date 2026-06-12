"""Data access for the login module's user_access table.

The 2-hour window is anchored at the user's first login: login_at and
expires_at are written once on creation and never updated, so once
expires_at passes the email is permanently locked out.

Each row also carries a `role` (Analyst | Senior Analyst | Platform Admin) used
to gate privileged operations such as policy-rule mutations. New users default
to 'Analyst' unless their email is listed in BOOTSTRAP_ADMIN_EMAILS, which lets
the first administrator sign in without manual SQL.
"""
import os
from datetime import datetime, timezone

from backend.db import SCHEMA, execute, query

DEFAULT_ROLE = "Analyst"
ADMIN_ROLE = "Platform Admin"


def _bootstrap_admins() -> set[str]:
    raw = os.getenv("BOOTSTRAP_ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def get_user(email: str) -> dict | None:
    rows = query(f"SELECT * FROM {SCHEMA}.user_access WHERE email = %s", (email,))
    return rows[0] if rows else None


def create_user(email: str, name: str, login_at: datetime, expires_at: datetime) -> dict:
    role = ADMIN_ROLE if email.lower() in _bootstrap_admins() else DEFAULT_ROLE
    execute(
        f"""
        INSERT INTO {SCHEMA}.user_access (email, name, login_at, expires_at, role)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (email, name, login_at, expires_at, role),
    )
    return get_user(email)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
