import os
from datetime import date, datetime
from decimal import Decimal

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = "ai_platform_db"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def _normalize(row: dict) -> dict:
    """Convert Postgres types (Decimal, date, datetime) to JSON-safe Python types."""
    result = {}
    for k, v in row.items():
        if isinstance(v, Decimal):
            result[k] = float(v)
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        elif isinstance(v, date):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


def query(sql: str, params=None) -> list[dict]:
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            return [_normalize(dict(row)) for row in cur.fetchall()]
    finally:
        conn.close()


def execute(sql: str, params=None) -> None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()
    finally:
        conn.close()
