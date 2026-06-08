from datetime import datetime, timezone

from backend.db import SCHEMA, execute, query

DISPLAY_NAME = "Backstop CRM"


def _attach_triage(deals: list[dict]) -> list[dict]:
    if not deals:
        return deals
    deal_ids = tuple(d["deal_id"] for d in deals)
    placeholders = ",".join(["%s"] * len(deal_ids))
    rows = query(
        f"SELECT * FROM {SCHEMA}.triage_results WHERE deal_id IN ({placeholders}) ORDER BY created_at ASC",
        deal_ids,
    )
    triage_map: dict[str, list] = {}
    for row in rows:
        triage_map.setdefault(row["deal_id"], []).append({
            "timestamp": row["created_at"],
            "analyst": row["analyst"],
            "decision": row["decision"],
            "rationale": row["rationale"],
        })
    for deal in deals:
        deal["triage_results"] = triage_map.get(deal["deal_id"], [])
    return deals


def get_deal(deal_id: str) -> dict | None:
    rows = query(f"SELECT * FROM {SCHEMA}.deals WHERE deal_id = %s", (deal_id,))
    if not rows:
        return None
    return _attach_triage(rows)[0]


def get_company(company_id: str) -> dict | None:
    rows = query(f"SELECT * FROM {SCHEMA}.companies WHERE company_id = %s", (company_id,))
    return rows[0] if rows else None


def list_deals() -> list[dict]:
    rows = query(f"SELECT * FROM {SCHEMA}.deals ORDER BY date_received DESC")
    return _attach_triage(rows)


def write_triage_result(
    deal_id: str,
    decision: str,
    rationale: str,
    analyst: str = "AI Analyst",
    connectors_used: list[str] | None = None,
) -> dict | None:
    execute(
        f"""
        INSERT INTO {SCHEMA}.triage_results (deal_id, analyst, decision, rationale, created_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (deal_id, analyst, decision, rationale, datetime.now(timezone.utc)),
    )
    return get_deal(deal_id)
