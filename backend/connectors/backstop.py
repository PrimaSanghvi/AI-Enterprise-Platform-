from db import SCHEMA, execute, query
import re
from datetime import date, datetime, timezone

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


def _next_id(existing_ids: list[str], prefix: str) -> str:
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    max_n = 0
    for value in existing_ids:
        match = pattern.match(value or "")
        if match:
            max_n = max(max_n, int(match.group(1)))
    return f"{prefix}-{max_n + 1:03d}"


def next_deal_id() -> str:
    rows = query(f"SELECT deal_id FROM {SCHEMA}.deals")
    return _next_id([r["deal_id"] for r in rows], "DEAL")


def next_company_id() -> str:
    rows = query(f"SELECT company_id FROM {SCHEMA}.companies")
    return _next_id([r["company_id"] for r in rows], "CO")


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


def create_company_stub(
    name: str,
    sector: str,
    stage: str,
    company_id: str | None = None,
) -> dict:
    """Insert a minimal company record. Returns the existing record if company_id already exists."""
    if company_id:
        existing = get_company(company_id)
        if existing:
            return existing
    else:
        company_id = next_company_id()
    execute(
        f"""
        INSERT INTO {SCHEMA}.companies (company_id, name, sector, stage)
        VALUES (%s, %s, %s, %s)
        """,
        (company_id, name, sector, stage),
    )
    return get_company(company_id)


REQUIRED_DEAL_FIELDS = ("company_name", "sector", "stage", "status", "ask_amount", "valuation")


def create_deal(payload: dict) -> dict:
    """Insert a new deal into the pipeline. Generates deal_id / company_id when not supplied."""
    missing = [f for f in REQUIRED_DEAL_FIELDS if payload.get(f) in (None, "")]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    deal_id = payload.get("deal_id") or next_deal_id()
    if get_deal(deal_id):
        raise ValueError(f"Deal {deal_id} already exists")

    company_id = payload.get("company_id")
    if not company_id:
        company = create_company_stub(
            name=payload["company_name"],
            sector=payload["sector"],
            stage=payload["stage"],
        )
        company_id = company["company_id"]

    date_received = payload.get("date_received") or date.today().isoformat()

    execute(
        f"""
        INSERT INTO {SCHEMA}.deals
            (deal_id, company_id, company_name, sector, stage, status,
             source, date_received, ask_amount, valuation, lead_partner)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            deal_id,
            company_id,
            payload["company_name"],
            payload["sector"],
            payload["stage"],
            payload["status"],
            payload.get("source"),
            date_received,
            payload["ask_amount"],
            payload["valuation"],
            payload.get("lead_partner"),
        ),
    )
    return get_deal(deal_id)
