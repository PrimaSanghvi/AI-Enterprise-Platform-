import json
from pathlib import Path

DISPLAY_NAME = "Neo4j Graph"

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


def _load(filename: str) -> dict | list:
    with open(FIXTURES_DIR / filename) as f:
        return json.load(f)


def get_relationships(company_id: str) -> dict | None:
    relationships = _load("relationships.json")
    return relationships.get(company_id)


def get_full_graph() -> dict:
    """Build a full graph of all companies and their relationships."""
    relationships = _load("relationships.json")
    companies = {c["company_id"]: c for c in _load("companies.json")}

    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    # Add company nodes
    for cid, company in companies.items():
        nodes[cid] = {
            "id": cid,
            "label": company["name"],
            "type": "company",
            "sector": company.get("sector", ""),
            "stage": company.get("stage", ""),
            "details": company.get("description", ""),
        }

    # Add relationship entities and edges
    for cid, data in relationships.items():
        for rel in data.get("relationships", []):
            eid = rel["entity_id"]
            if eid not in nodes:
                nodes[eid] = {
                    "id": eid,
                    "label": rel["name"],
                    "type": rel["type"],
                    "details": rel["details"],
                }
            edges.append({
                "source": cid,
                "target": eid,
                "relationship": rel["type"],
                "details": rel["details"],
            })

    return {"nodes": list(nodes.values()), "edges": edges}
