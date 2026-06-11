"""Data access for the login module's user_access table.

The 2-hour window is anchored at the user's first login: login_at and
expires_at are written once on creation and never updated, so once
expires_at passes the email is permanently locked out.
"""
from datetime import datetime, timezone

from backend.db import SCHEMA, execute, query


def get_user(email: str) -> dict | None:
    rows = query(f"SELECT * FROM {SCHEMA}.user_access WHERE email = %s", (email,))
    return rows[0] if rows else None


def create_user(email: str, name: str, login_at: datetime, expires_at: datetime) -> dict:
    execute(
        f"""
        INSERT INTO {SCHEMA}.user_access (email, name, login_at, expires_at)
        VALUES (%s, %s, %s, %s)
        """,
        (email, name, login_at, expires_at),
    )
    return get_user(email)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
