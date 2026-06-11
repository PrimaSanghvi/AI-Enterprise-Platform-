import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

DISPLAY_NAME = "Backstop CRM"

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"

REQUIRED_DEAL_FIELDS = (
    "company_name",
    "sector",
    "stage",
    "status",
    "ask_amount",
    "valuation",
)


def _load(filename: str) -> list | dict:
    with open(FIXTURES_DIR / filename) as f:
        return json.load(f)


def _save(filename: str, data: list | dict) -> None:
    # TODO: file lock — concurrent writes are not atomic.
    with open(FIXTURES_DIR / filename, "w") as f:
        json.dump(data, f, indent=2)


def _next_id(existing_ids: list[str], prefix: str) -> str:
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    max_n = 0
    for value in existing_ids:
        match = pattern.match(value or "")
        if match:
            max_n = max(max_n, int(match.group(1)))
    return f"{prefix}-{max_n + 1:03d}"


def next_deal_id() -> str:
    deals = _load("deals.json")
    return _next_id([d.get("deal_id", "") for d in deals], "DEAL")


def next_company_id() -> str:
    companies = _load("companies.json")
    return _next_id([c.get("company_id", "") for c in companies], "CO")


def get_deal(deal_id: str) -> dict | None:
    deals = _load("deals.json")
    for deal in deals:
        if deal["deal_id"] == deal_id:
            return deal
    return None


def get_company(company_id: str) -> dict | None:
    companies = _load("companies.json")
    for company in companies:
        if company["company_id"] == company_id:
            return company
    return None


def list_deals() -> list[dict]:
    return _load("deals.json")


def write_triage_result(
    deal_id: str,
    decision: str,
    rationale: str,
    analyst: str = "AI Analyst",
    connectors_used: list[str] | None = None,
) -> dict | None:
    deals = _load("deals.json")
    for deal in deals:
        if deal["deal_id"] == deal_id:
            result = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "analyst": analyst,
                "decision": decision,
                "rationale": rationale,
                "connectors_used": connectors_used or [],
            }
            deal["triage_results"].append(result)
            _save("deals.json", deals)
            return deal
    return None


def create_company_stub(
    name: str,
    sector: str,
    stage: str,
    company_id: str | None = None,
) -> dict:
    companies = _load("companies.json")
    if company_id:
        for existing in companies:
            if existing["company_id"] == company_id:
                return existing
    else:
        company_id = next_company_id()

    stub = {
        "company_id": company_id,
        "name": name,
        "sector": sector,
        "stage": stage,
        "description": "(user-added stub)",
        "hq": "",
        "founded": None,
        "website": "",
        "source_meta": "user-added",
    }
    companies.append(stub)
    _save("companies.json", companies)
    return stub


def create_deal(payload: dict) -> dict:
    missing = [f for f in REQUIRED_DEAL_FIELDS if not payload.get(f) and payload.get(f) != 0]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    deals = _load("deals.json")
    existing_ids = {d.get("deal_id") for d in deals}

    deal_id = payload.get("deal_id") or next_deal_id()
    if deal_id in existing_ids:
        raise ValueError(f"Deal {deal_id} already exists")

    company_id = payload.get("company_id")
    if not company_id or not any(c["company_id"] == company_id for c in _load("companies.json")):
        stub = create_company_stub(
            name=payload["company_name"],
            sector=payload["sector"],
            stage=payload["stage"],
            company_id=company_id,
        )
        company_id = stub["company_id"]

    deal = {
        "deal_id": deal_id,
        "company_id": company_id,
        "company_name": payload["company_name"],
        "sector": payload["sector"],
        "stage": payload["stage"],
        "status": payload["status"],
        "source": payload.get("source") or "user-created",
        "date_received": payload.get("date_received") or date.today().isoformat(),
        "ask_amount": int(payload["ask_amount"]),
        "valuation": int(payload["valuation"]),
        "lead_partner": payload.get("lead_partner", ""),
        "triage_results": [],
    }
    deals.append(deal)
    _save("deals.json", deals)
    return deal
