import json
from datetime import datetime, timezone
from pathlib import Path

DISPLAY_NAME = "Backstop CRM"

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


def _load(filename: str) -> list | dict:
    with open(FIXTURES_DIR / filename) as f:
        return json.load(f)


def _save(filename: str, data: list | dict) -> None:
    with open(FIXTURES_DIR / filename, "w") as f:
        json.dump(data, f, indent=2)


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
