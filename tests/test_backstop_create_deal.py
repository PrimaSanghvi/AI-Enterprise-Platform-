import json
from pathlib import Path

import pytest

from backend.connectors import backstop


@pytest.fixture
def isolated_fixtures(tmp_path, monkeypatch):
    """Copy deals.json + companies.json into a tmp dir and point the connector at it."""
    real_dir = backstop.FIXTURES_DIR
    tmp_fixtures = tmp_path / "fixtures"
    tmp_fixtures.mkdir()
    for name in ("deals.json", "companies.json"):
        (tmp_fixtures / name).write_text((real_dir / name).read_text())
    monkeypatch.setattr(backstop, "FIXTURES_DIR", tmp_fixtures)
    return tmp_fixtures


def _read(path: Path) -> list[dict]:
    return json.loads(path.read_text())


def test_next_deal_id_increments(isolated_fixtures):
    before = _read(isolated_fixtures / "deals.json")
    expected_n = max(int(d["deal_id"].split("-")[1]) for d in before) + 1
    assert backstop.next_deal_id() == f"DEAL-{expected_n:03d}"


def test_create_deal_persists_and_autofills(isolated_fixtures):
    payload = {
        "company_name": "Acme AI",
        "company_id": "CO-001",  # existing
        "sector": "Healthcare",
        "stage": "Series A",
        "status": "new",
        "ask_amount": 5_000_000,
        "valuation": 25_000_000,
    }
    created = backstop.create_deal(payload)

    assert created["deal_id"].startswith("DEAL-")
    assert created["company_id"] == "CO-001"
    assert created["source"] == "user-created"
    assert created["date_received"]  # auto-filled
    assert created["triage_results"] == []

    persisted = _read(isolated_fixtures / "deals.json")
    assert any(d["deal_id"] == created["deal_id"] for d in persisted)


def test_create_deal_missing_field_raises(isolated_fixtures):
    with pytest.raises(ValueError, match="Missing required fields"):
        backstop.create_deal(
            {"company_name": "X", "sector": "Healthcare", "stage": "Seed", "status": "new"}
        )


def test_create_deal_duplicate_id_raises(isolated_fixtures):
    existing = _read(isolated_fixtures / "deals.json")[0]["deal_id"]
    with pytest.raises(ValueError, match="already exists"):
        backstop.create_deal(
            {
                "deal_id": existing,
                "company_name": "X",
                "company_id": "CO-001",
                "sector": "Healthcare",
                "stage": "Seed",
                "status": "new",
                "ask_amount": 1,
                "valuation": 1,
            }
        )


def test_create_deal_stubs_unknown_company(isolated_fixtures):
    created = backstop.create_deal(
        {
            "company_name": "Brand New Co",
            "sector": "Climate",
            "stage": "Seed",
            "status": "new",
            "ask_amount": 1_000_000,
            "valuation": 5_000_000,
        }
    )
    assert created["company_id"].startswith("CO-")
    companies = _read(isolated_fixtures / "companies.json")
    stub = next(c for c in companies if c["company_id"] == created["company_id"])
    assert stub["source_meta"] == "user-added"
    assert stub["name"] == "Brand New Co"


def test_create_company_stub_returns_existing_when_id_matches(isolated_fixtures):
    existing = _read(isolated_fixtures / "companies.json")[0]
    result = backstop.create_company_stub(
        name="Different Name", sector="Healthcare", stage="Series A", company_id=existing["company_id"]
    )
    assert result["company_id"] == existing["company_id"]
    assert result["name"] == existing["name"]  # not overwritten
