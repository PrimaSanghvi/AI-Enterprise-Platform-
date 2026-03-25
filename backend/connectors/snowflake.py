import json
from pathlib import Path

DISPLAY_NAME = "Snowflake"

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


def _load(filename: str) -> list:
    with open(FIXTURES_DIR / filename) as f:
        return json.load(f)


def portfolio_overlap(sector: str) -> list[dict]:
    data = _load("portfolio.json")
    return [entry for entry in data if entry["sector"].lower() == sector.lower()]
